import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes";
import { commerceRouter } from "./routes/commerce.routes";
import { disputesRouter } from "./routes/disputes.routes";
import { adminRouter } from "./routes/admin.routes";
import { internalRouter } from "./routes/internal.routes";
import { workspaceRouter } from "./routes/workspace.routes";
import { startDurableOutboxWorker } from "./integrations/outbox.worker";
import { StorageAdapter } from "./integrations/storage.adapter";

const app = express();

app.use(
  cors({
    origin: process.env.WEB_ORIGIN || "http://localhost:3000",
    credentials: true,
  })
);
app.use(cookieParser());

// Preserve rawBody for PayPal Webhook Signature Verification
app.use(
  express.json({
    limit: "5mb",
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString("utf8");
    },
  })
);

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "velapal-v6.1-express-api",
    timestamp: new Date().toISOString(),
  });
});

// Storage upload endpoint for local development / MinIO fallback
app.put(
  "/api/v1/storage/upload",
  express.raw({ type: "*/*", limit: "5mb" }),
  async (req, res) => {
    try {
      const key = req.query.key as string;
      const mime = req.query.mime as string;
      const expires = req.query.expires as string;
      const signature = req.query.signature as string;
      if (!key || !mime || !expires || !signature || !StorageAdapter.verifyLocalUpload(key, mime, expires, signature)) {
        return res.status(403).json({ error: "Upload handle is invalid or expired" });
      }
      if (!["image/jpeg", "image/png", "application/pdf"].includes(mime)) {
        return res.status(415).json({ error: "Unsupported evidence media type" });
      }
      const buffer = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body || "");
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "Evidence upload must be between 1 byte and 5 MB" });
      }
      await StorageAdapter.saveObjectBytes(key, buffer, mime);
      return res.status(200).send({ ok: true });
    } catch (err: any) {
      console.error("[Storage upload] Failed to persist evidence", err);
      return res.status(500).json({ error: "Evidence upload failed" });
    }
  }
);

// Public Browser API (/api/v1)
app.use("/api/v1", authRouter);
app.use("/api/v1", commerceRouter);
app.use("/api/v1", workspaceRouter);
app.use("/api/v1", disputesRouter);
app.use("/api/v1", adminRouter);

// Internal Worker <-> Python FastAPI API (/internal/v1)
app.use("/internal/v1", internalRouter);

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[VelaPal V6.1 API] Listening on http://localhost:${PORT}`);
  startDurableOutboxWorker();
});
