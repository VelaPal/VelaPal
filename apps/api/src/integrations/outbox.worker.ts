import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { StorageAdapter } from "./storage.adapter";
import { sha256 } from "../utils/crypto";

const AI_BASE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
const API_INTERNAL_BASE_URL = process.env.API_INTERNAL_BASE_URL || "http://localhost:4000";
const WORKER_TOKEN = process.env.WORKER_TO_AI_SECRET || "velapal-worker-to-ai-secret-v61";
const MAX_JOB_ATTEMPTS = 5;

async function retryJob(
  jobId: string,
  attempt: number,
  jobType: string,
  runId: string | undefined,
  error: unknown,
) {
  const statusMatch = error instanceof Error ? error.message.match(/HTTP (\d{3})/) : null;
  const httpStatus = statusMatch ? Number(statusMatch[1]) : null;
  const permanentHttpFailure = httpStatus !== null && httpStatus >= 400 && httpStatus < 500 &&
    ![408, 425, 429].includes(httpStatus);
  const failed = attempt >= MAX_JOB_ATTEMPTS || permanentHttpFailure;
  const delayMs = Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));
  await prisma.outboxJob.update({
    where: { id: jobId },
    data: {
      state: failed ? "FAILED" : "PENDING",
      leaseUntil: null,
      nextAttemptAt: new Date(Date.now() + delayMs),
    },
  });
  if (failed && runId && ["RUN_AI_ASSESSMENT", "RESUME_AI_ASSESSMENT"].includes(jobType)) {
    await prisma.agentRun.updateMany({
      where: { id: runId, status: { in: ["QUEUED", "RUNNING"] } },
      data: { status: httpStatus === 409 ? "STALE" : "FAILED" },
    });
  }
  console.error(`[OutboxWorker] Job ${jobId} ${failed ? "failed permanently" : "scheduled for retry"} (attempt ${attempt}/${MAX_JOB_ATTEMPTS}):`, error);
}

export function startDurableOutboxWorker(pollIntervalMs = 2500) {
  setInterval(async () => {
    let activeJobId: string | null = null;
    let activeAttempt = 0;
    let activeJobType = "";
    let activeRunId: string | undefined;
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
      // Evidence indexing is bounded to 110 seconds in AI; keep the lease longer
      // so another worker cannot claim the same job while that request is active.
      const leaseUntil = new Date(Date.now() + 180000);
      const claimed = await prisma.outboxJob.updateMany({
        where: { id: job.id, retryCount: job.retryCount },
        data: { state: "LEASED", leaseUntil, retryCount: { increment: 1 } },
      });
      if (claimed.count === 0) return;
      activeJobId = job.id;
      activeAttempt = job.retryCount + 1;
      activeJobType = job.jobType;

      const payload = job.payload as any;
      activeRunId = payload.runId;

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
        const response = await fetch(`${AI_BASE_URL}/internal/v1/evidence-index`, {
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
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
          const message = `AI evidence indexing returned HTTP ${response.status}`;
          if (response.status === 429 || response.status >= 500) {
            throw new Error(message);
          }
          await prisma.outboxJob.update({
            where: { id: job.id },
            data: { state: "FAILED", leaseUntil: null },
          });
          console.error(`[OutboxWorker] ${message} for job ${job.id}`);
          return;
        }

        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      } else if (job.jobType === "REVOKE_SOURCE") {
        const response = await fetch(`${AI_BASE_URL}/internal/v1/evidence-revoke`, {
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
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          if (response.status === 429 || response.status >= 500) {
            throw new Error(`AI evidence revocation returned HTTP ${response.status}`);
          }
          await prisma.outboxJob.update({
            where: { id: job.id },
            data: { state: "FAILED", leaseUntil: null },
          });
          console.error(
            `[OutboxWorker] AI evidence revocation returned HTTP ${response.status} for job ${job.id}`,
          );
          return;
        }
        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      } else if (job.jobType === "RUN_AI_ASSESSMENT") {
        // Frozen PRD §15 request body: { runId, purpose, expectedContextVersion, traceId }
        await prisma.agentRun.update({ where: { id: payload.runId }, data: { status: "RUNNING" } });
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
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const errBody = await res.text().catch(() => "");
          throw new Error(`AI assessment returned HTTP ${res.status}: ${errBody}`);
        }
        const aiDto = await res.json();
        const c = payload.caseId
          ? await prisma.disputeCase.findUnique({ where: { id: payload.caseId } })
          : null;
        const run = await prisma.agentRun.findUnique({ where: { id: payload.runId } });
        const currentContextVersion = c && payload.purpose === "SHARED_ASSESSMENT"
          ? c.caseVersion
          : c?.privateContextVersion;
        const contextIsCurrent = !payload.caseId || (
          !!c &&
          currentContextVersion === payload.expectedContextVersion &&
          run?.accessRevision === c.accessRevision
        );
        if (contextIsCurrent) {
          await prisma.agentRun.update({
            where: { id: payload.runId },
            data: {
              status: aiDto.status || "COMPLETED",
              resultPayload: aiDto,
            },
          });
          if (c && payload.purpose === "SHARED_ASSESSMENT" && aiDto.requiresHumanApproval) {
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
        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      } else if (job.jobType === "RESUME_AI_ASSESSMENT") {
        const response = await fetch(`${AI_BASE_URL}/internal/v1/case-runs/${payload.runId}/resume`, {
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
          signal: AbortSignal.timeout(120_000),
        });
        if (!response.ok) {
          throw new Error(`AI assessment resume returned HTTP ${response.status}`);
        }
        await prisma.outboxJob.update({ where: { id: job.id }, data: { state: "COMPLETED" } });
      }
    } catch (err) {
      if (activeJobId) {
        try {
          await retryJob(activeJobId, activeAttempt, activeJobType, activeRunId, err);
        } catch (retryError) {
          console.error(`[OutboxWorker] Could not update failed job ${activeJobId}:`, retryError);
        }
      } else {
        console.error("[OutboxWorker] Error:", err);
      }
    }
  }, pollIntervalMs);
}
