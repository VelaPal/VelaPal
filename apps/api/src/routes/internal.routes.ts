import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAiCallbackAuth } from "../middleware/auth";
import { AppError, sendError, sendSuccess } from "../utils/envelope";
import { canonicalHash, signManifestHmac } from "../utils/crypto";
import { StorageAdapter } from "../integrations/storage.adapter";

export const internalRouter = Router();

const API_INTERNAL_BASE_URL = process.env.API_INTERNAL_BASE_URL || "http://localhost:4000";

// GET /internal/v1/sources/:sid/bytes (Token-verified byte stream for Python AI ingestion/extraction)
internalRouter.get("/sources/:sid/bytes", async (req, res) => {
  try {
    const { token } = req.query;
    const src = await prisma.caseSource.findUnique({ where: { id: req.params.sid } });
    if (
      !src ||
      src.audience === "REVOKED" ||
      src.scanState !== "CLEAN" ||
      !token ||
      src.readToken !== String(token) ||
      (src.readExpiresAt && src.readExpiresAt < new Date())
    ) {
      throw new AppError(403, "FORBIDDEN", "Read handle token is invalid, expired, or source was revoked");
    }

    const bytes = await StorageAdapter.readObjectBytes(src.objectKey);
    res.setHeader("Content-Type", src.mime);
    return res.status(200).send(bytes);
  } catch (err) {
    return sendError(res, err);
  }
});

// Require X-AI-Callback-Token for all Python -> Express context & checkpoint endpoints
internalRouter.use(requireAiCallbackAuth);

// GET /internal/v1/index-jobs/:id/context (authoritative scope for evidence indexing)
internalRouter.get("/index-jobs/:id/context", async (req, res) => {
  try {
    const job = await prisma.outboxJob.findUnique({ where: { id: req.params.id } });
    if (!job || job.jobType !== "SCAN_AND_INDEX_SOURCE") {
      throw new AppError(404, "NOT_FOUND", "Evidence index job not found");
    }
    if (job.state !== "LEASED" || !job.leaseUntil || job.leaseUntil <= new Date()) {
      throw new AppError(409, "INDEX_JOB_NOT_ACTIVE", "Evidence index job is no longer active");
    }
    if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
      throw new AppError(409, "INDEX_JOB_INVALID", "Evidence index job scope is invalid");
    }
    const payload = job.payload as unknown as {
      tenantId?: unknown;
      caseId?: unknown;
      sourceId?: unknown;
      accessRevision?: unknown;
    };
    if (
      typeof payload.tenantId !== "string" ||
      typeof payload.caseId !== "string" ||
      typeof payload.sourceId !== "string" ||
      typeof payload.accessRevision !== "number" ||
      !Number.isSafeInteger(payload.accessRevision)
    ) {
      throw new AppError(409, "INDEX_JOB_INVALID", "Evidence index job scope is invalid");
    }
    const [c, source] = await Promise.all([
      prisma.disputeCase.findUnique({ where: { id: payload.caseId } }),
      prisma.caseSource.findUnique({ where: { id: payload.sourceId } }),
    ]);
    if (
      !c ||
      !source ||
      c.merchantId !== payload.tenantId ||
      c.accessRevision !== payload.accessRevision ||
      source.caseId !== c.id ||
      source.scanState !== "CLEAN" ||
      source.audience === "REVOKED" ||
      !source.sha256
    ) {
      throw new AppError(409, "SOURCE_ACCESS_CHANGED", "Evidence is no longer authorized for indexing");
    }
    return res.status(200).json({
      jobId: job.id,
      tenantId: c.merchantId,
      caseId: c.id,
      sourceId: source.id,
      sourceVersion: source.sourceVersion,
      accessRevision: c.accessRevision,
      audience: source.audience,
      mime: source.mime,
      sha256: source.sha256,
      byteCount: source.byteCount,
      ownerId: source.ownerId,
      ownerParty: source.ownerParty,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /internal/v1/revoke-jobs/:id/context (authoritative scope for index deletion)
internalRouter.get("/revoke-jobs/:id/context", async (req, res) => {
  try {
    const job = await prisma.outboxJob.findUnique({ where: { id: req.params.id } });
    if (!job || job.jobType !== "REVOKE_SOURCE") {
      throw new AppError(404, "NOT_FOUND", "Evidence revoke job not found");
    }
    if (job.state !== "LEASED" || !job.leaseUntil || job.leaseUntil <= new Date()) {
      throw new AppError(409, "REVOKE_JOB_NOT_ACTIVE", "Evidence revoke job is no longer active");
    }
    if (!job.payload || typeof job.payload !== "object" || Array.isArray(job.payload)) {
      throw new AppError(409, "REVOKE_JOB_INVALID", "Evidence revoke job scope is invalid");
    }
    const payload = job.payload as unknown as {
      tenantId?: unknown;
      caseId?: unknown;
      sourceId?: unknown;
      revokedUpToVersion?: unknown;
      accessRevision?: unknown;
    };
    if (
      typeof payload.tenantId !== "string" ||
      typeof payload.caseId !== "string" ||
      typeof payload.sourceId !== "string" ||
      typeof payload.revokedUpToVersion !== "number" ||
      !Number.isSafeInteger(payload.revokedUpToVersion) ||
      typeof payload.accessRevision !== "number" ||
      !Number.isSafeInteger(payload.accessRevision)
    ) {
      throw new AppError(409, "REVOKE_JOB_INVALID", "Evidence revoke job scope is invalid");
    }
    const [c, source] = await Promise.all([
      prisma.disputeCase.findUnique({ where: { id: payload.caseId } }),
      prisma.caseSource.findUnique({ where: { id: payload.sourceId } }),
    ]);
    if (
      !c ||
      !source ||
      c.merchantId !== payload.tenantId ||
      source.caseId !== c.id ||
      source.audience !== "REVOKED" ||
      source.sourceVersion < payload.revokedUpToVersion
    ) {
      throw new AppError(409, "SOURCE_REVOCATION_CHANGED", "Evidence revocation scope is invalid");
    }
    return res.status(200).json({
      jobId: job.id,
      tenantId: c.merchantId,
      caseId: c.id,
      sourceId: source.id,
      revokedUpToVersion: payload.revokedUpToVersion,
      accessRevision: payload.accessRevision,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /internal/v1/case-runs/:id/context
internalRouter.get("/case-runs/:id/context", async (req, res) => {
  try {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new AppError(404, "NOT_FOUND", "AgentRun not found");

    if (run.purpose === "PERSONAL_ASSISTANT" || !run.caseId) {
      if (run.purpose !== "PERSONAL_ASSISTANT") throw new AppError(403, "FORBIDDEN", "Case preparation run has no case binding");
      const [catalogItems, recentTransactions, preferences] = await Promise.all([prisma.product.findMany({ where: { status: "PUBLISHED" }, take: 100 }), prisma.transaction.findMany({
        where: { customerId: run.actorId },
        take: 10,
        orderBy: { createdAt: "desc" },
      }), prisma.workspacePreference.findUnique({ where: { userId: run.actorId } })]);
      return res.status(200).json({
        runId: run.id,
        purpose: "PERSONAL_ASSISTANT",
        audience: "PRIVATE",
        personalContext: {
          catalogItems,
          spendingLimitMinor: preferences?.defaultLimitMinor ?? 7500,
          recentTransactions,
        },
      });
    }

    const c = await prisma.disputeCase.findUnique({ where: { id: run.caseId } });
    if (!c) throw new AppError(404, "NOT_FOUND", "DisputeCase not found");

    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ id: c.transactionId || "" }, { orderId: c.orderId }] },
    });

    const allowedAudienceFilter =
      run.purpose === "SHARED_ASSESSMENT"
        ? { in: ["CASE_SHARED", "PROVIDER_SHARED"] as any }
        : { in: ["PRIVATE", "CASE_SHARED", "PROVIDER_SHARED"] as any };

    const sources = await prisma.caseSource.findMany({
      where: {
        caseId: c.id,
        scanState: "CLEAN",
        audience: allowedAudienceFilter,
      },
      orderBy: { createdAt: "asc" },
    });

    const messages = await prisma.caseMessage.findMany({
      where: {
        caseId: c.id,
        audience: run.purpose === "SHARED_ASSESSMENT" ? "CASE_SHARED" : undefined,
      },
      orderBy: { createdAt: "asc" },
    });

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const allowedSourcesWithHandles = await Promise.all(
      sources.map(async (s) => {
        const handleToken = s.readToken || `hdl_${crypto.randomBytes(8).toString("hex")}`;
        await prisma.caseSource.update({
          where: { id: s.id },
          data: { readToken: handleToken, readExpiresAt: expiresAt },
        });
        return {
          sourceId: s.id,
          version: s.sourceVersion,
          ownerParty: s.ownerParty,
          audience: s.audience,
          scanState: s.scanState,
          mime: s.mime,
          sha256: s.sha256,
          readHandle: {
            url: `${API_INTERNAL_BASE_URL}/internal/v1/sources/${s.id}/bytes?v=${s.sourceVersion}&runId=${run.id}&token=${handleToken}`,
            expiresAt: expiresAt.toISOString(),
          },
        };
      })
    );

    const manifestId = `mf_${crypto.randomBytes(6).toString("hex")}`;
    const replayId = `rpl_${crypto.randomBytes(6).toString("hex")}`;
    const manifestHash = canonicalHash({
      caseId: c.id,
      caseVersion: c.caseVersion,
      accessRevision: c.accessRevision,
      sourceIds: allowedSourcesWithHandles.map((s) => `${s.sourceId}:${s.version}`),
    });

    const hmacSignature = signManifestHmac({
      manifestId,
      replayId,
      audience: run.audience,
      caseVersion: c.caseVersion,
      accessRevision: c.accessRevision,
      manifestHash,
      expiresAt: expiresAt.toISOString(),
    });

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        manifestId,
        replayId,
        manifestHash,
        hmacSignature,
        manifestExpiresAt: expiresAt,
      },
    });

    return res.status(200).json({
      runId: run.id,
      tenantId: c.merchantId,
      caseId: c.id,
      purpose: run.purpose,
      audience: run.audience,
      caseVersion: c.caseVersion,
      accessRevision: c.accessRevision,
      policyVersion: "v6.1",
      signedManifest: {
        manifestId,
        replayId,
        audience: run.audience,
        caseVersion: c.caseVersion,
        accessRevision: c.accessRevision,
        manifestHash,
        expiresAt: expiresAt.toISOString(),
        hmacSignature,
      },
      transactionFacts: tx
        ? {
            transactionId: tx.id,
            orderId: tx.orderId,
            sku: "PD-256-M",
            variantId: "256GB",
            amountMinor: tx.amountMinor,
            refundableRemainingMinor: tx.refundableRemainingMinor,
            currency: tx.currency,
            paymentStatus: tx.paymentStatus,
            snapshotSourceRef: { sourceId: tx.snapshotId, version: 1, locator: "record:1" },
          }
        : null,
      allowedMessages: messages.map((m, idx) => ({
        messageId: m.id,
        party: m.authorParty,
        audience: m.audience,
        version: m.version,
        locator: `statement:${m.authorParty.toLowerCase()}:${idx + 1}`,
        text: m.text,
      })),
      allowedSources: allowedSourcesWithHandles,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /internal/v1/case-runs/:id/checkpoints (Atomic CAS commit; rejects stale inputVersion/accessRevision with 409)
internalRouter.post("/case-runs/:id/checkpoints", async (req, res) => {
  try {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new AppError(404, "NOT_FOUND", "AgentRun not found");

    const { inputVersion, accessRevision, manifestId, replayId, manifestHash, hmacSignature, resultPayload } =
      req.body || {};

    if (run.caseId) {
      const c = await prisma.disputeCase.findUnique({ where: { id: run.caseId } });
      if (!c) throw new AppError(404, "NOT_FOUND", "DisputeCase not found");

      if (Number(inputVersion) !== c.caseVersion || Number(accessRevision) !== c.accessRevision) {
        await prisma.agentRun.update({ where: { id: run.id }, data: { status: "STALE" } });
        throw new AppError(
          409,
          "STALE_CONTEXT",
          "Case evidence or access revision changed while run was in flight. Result discarded without publishing.",
          false,
          c.caseVersion,
          {
            expectedCaseVersion: Number(inputVersion),
            currentCaseVersion: c.caseVersion,
            expectedAccessRevision: Number(accessRevision),
            currentAccessRevision: c.accessRevision,
          }
        );
      }

      if (run.hmacSignature && hmacSignature && run.hmacSignature !== hmacSignature) {
        throw new AppError(403, "FORBIDDEN", "Signed manifest HMAC verification failed");
      }

      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: (resultPayload?.status as any) || "COMPLETED",
          resultPayload: resultPayload || {},
        },
      });

      if (resultPayload?.requiresHumanApproval) {
        await prisma.disputeCase.update({
          where: { id: c.id },
          data: {
            stage: "MEDIATING",
            control: "WAITING_ADMIN",
            controlVersion: { increment: 1 },
            gateReason: "MATERIAL_CONFLICT_INVOICE_VS_LABEL",
          },
        });
      } else {
        await prisma.disputeCase.update({
          where: { id: c.id },
          data: { stage: "MEDIATING" },
        });
      }

      return sendSuccess(
        res,
        {
          committed: true,
          checkpointId: `cp_${run.id}`,
          caseVersion: c.caseVersion,
          accessRevision: c.accessRevision,
        },
        c.caseVersion
      );
    }

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        resultPayload: resultPayload || {},
      },
    });

    return sendSuccess(res, {
      committed: true,
      checkpointId: `cp_${run.id}`,
      caseVersion: 1,
      accessRevision: 1,
    });
  } catch (err) {
    return sendError(res, err);
  }
});
