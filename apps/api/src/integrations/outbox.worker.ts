import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { StorageAdapter } from "./storage.adapter";
import { sha256 } from "../utils/crypto";

const AI_BASE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const API_INTERNAL_BASE_URL = process.env.API_INTERNAL_BASE_URL || "http://localhost:4000";
const WORKER_TOKEN = process.env.WORKER_TO_AI_SECRET || "velapal-worker-to-ai-secret-v61";

export function startDurableOutboxWorker(pollIntervalMs = 2500) {
  setInterval(async () => {
    try {
      const now = new Date();
      const job = await prisma.outboxJob.findFirst({
        where: {
          state: { in: ["PENDING", "LEASED"] },
          nextAttemptAt: { lte: now },
          OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
        },
        orderBy: { createdAt: "asc" },
      });

      if (!job) return;

      // Acquire lease atomically
      const leaseUntil = new Date(Date.now() + 60000);
      const claimed = await prisma.outboxJob.updateMany({
        where: { id: job.id, retryCount: job.retryCount },
        data: { state: "LEASED", leaseUntil, retryCount: { increment: 1 } },
      });
      if (claimed.count === 0) return;

      const payload = job.payload as any;

      if (job.jobType === "SCAN_AND_INDEX_SOURCE") {
        const src = await prisma.caseSource.findUnique({ where: { id: payload.sourceId } });
        if (!src) {
          await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
          return;
        }
        const bytes = await StorageAdapter.readObjectBytes(src.objectKey);
        const fileHash = sha256(bytes);
        const readToken = `hdl_${crypto.randomBytes(8).toString("hex")}`;
        const readExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

        const cleanSrc = await prisma.caseSource.update({
          where: { id: src.id },
          data: {
            scanState: "CLEAN",
            sha256: fileHash,
            readToken,
            readExpiresAt,
          },
        });

        // Call Python FastAPI synchronously (/internal/v1/evidence-index)
        try {
          await fetch(`${AI_BASE_URL}/internal/v1/evidence-index`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Worker-Service-Token": WORKER_TOKEN,
            },
            body: JSON.stringify({
              jobId: job.id,
              tenantId: payload.tenantId,
              caseId: cleanSrc.caseId,
              sourceId: cleanSrc.id,
              sourceVersion: cleanSrc.sourceVersion,
              accessRevision: payload.accessRevision,
              audience: cleanSrc.audience,
              mime: cleanSrc.mime,
              sha256: fileHash,
              embeddingSpace: "gemini-embedding-001-dim768",
              retentionUntil: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
              readHandle: {
                url: `${API_INTERNAL_BASE_URL}/internal/v1/sources/${cleanSrc.id}/bytes?v=${cleanSrc.sourceVersion}&jobId=${job.id}&token=${readToken}`,
                expiresAt: readExpiresAt.toISOString(),
              },
            }),
          });
        } catch {
          // Allow local backend operation even if Python AI service is offline during early dev
        }

        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      } else if (job.jobType === "REVOKE_SOURCE") {
        try {
          await fetch(`${AI_BASE_URL}/internal/v1/evidence-revoke`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Worker-Service-Token": WORKER_TOKEN,
            },
            body: JSON.stringify({
              jobId: job.id,
              tenantId: payload.tenantId,
              caseId: payload.caseId,
              sourceId: payload.sourceId,
              revokedUpToVersion: payload.revokedUpToVersion,
              accessRevision: payload.accessRevision,
            }),
          });
        } catch {
          // Ignore network error if AI service is not yet running
        }
        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      } else if (job.jobType === "RUN_AI_ASSESSMENT") {
        // Frozen PRD §15 request body: { runId, purpose, expectedContextVersion, traceId }
        await prisma.agentRun.update({ where: { id: payload.runId }, data: { status: "RUNNING" } });
        try {
          const res = await fetch(`${AI_BASE_URL}/internal/v1/case-runs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Worker-Service-Token": WORKER_TOKEN,
            },
            body: JSON.stringify({
              runId: payload.runId,
              purpose: payload.purpose,
              expectedContextVersion: payload.expectedContextVersion,
              traceId: job.traceId,
            }),
          });
          if (res.ok) {
            const aiDto = await res.json();
            const c = payload.caseId
              ? await prisma.disputeCase.findUnique({ where: { id: payload.caseId } })
              : null;
            if (!c || c.caseVersion === payload.expectedContextVersion) {
              await prisma.agentRun.update({
                where: { id: payload.runId },
                data: {
                  status: aiDto.status || "COMPLETED",
                  resultPayload: aiDto,
                },
              });
              if (c && aiDto.requiresHumanApproval) {
                await prisma.disputeCase.update({
                  where: { id: c.id },
                  data: {
                    control: "WAITING_ADMIN",
                    controlVersion: { increment: 1 },
                    gateReason: "MATERIAL_CONFLICT_INVOICE_VS_LABEL",
                  },
                });
              }
            } else {
              await prisma.agentRun.update({
                where: { id: payload.runId },
                data: { status: "STALE" },
              });
            }
          }
        } catch {
          // Keep run in QUEUED/RUNNING if Python service is not yet started
        }
        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      } else if (job.jobType === "RESUME_AI_ASSESSMENT") {
        try {
          await fetch(`${AI_BASE_URL}/internal/v1/case-runs/${payload.runId}/resume`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Worker-Service-Token": WORKER_TOKEN,
            },
            body: JSON.stringify({
              runId: payload.runId,
              decisionId: payload.decisionId,
              expectedContextVersion: payload.expectedContextVersion,
              traceId: job.traceId,
            }),
          });
        } catch {
          // Ignore if Python service is offline
        }
        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      }
    } catch (err) {
      console.error("[OutboxWorker] Error:", err);
    }
  }, pollIntervalMs);
}
