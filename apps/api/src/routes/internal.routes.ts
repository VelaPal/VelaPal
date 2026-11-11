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

    const { buffer, mime } = await StorageAdapter.readObjectBytes(
      src.objectKey,
      src.originalName,
      src.mime
    );
    res.setHeader("Content-Type", mime);
    return res.status(200).send(buffer);
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
      const [catalogItems, recentTransactions, preferences] = await Promise.all([prisma.product.findMany({ where: { status: "PUBLISHED" }, orderBy: { id: "asc" }, take: 100 }), prisma.transaction.findMany({
        where: { customerId: run.actorId },
        take: 10,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }), prisma.workspacePreference.findUnique({ where: { userId: run.actorId } })]);
      // Personal assistant runs have no case row, but the AI service still
      // requires the same signed, version-bound context envelope as case runs.
      // Keep the signed hash limited to stable inputs so a fresh-context check
      // during commit produces the same fingerprint.
      const context: Record<string, unknown> = {
        runId: run.id,
        actorId: run.actorId,
        tenantId: run.actorId,
        caseId: null,
        purpose: "PERSONAL_ASSISTANT",
        audience: "PRIVATE",
        inputVersion: run.inputVersion,
        caseVersion: 1,
        privateContextVersion: 1,
        accessRevision: 1,
        policyVersion: "v6.1",
        businessDataMode: "synthetic_fixture",
        prompt: run.prompt || "",
        transactionFacts: null,
        allowedMessages: [],
        allowedSources: [],
        personalContext: {
          catalogItems,
          spendingLimitMinor: preferences?.defaultLimitMinor ?? 7500,
          recentTransactions,
        },
      };
      const manifestHash = canonicalHash(context);
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const manifestPayload = {
        manifestId: `mf_${crypto.randomBytes(6).toString("hex")}`,
        replayId: `rpl_${crypto.randomBytes(6).toString("hex")}`,
        runId: run.id,
        actorId: run.actorId,
        tenantId: run.actorId,
        caseId: null,
        purpose: "PERSONAL_ASSISTANT",
        audience: "PRIVATE",
        inputVersion: run.inputVersion,
        caseVersion: 1,
        privateContextVersion: 1,
        accessRevision: 1,
        manifestHash,
        expiresAt,
      };
      return res.status(200).json({
        ...context,
        signedManifest: {
          ...manifestPayload,
          hmacSignature: signManifestHmac(manifestPayload),
        },
      });
    }

    const c = await prisma.disputeCase.findUnique({ where: { id: run.caseId } });
    if (!c) throw new AppError(404, "NOT_FOUND", "DisputeCase not found");
    if (run.accessRevision !== c.accessRevision) {
      throw new AppError(409, "STALE_CONTEXT", "Case access changed before the AI run started");
    }

    if (run.purpose === "CUSTOMER_PREPARATION" && run.actorId !== c.customerId) {
      throw new AppError(403, "FORBIDDEN", "Customer preparation is not bound to the case customer");
    }
    if (run.purpose === "SELLER_PREPARATION") {
      const membership = await prisma.membership.findFirst({
        where: {
          userId: run.actorId,
          status: "ACTIVE",
          workspace: { type: "SELLER", merchantId: c.merchantId, status: "ACTIVE" },
        },
        select: { id: true },
      });
      if (!membership) throw new AppError(403, "FORBIDDEN", "Seller preparation is not bound to an active case merchant membership");
    }

    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ id: c.transactionId || "" }, { orderId: c.orderId }] },
    });

    const sources = await prisma.caseSource.findMany({
      where: {
        caseId: c.id,
        scanState: "CLEAN",
        OR: run.purpose === "SHARED_ASSESSMENT"
          ? [{ audience: { in: ["CASE_SHARED", "PROVIDER_SHARED"] } }]
          : [
              { audience: { in: ["CASE_SHARED", "PROVIDER_SHARED"] } },
              { audience: "PRIVATE", ownerId: run.actorId },
            ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const messages = await prisma.caseMessage.findMany({
      where: {
        caseId: c.id,
        OR: run.purpose === "SHARED_ASSESSMENT"
          ? [{ audience: "CASE_SHARED" }]
          : [{ audience: "CASE_SHARED" }, { audience: "PRIVATE", authorId: run.actorId }],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });

    const now = new Date();
    const expiresAt = run.manifestExpiresAt && run.manifestExpiresAt > now
      ? run.manifestExpiresAt
      : new Date(now.getTime() + 15 * 60 * 1000);
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

    const inputVersion = run.purpose === "SHARED_ASSESSMENT" ? c.caseVersion : c.privateContextVersion;
    const transactionFacts = tx
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
      : null;
    const context: Record<string, unknown> = {
      runId: run.id,
      actorId: run.actorId,
      tenantId: c.merchantId,
      caseId: c.id,
      purpose: run.purpose,
      audience: run.audience,
      inputVersion,
      caseVersion: c.caseVersion,
      privateContextVersion: c.privateContextVersion,
      accessRevision: c.accessRevision,
      policyVersion: "v6.1",
      businessDataMode: "synthetic_fixture",
      category: c.category,
      prompt: run.prompt || "",
      transactionFacts,
      allowedMessages: messages.map((m, idx) => ({
        messageId: m.id,
        party: m.authorParty,
        audience: m.audience,
        version: m.version,
        locator: `statement:${m.authorParty.toLowerCase()}:${idx + 1}`,
        text: m.text,
      })),
      allowedSources: allowedSourcesWithHandles,
    };
    const manifestHash = canonicalHash(context);
    const sameManifest = run.manifestHash === manifestHash && run.manifestId && run.replayId;
    const manifestPayload = {
      manifestId: sameManifest ? run.manifestId! : `mf_${crypto.randomBytes(6).toString("hex")}`,
      replayId: sameManifest ? run.replayId! : `rpl_${crypto.randomBytes(6).toString("hex")}`,
      runId: run.id,
      actorId: run.actorId,
      tenantId: c.merchantId,
      caseId: c.id,
      purpose: run.purpose,
      audience: run.audience,
      inputVersion,
      caseVersion: c.caseVersion,
      privateContextVersion: c.privateContextVersion,
      accessRevision: c.accessRevision,
      manifestHash,
      expiresAt: expiresAt.toISOString(),
    };
    const hmacSignature = signManifestHmac(manifestPayload);

    await prisma.agentRun.update({
      where: { id: run.id },
      data: {
        manifestId: manifestPayload.manifestId,
        replayId: manifestPayload.replayId,
        manifestHash,
        hmacSignature,
        manifestExpiresAt: expiresAt,
      },
    });

    return res.status(200).json({
      ...context,
      signedManifest: {
        ...manifestPayload,
        hmacSignature,
      },
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

      const currentInputVersion = run.purpose === "SHARED_ASSESSMENT"
        ? c.caseVersion
        : c.privateContextVersion;
      if (Number(inputVersion) !== currentInputVersion || Number(accessRevision) !== c.accessRevision) {
        await prisma.agentRun.update({ where: { id: run.id }, data: { status: "STALE" } });
        throw new AppError(
          409,
          "STALE_CONTEXT",
          "Case context or access revision changed while run was in flight. Result discarded without publishing.",
          false,
          currentInputVersion,
          {
            expectedInputVersion: Number(inputVersion),
            currentInputVersion,
            expectedAccessRevision: Number(accessRevision),
            currentAccessRevision: c.accessRevision,
          }
        );
      }

      if (
        !run.manifestId || !run.replayId || !run.manifestHash || !run.hmacSignature ||
        manifestId !== run.manifestId || replayId !== run.replayId ||
        manifestHash !== run.manifestHash || hmacSignature !== run.hmacSignature
      ) {
        throw new AppError(403, "FORBIDDEN", "Signed manifest HMAC verification failed");
      }

      await prisma.agentRun.update({
        where: { id: run.id },
        data: {
          status: (resultPayload?.status as any) || "COMPLETED",
          resultPayload: resultPayload || {},
        },
      });

      if (run.purpose === "SHARED_ASSESSMENT") {
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
