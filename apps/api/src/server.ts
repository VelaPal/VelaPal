import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { authRouter } from "./routes/auth.routes";
import { commerceRouter } from "./routes/commerce.routes";
import { disputesRouter } from "./routes/disputes.routes";
import { adminRouter } from "./routes/admin.routes";
import { internalRouter } from "./routes/internal.routes";
import { startDurableOutboxWorker } from "./integrations/outbox.worker";

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

// Public Browser API (/api/v1)
app.use("/api/v1", authRouter);
app.use("/api/v1", commerceRouter);
app.use("/api/v1", disputesRouter);
app.use("/api/v1", adminRouter);

// Internal Worker <-> Python FastAPI API (/internal/v1)
app.use("/internal/v1", internalRouter);

const PORT = Number(process.env.PORT || 4000);
app.listen(PORT, () => {
  console.log(`[VelaPal V6.1 API] Listening on http://localhost:${PORT}`);
  startDurableOutboxWorker();
});
