import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireSession, verifyStepUpToken } from "../middleware/auth";
import { checkIdempotency, saveIdempotency } from "../middleware/idempotency";
import { AppError, requireIfMatch, sendError, sendSuccess } from "../utils/envelope";
import {
  canonicalHash,
  generateTraceId,
  mediationConsentParamsHash,
  sourceShareParamsHash,
  sourceManifestDigest,
} from "../utils/crypto";
import { StorageAdapter } from "../integrations/storage.adapter";

export const disputesRouter = Router();

const ALLOWED_MIMES = ["image/jpeg", "image/png", "application/pdf"];
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_CATEGORIES = [
  "ITEM_NOT_AS_DESCRIBED",
  "ITEM_NOT_RECEIVED",
  "PAYMENT_NOT_CONFIRMED",
  "FULFILMENT_OR_RETURN_ISSUE",
  "BILLING_OR_RENEWAL_CONCERN",
  "CONTESTED_CLAIM",
];

function getActorParty(auth: any, c: { customerId: string; merchantId: string }): "CUSTOMER" | "SELLER" {
  if (auth.workspaceType === "SELLER" && auth.merchantId === c.merchantId) {
    return "SELLER";
  }
  if (auth.userId === c.customerId) {
    return "CUSTOMER";
  }
  throw new AppError(404, "NOT_FOUND", "Dispute case not found in active workspace scope");
}

// POST /api/v1/disputes (Accepts transactionId OR orderId; returns 409 DUPLICATE_ACTIVE_CASE on duplicate issueKey)
disputesRouter.post("/disputes", requireSession, async (req, res) => {
  try {
    const routeKey = "POST:/api/v1/disputes";
    const idem = await checkIdempotency(req, routeKey);
    if (idem.cachedResponse) {
      return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    }

    const { transactionId, orderId, category, statement, audience = "CASE_SHARED" } = req.body || {};
    if (!category || !ALLOWED_CATEGORIES.includes(category)) {
      throw new AppError(422, "VALIDATION_ERROR", "Invalid or missing dispute category");
    }
    if (!transactionId && !orderId) {
      throw new AppError(422, "VALIDATION_ERROR", "Either transactionId or orderId is required");
    }

    const tx = await prisma.transaction.findFirst({
      where: {
        OR: [
          ...(transactionId ? [{ id: String(transactionId) }] : []),
          ...(orderId ? [{ orderId: String(orderId) }] : []),
        ],
      },
    });
    if (!tx) {
      throw new AppError(404, "NOT_FOUND", "Referenced transaction or order does not exist");
    }

    const initiatorParty: "CUSTOMER" | "SELLER" =
      req.auth!.workspaceType === "SELLER" && req.auth!.merchantId === tx.merchantId
        ? "SELLER"
        : tx.customerId === req.auth!.userId
        ? "CUSTOMER"
        : (() => {
            throw new AppError(403, "FORBIDDEN", "Actor is not a party to the referenced transaction/order");
          })();

    const issueKey = `${tx.orderId}:${category}`;
    const existingCase = await prisma.disputeCase.findUnique({ where: { issueKey } });
    if (existingCase && !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(existingCase.stage)) {
      throw new AppError(
        409,
        "DUPLICATE_ACTIVE_CASE",
        "An active case already exists for this transaction/order and category",
        false,
        existingCase.caseVersion,
        { existingCaseId: existingCase.id }
      );
    }

    const traceId = generateTraceId("tr_dsp");
    const created = await prisma.$transaction(async (db) => {
      const c = await db.disputeCase.create({
        data: {
          issueKey,
          transactionId: tx.id,
          orderId: tx.orderId,
          customerId: tx.customerId,
          merchantId: tx.merchantId,
          initiatorParty,
          category: category as any,
          stage: "AWAITING_EVIDENCE",
          control: "RUNNING",
          caseVersion: 1,
          controlVersion: 1,
          privateContextVersion: 1,
          accessRevision: 1,
          customerStatement: initiatorParty === "CUSTOMER" && audience === "CASE_SHARED" ? String(statement) : null,
          sellerStatement: initiatorParty === "SELLER" && audience === "CASE_SHARED" ? String(statement) : null,
        },
      });

      if (statement) {
        await db.caseMessage.create({
          data: {
            caseId: c.id,
            authorId: req.auth!.userId,
            authorParty: initiatorParty,
            audience: audience === "CASE_SHARED" ? "CASE_SHARED" : "PRIVATE",
            text: String(statement),
            sourceRefs: [],
            version: 1,
          },
        });
      }

      await db.auditEvent.create({
        data: {
          eventName: "CASE_OPENED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          actorParty: initiatorParty,
          targetType: "DISPUTE_CASE",
          targetId: c.id,
          summary: `Case opened for ${tx.orderId} (${category})`,
          caseVersion: 1,
          controlVersion: 1,
          traceId,
        },
      });

      return c;
    });

    const responsePayload = {
      data: {
        caseId: created.id,
        transactionId: created.transactionId,
        orderId: created.orderId,
        initiatorParty: created.initiatorParty,
        category: created.category,
        stage: created.stage,
        control: created.control,
        caseVersion: created.caseVersion,
        controlVersion: created.controlVersion,
        privateContextVersion: created.privateContextVersion,
        accessRevision: created.accessRevision,
        nextAction: "UPLOAD_OR_SHARE_EVIDENCE",
      },
      meta: {
        traceId,
        version: 1,
        timestamp: new Date().toISOString(),
      },
    };

    await saveIdempotency(req, routeKey, idem.key, idem.requestHash, 201, responsePayload);
    return res.status(201).json(responsePayload);
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/disputes
disputesRouter.get("/disputes", requireSession, async (req, res) => {
  try {
    const where =
      req.auth!.workspaceType === "SELLER"
        ? { merchantId: req.auth!.merchantId || "" }
        : { customerId: req.auth!.userId };

    const items = await prisma.disputeCase.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return sendSuccess(res, { items });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/disputes/:id
disputesRouter.get("/disputes/:id", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ id: c.transactionId || "" }, { orderId: c.orderId }] },
    });
    const snapshot = tx ? await prisma.purchaseSnapshot.findUnique({ where: { id: tx.snapshotId } }) : null;

    // ACL Filter: Return CASE_SHARED/PROVIDER_SHARED sources + own PRIVATE sources
    const sources = await prisma.caseSource.findMany({
      where: {
        caseId: c.id,
        audience: { not: "REVOKED" },
        OR: [{ audience: { in: ["CASE_SHARED", "PROVIDER_SHARED"] } }, { ownerParty: actorParty }],
      },
      orderBy: { createdAt: "asc" },
    });

    const messages = await prisma.caseMessage.findMany({
      where: {
        caseId: c.id,
        OR: [{ audience: "CASE_SHARED" }, { authorParty: actorParty }],
      },
      orderBy: { createdAt: "asc" },
    });

    const latestRun = await prisma.agentRun.findFirst({
      where: {
        caseId: c.id,
        purpose: "SHARED_ASSESSMENT",
        status: { in: ["NEEDS_INFO", "COMPLETED", "ABSTAINED", "FAILED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    const sourceDigest = sourceManifestDigest(
      c.id,
      c.caseVersion,
      c.accessRevision,
      sources,
    );
    const currentAssessmentRun =
      latestRun &&
      ["NEEDS_INFO", "COMPLETED", "ABSTAINED"].includes(latestRun.status) &&
      latestRun.inputVersion === c.caseVersion &&
      latestRun.accessRevision === c.accessRevision
        ? latestRun
        : null;
    const consentBindings = {
      sourceDigest,
      ...(currentAssessmentRun
        ? {
            mediationParamsHash: mediationConsentParamsHash({
              caseId: c.id,
              caseVersion: c.caseVersion,
              accessRevision: c.accessRevision,
              sourceDigest,
              assessmentRunId: currentAssessmentRun.id,
            }),
          }
        : {}),
    };

    const activeProposal = await prisma.proposal.findFirst({
      where: { caseId: c.id, status: "AWAITING_CONSENT" },
      orderBy: { createdAt: "desc" },
    });

    const activeActionReq = activeProposal
      ? await prisma.actionRequest.findUnique({ where: { proposalId: activeProposal.id } })
      : null;

    const existingConsents = activeActionReq
      ? await prisma.partyConsent.findMany({
          where: { actionRequestId: activeActionReq.id, revoked: false },
        })
      : [];

    const requiredDefs = [
      { party: "SELLER", intent: "ACCEPT_PROPOSAL_TERMS" },
      { party: "CUSTOMER", intent: "ACCEPT_PROPOSAL_TERMS" },
      { party: "SELLER", intent: "AUTHORIZE_FINANCIAL_EXECUTION" },
    ];

    const pendingConsents = activeProposal
      ? requiredDefs.map((def) => {
          const found = existingConsents.find((ec) => ec.party === def.party && ec.intent === def.intent);
          return {
            party: def.party,
            intent: def.intent,
            status: found ? found.decision : "PENDING",
            approvedAt: found ? found.approvedAt.toISOString() : null,
          };
        })
      : [];

    const latestOp = await prisma.providerOperation.findFirst({
      where: { caseId: c.id },
      orderBy: { createdAt: "desc" },
    });

    const auditEvents = await prisma.auditEvent.findMany({
      where: { targetId: c.id },
      orderBy: { createdAt: "asc" },
    });

    return sendSuccess(
      res,
      {
        case: {
          caseId: c.id,
          transactionId: c.transactionId,
          orderId: c.orderId,
          merchantId: c.merchantId,
          initiatorParty: c.initiatorParty,
          category: c.category,
          stage: c.stage,
          control: c.control,
          caseVersion: c.caseVersion,
          controlVersion: c.controlVersion,
          privateContextVersion: c.privateContextVersion,
          accessRevision: c.accessRevision,
          nextAction:
            c.control === "WAITING_ADMIN"
              ? "AWAITING_SUPERVISOR_REVIEW"
              : c.stage === "AWAITING_CONSENT"
              ? "REVIEW_AND_CONSENT_PROPOSAL"
              : "UPLOAD_OR_SHARE_EVIDENCE",
          officialPaypalDisputeId: c.officialPaypalDisputeId,
          capabilities: {
            canShareEvidence: c.control !== "PAUSED",
            canPostMessage: c.control !== "PAUSED",
            canProposeTerms: c.control === "RUNNING",
            canGrantConsent: c.stage === "AWAITING_CONSENT" && c.control === "RUNNING",
            canExecuteSettlement:
              actorParty === "SELLER" &&
              c.stage === "AWAITING_CONSENT" &&
              c.control === "RUNNING" &&
              pendingConsents.length > 0 &&
              pendingConsents.every((pc) => pc.status === "APPROVED"),
            canRequestReview: true,
            supportedSettlementRoutes: ["PAYPAL_CAPTURE_REFUND", "OFFICIAL_HANDOFF"],
          },
        },
        providerOperation: latestOp
          ? {
              operationId: latestOp.id,
              type: latestOp.type,
              route: latestOp.route,
              status: latestOp.status,
              providerRef: latestOp.providerRef,
              verifiedAt: latestOp.verifiedAt ? latestOp.verifiedAt.toISOString() : null,
            }
          : {
              operationId: null,
              type: null,
              route: "PAYPAL_CAPTURE_REFUND",
              status: "IDLE",
              providerRef: null,
              verifiedAt: null,
            },
        snapshot: snapshot
          ? {
              snapshotId: snapshot.id,
              sku: snapshot.sku,
              variantId: snapshot.variantId,
              amountMinor: snapshot.amountMinor,
              currency: snapshot.currency,
            }
          : null,
        perspectives: {
          customerStatement: c.customerStatement,
          sellerStatement: c.sellerStatement,
        },
        sources: sources.map((s) => ({
          sourceId: s.id,
          sourceVersion: s.sourceVersion,
          ownerParty: s.ownerParty,
          originalName: s.originalName,
          mime: s.mime,
          scanState: s.scanState,
          audience: s.audience,
          sha256: s.sha256,
          locator: s.locator,
        })),
        messages: messages.map((m) => ({
          messageId: m.id,
          authorParty: m.authorParty,
          audience: m.audience,
          text: m.text,
          sourceRefs: m.sourceRefs,
          createdAt: m.createdAt.toISOString(),
        })),
        latestAssessment: latestRun?.resultPayload || null,
        consentBindings,
        activeProposal: activeProposal
          ? {
              proposalId: activeProposal.id,
              proposalVersion: activeProposal.proposalVersion,
              proposerParty: activeProposal.proposerParty,
              caseVersion: activeProposal.caseVersion,
              actionRequestId: activeActionReq?.id || null,
              terms: activeProposal.terms,
              money: { amountMinor: activeProposal.amountMinor, currency: activeProposal.currency },
              route: activeProposal.route,
              sourceDigest: activeProposal.sourceDigest,
              paramsHash: activeProposal.paramsHash,
              status: activeProposal.status,
              expiresAt: activeProposal.expiresAt.toISOString(),
            }
          : null,
        pendingConsents,
        activityTimeline: auditEvents.map((ev) => ({
          eventId: ev.id,
          type: ev.eventName,
          actorParty: ev.actorParty || "SYSTEM",
          summary: ev.summary,
          caseVersion: ev.caseVersion,
          at: ev.createdAt.toISOString(),
        })),
      },
      c.caseVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/sources/upload-intents
disputesRouter.post("/disputes/:id/sources/upload-intents", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const { mime, byteCount, originalName } = req.body || {};
    if (!ALLOWED_MIMES.includes(String(mime))) {
      throw new AppError(422, "UNSUPPORTED_MIME", "Only image/jpeg, image/png, and application/pdf are accepted");
    }
    if (Number(byteCount) <= 0 || Number(byteCount) > MAX_BYTES) {
      throw new AppError(422, "VALIDATION_ERROR", "File byteCount must be between 1 byte and 5 MB");
    }

    const activeCount = await prisma.caseSource.count({
      where: { caseId: c.id, audience: { not: "REVOKED" } },
    });
    if (activeCount >= 20) {
      throw new AppError(422, "POLICY_DENIED", "Maximum 20 active source versions reached for this case");
    }

    const uploadId = `upl_${crypto.randomBytes(6).toString("hex")}`;
    const safeName = String(originalName || "evidence").replace(/[^a-zA-Z0-9._-]/g, "_");
    const objectKey = `cases/${c.id}/${uploadId}-${safeName}`;
    const locator = mime === "application/pdf" ? "page:1" : "image:1";

    const src = await prisma.caseSource.create({
      data: {
        caseId: c.id,
        ownerId: req.auth!.userId,
        ownerParty: actorParty,
        originalName: safeName,
        mime: String(mime),
        byteCount: Number(byteCount),
        objectKey,
        uploadId,
        locator,
        scanState: "QUARANTINED",
        audience: "PRIVATE",
        sourceVersion: 1,
      },
    });

    const uploadUrl = await StorageAdapter.createQuarantineUploadUrl(objectKey, String(mime), 600);

    return sendSuccess(
      res,
      {
        sourceId: src.id,
        uploadId: src.uploadId,
        sourceVersion: src.sourceVersion,
        audience: src.audience,
        scanState: src.scanState,
        uploadHandle: {
          method: "PUT",
          url: uploadUrl,
          expiresInSeconds: 600,
        },
      },
      src.sourceVersion,
      201
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/sources/:sid/finalize (Returns 202 with scanState: SCANNING)
disputesRouter.post("/disputes/:id/sources/:sid/finalize", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const src = await prisma.caseSource.findUnique({ where: { id: req.params.sid } });
    if (!src || src.caseId !== c.id || src.ownerId !== req.auth!.userId) {
      throw new AppError(403, "FORBIDDEN", "Source does not belong to the active user");
    }

    requireIfMatch(req.headers["if-match"] as string | undefined, src.sourceVersion);

    const { uploadId } = req.body || {};
    if (uploadId && uploadId !== src.uploadId) {
      throw new AppError(422, "VALIDATION_ERROR", "uploadId does not match upload intent");
    }

    const traceId = generateTraceId("tr_src");
    const updated = await prisma.$transaction(async (db) => {
      const s = await db.caseSource.update({
        where: { id: src.id },
        data: { scanState: "SCANNING" },
      });

      await db.outboxJob.create({
        data: {
          jobType: "SCAN_AND_INDEX_SOURCE",
          payload: {
            tenantId: c.merchantId,
            caseId: c.id,
            sourceId: s.id,
            accessRevision: c.accessRevision,
          },
          traceId,
        },
      });

      return s;
    });

    return sendSuccess(
      res,
      {
        sourceId: updated.id,
        sourceVersion: updated.sourceVersion,
        audience: updated.audience,
        scanState: updated.scanState,
        readyForAnalysis: false,
        indexJobStatus: "QUEUED",
      },
      updated.sourceVersion,
      202,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/disputes/:id/sources/:sid
disputesRouter.get("/disputes/:id/sources/:sid", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const src = await prisma.caseSource.findUnique({ where: { id: req.params.sid } });
    if (!src || src.caseId !== c.id || src.audience === "REVOKED") {
      throw new AppError(404, "SOURCE_UNAVAILABLE", "Source not found or has been revoked");
    }
    if (src.audience === "PRIVATE" && src.ownerParty !== actorParty) {
      throw new AppError(404, "SOURCE_UNAVAILABLE", "Source not visible to opposing party");
    }

    return sendSuccess(
      res,
      {
        sourceId: src.id,
        sourceVersion: src.sourceVersion,
        ownerParty: src.ownerParty,
        originalName: src.originalName,
        mime: src.mime,
        scanState: src.scanState,
        audience: src.audience,
        locator: src.locator,
        caseVersion: c.caseVersion,
        accessRevision: c.accessRevision,
        shareParamsHash:
          src.audience === "PRIVATE" &&
          src.ownerParty === actorParty &&
          src.scanState === "CLEAN"
            ? sourceShareParamsHash({
                caseId: c.id,
                caseVersion: c.caseVersion,
                accessRevision: c.accessRevision,
                sourceId: src.id,
                sourceVersion: src.sourceVersion,
                sha256: src.sha256,
                ownerParty: src.ownerParty,
                actorId: req.auth!.userId,
                audience: "CASE_SHARED",
              })
            : null,
        previewUrl: `/api/v1/disputes/${c.id}/sources/${src.id}/stream?v=${src.sourceVersion}`,
      },
      src.sourceVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/sources/:sid/share
disputesRouter.post("/disputes/:id/sources/:sid/share", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const src = await prisma.caseSource.findUnique({ where: { id: req.params.sid } });
    if (!src || src.caseId !== c.id || src.ownerParty !== actorParty) {
      throw new AppError(403, "FORBIDDEN", "Only the source owner can share this file");
    }

    requireIfMatch(req.headers["if-match"] as string | undefined, src.sourceVersion);

    if (src.scanState !== "CLEAN") {
      throw new AppError(422, "SCAN_FAILED", "Source cannot be shared until scanState is CLEAN");
    }

    const { audience = "CASE_SHARED", consentIntent = "SHARE_SOURCE", paramsHash } = req.body || {};
    if (consentIntent !== "SHARE_SOURCE") {
      throw new AppError(422, "VALIDATION_ERROR", "consentIntent must be SHARE_SOURCE");
    }
    if (!["CASE_SHARED", "PROVIDER_SHARED"].includes(audience)) {
      throw new AppError(422, "VALIDATION_ERROR", "Unsupported source audience");
    }
    const expectedParamsHash = sourceShareParamsHash({
      caseId: c.id,
      caseVersion: c.caseVersion,
      accessRevision: c.accessRevision,
      sourceId: src.id,
      sourceVersion: src.sourceVersion,
      sha256: src.sha256,
      ownerParty: src.ownerParty,
      actorId: req.auth!.userId,
      audience,
    });
    if (!paramsHash || paramsHash !== expectedParamsHash) {
      throw new AppError(409, "STALE_SOURCE_BINDING", "Refresh this source to get a current consent binding", false, c.caseVersion);
    }

    const traceId = generateTraceId("tr_shr");
    const result = await prisma.$transaction(async (db) => {
      const nextSourceVer = src.sourceVersion + 1;
      const nextCaseVer = c.caseVersion + 1;
      const nextAccessRev = c.accessRevision + 1;

      const sourceClaim = await db.caseSource.updateMany({
        where: {
          id: src.id,
          sourceVersion: src.sourceVersion,
          audience: "PRIVATE",
          scanState: "CLEAN",
        },
        data: {
          audience,
          sourceVersion: nextSourceVer,
          sharedAt: new Date(),
        },
      });
      if (sourceClaim.count === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Source changed before sharing", false, src.sourceVersion);
      }

      const caseClaim = await db.disputeCase.updateMany({
        where: { id: c.id, caseVersion: c.caseVersion, accessRevision: c.accessRevision },
        data: {
          caseVersion: nextCaseVer,
          accessRevision: nextAccessRev,
          stage: c.stage === "AWAITING_CONSENT" ? "MEDIATING" : c.stage,
        },
      });
      if (caseClaim.count === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Case changed before sharing", false, c.caseVersion);
      }

      const updatedSrc = await db.caseSource.findUniqueOrThrow({ where: { id: src.id } });
      const updatedCase = await db.disputeCase.findUniqueOrThrow({ where: { id: c.id } });

      const consent = await db.partyConsent.create({
        data: {
          caseId: c.id,
          sourceId: src.id,
          actorId: req.auth!.userId,
          party: actorParty,
          intent: "SHARE_SOURCE",
          decision: "APPROVED",
          paramsHash: expectedParamsHash,
          caseVersion: nextCaseVer,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        },
      });

      // Invalidate any unexecuted proposals and consents on material shared evidence change
      const activeProps = await db.proposal.findMany({
        where: { caseId: c.id, status: "AWAITING_CONSENT" },
      });
      const invalidatedIds = activeProps.map((p) => p.id);
      if (invalidatedIds.length > 0) {
        await db.proposal.updateMany({
          where: { id: { in: invalidatedIds } },
          data: { status: "SUPERSEDED" },
        });
        await db.actionRequest.updateMany({
          where: { proposalId: { in: invalidatedIds }, status: "AWAITING_CONSENT" },
          data: { status: "INVALIDATED" },
        });
        await db.partyConsent.updateMany({
          where: {
            caseId: c.id,
            intent: { in: ["ACCEPT_PROPOSAL_TERMS", "AUTHORIZE_FINANCIAL_EXECUTION"] },
          },
          data: { revoked: true },
        });
      }

      await db.auditEvent.create({
        data: {
          eventName: "SOURCE_SHARED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          actorParty,
          targetType: "DISPUTE_CASE",
          targetId: c.id,
          summary: `Shared ${updatedSrc.originalName} (v${updatedSrc.sourceVersion})`,
          caseVersion: updatedCase.caseVersion,
          controlVersion: updatedCase.controlVersion,
          traceId,
        },
      });

      return { updatedSrc, consent, updatedCase, invalidatedIds };
    });

    return sendSuccess(
      res,
      {
        sourceId: result.updatedSrc.id,
        sourceVersion: result.updatedSrc.sourceVersion,
        audience: result.updatedSrc.audience,
        consentId: result.consent.id,
        caseVersion: result.updatedCase.caseVersion,
        accessRevision: result.updatedCase.accessRevision,
        invalidatedProposalIds: result.invalidatedIds,
      },
      result.updatedCase.caseVersion,
      200,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/sources/:sid/revoke
disputesRouter.post("/disputes/:id/sources/:sid/revoke", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const src = await prisma.caseSource.findUnique({ where: { id: req.params.sid } });
    if (!src || src.caseId !== c.id || src.ownerParty !== actorParty) {
      throw new AppError(403, "FORBIDDEN", "Only the source owner can revoke this file");
    }

    requireIfMatch(req.headers["if-match"] as string | undefined, src.sourceVersion);

    const { reason = "Revoked by owner" } = req.body || {};
    const traceId = generateTraceId("tr_revk");

    const result = await prisma.$transaction(async (db) => {
      const nextSourceVer = src.sourceVersion + 1;
      const nextCaseVer = c.caseVersion + 1;
      const nextAccessRev = c.accessRevision + 1;

      const updatedSrc = await db.caseSource.update({
        where: { id: src.id },
        data: {
          audience: "REVOKED",
          sourceVersion: nextSourceVer,
          readToken: null,
        },
      });

      const activeProps = await db.proposal.findMany({
        where: { caseId: c.id, status: "AWAITING_CONSENT" },
      });
      const invalidatedIds = activeProps.map((p) => p.id);
      if (invalidatedIds.length > 0) {
        await db.proposal.updateMany({
          where: { id: { in: invalidatedIds } },
          data: { status: "SUPERSEDED" },
        });
        await db.actionRequest.updateMany({
          where: { proposalId: { in: invalidatedIds }, status: "AWAITING_CONSENT" },
          data: { status: "INVALIDATED" },
        });
        await db.partyConsent.updateMany({
          where: { caseId: c.id },
          data: { revoked: true },
        });
      }

      const updatedCase = await db.disputeCase.update({
        where: { id: c.id },
        data: {
          caseVersion: nextCaseVer,
          accessRevision: nextAccessRev,
        },
      });

      await db.outboxJob.create({
        data: {
          jobType: "REVOKE_SOURCE",
          payload: {
            tenantId: c.merchantId,
            caseId: c.id,
            sourceId: src.id,
            revokedUpToVersion: nextSourceVer,
            accessRevision: nextAccessRev,
          },
          traceId,
        },
      });

      await db.auditEvent.create({
        data: {
          eventName: "SOURCE_REVOKED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          actorParty,
          targetType: "DISPUTE_CASE",
          targetId: c.id,
          summary: `Revoked ${updatedSrc.originalName}`,
          reason: String(reason),
          caseVersion: updatedCase.caseVersion,
          controlVersion: updatedCase.controlVersion,
          traceId,
        },
      });

      return { updatedSrc, updatedCase, invalidatedIds };
    });

    return sendSuccess(
      res,
      {
        sourceId: result.updatedSrc.id,
        sourceVersion: result.updatedSrc.sourceVersion,
        audience: result.updatedSrc.audience,
        caseVersion: result.updatedCase.caseVersion,
        accessRevision: result.updatedCase.accessRevision,
        invalidatedProposalIds: result.invalidatedIds,
        purgeScheduled: true,
      },
      result.updatedCase.caseVersion,
      200,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/messages
disputesRouter.post("/disputes/:id/messages", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const { text, sourceRefs = [], audience = "CASE_SHARED" } = req.body || {};
    if (!text) throw new AppError(422, "VALIDATION_ERROR", "Message text is required");

    const isShared = audience === "CASE_SHARED";
    requireIfMatch(
      req.headers["if-match"] as string | undefined,
      isShared ? c.caseVersion : c.privateContextVersion
    );

    const traceId = generateTraceId("tr_msg");
    const result = await prisma.$transaction(async (db) => {
      const msg = await db.caseMessage.create({
        data: {
          caseId: c.id,
          authorId: req.auth!.userId,
          authorParty: actorParty,
          audience: isShared ? "CASE_SHARED" : "PRIVATE",
          text: String(text),
          sourceRefs: Array.isArray(sourceRefs) ? sourceRefs : [],
          version: 1,
        },
      });

      const updatedCase = await db.disputeCase.update({
        where: { id: c.id },
        data: {
          ...(isShared
            ? {
                caseVersion: { increment: 1 },
                ...(actorParty === "CUSTOMER"
                  ? { customerStatement: String(text) }
                  : { sellerStatement: String(text) }),
              }
            : { privateContextVersion: { increment: 1 } }),
        },
      });

      return { msg, updatedCase };
    });

    return sendSuccess(
      res,
      {
        messageId: result.msg.id,
        party: result.msg.authorParty,
        audience: result.msg.audience,
        caseVersion: result.updatedCase.caseVersion,
        privateContextVersion: result.updatedCase.privateContextVersion,
      },
      result.updatedCase.caseVersion,
      201,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/assessments
disputesRouter.post("/disputes/:id/assessments", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    getActorParty(req.auth!, c);

    requireIfMatch(req.headers["if-match"] as string | undefined, c.caseVersion);
    if (c.control === "PAUSED") {
      throw new AppError(409, "CASE_PAUSED", "Case workflow is currently paused by a supervisor", false, c.caseVersion);
    }

    const traceId = generateTraceId("tr_asmt");
    const run = await prisma.$transaction(async (db) => {
      const r = await db.agentRun.create({
        data: {
          actorId: req.auth!.userId,
          caseId: c.id,
          purpose: "SHARED_ASSESSMENT",
          audience: "CASE_SHARED",
          inputVersion: c.caseVersion,
          accessRevision: c.accessRevision,
          status: "QUEUED",
        },
      });

      await db.outboxJob.create({
        data: {
          jobType: "RUN_AI_ASSESSMENT",
          payload: {
            runId: r.id,
            caseId: c.id,
            purpose: "SHARED_ASSESSMENT",
            expectedContextVersion: c.caseVersion,
          },
          traceId,
        },
      });

      return r;
    });

    return sendSuccess(
      res,
      {
        runId: run.id,
        caseId: c.id,
        inputVersion: c.caseVersion,
        status: "QUEUED",
      },
      c.caseVersion,
      202,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/mediation-consents (Dedicated CONTINUE_MEDIATION consent)
disputesRouter.post("/disputes/:id/mediation-consents", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    requireIfMatch(req.headers["if-match"] as string | undefined, c.caseVersion);

    const {
      consentIntent = "CONTINUE_MEDIATION",
      assessmentRunId,
      paramsHash,
      decision = "APPROVED",
    } = req.body || {};
    if (consentIntent !== "CONTINUE_MEDIATION") {
      throw new AppError(422, "VALIDATION_ERROR", "consentIntent must be CONTINUE_MEDIATION");
    }
    if (c.control !== "RUNNING") {
      throw new AppError(409, "CASE_PAUSED", "Mediation consent is unavailable while case control is not RUNNING", false, c.caseVersion);
    }
    if (decision !== "APPROVED" && decision !== "REJECTED") {
      throw new AppError(422, "VALIDATION_ERROR", "decision must be APPROVED or REJECTED");
    }
    const latestRun = await prisma.agentRun.findFirst({
      where: {
        caseId: c.id,
        purpose: "SHARED_ASSESSMENT",
        status: { in: ["NEEDS_INFO", "COMPLETED", "ABSTAINED"] },
      },
      orderBy: { createdAt: "desc" },
    });
    if (
      typeof assessmentRunId !== "string" ||
      !latestRun ||
      latestRun.id !== assessmentRunId ||
      latestRun.inputVersion !== c.caseVersion ||
      latestRun.accessRevision !== c.accessRevision
    ) {
      throw new AppError(409, "STALE_ASSESSMENT", "Use the latest assessment for the current case and evidence version", false, c.caseVersion);
    }
    const sharedSources = await prisma.caseSource.findMany({
      where: {
        caseId: c.id,
        scanState: "CLEAN",
        audience: { in: ["CASE_SHARED", "PROVIDER_SHARED"] },
      },
    });
    const sourceDigest = sourceManifestDigest(
      c.id,
      c.caseVersion,
      c.accessRevision,
      sharedSources,
    );
    const expectedParamsHash = mediationConsentParamsHash({
      caseId: c.id,
      caseVersion: c.caseVersion,
      accessRevision: c.accessRevision,
      sourceDigest,
      assessmentRunId: latestRun.id,
    });
    if (paramsHash !== expectedParamsHash) {
      throw new AppError(409, "STALE_MEDIATION_BINDING", "Refresh the case before recording mediation consent", false, c.caseVersion);
    }

    const consent = await prisma.partyConsent.create({
      data: {
        caseId: c.id,
        actorId: req.auth!.userId,
        party: actorParty,
        intent: "CONTINUE_MEDIATION",
        decision,
        paramsHash: expectedParamsHash,
        caseVersion: c.caseVersion,
        expiresAt: new Date(Date.now() + 24 * 3600 * 1000),
      },
    });

    return sendSuccess(
      res,
      {
        consentId: consent.id,
        caseId: c.id,
        party: consent.party,
        intent: consent.intent,
        decision: consent.decision,
        caseVersion: c.caseVersion,
        approvedAt: consent.approvedAt.toISOString(),
      },
      c.caseVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/proposals
disputesRouter.post("/disputes/:id/proposals", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    requireIfMatch(req.headers["if-match"] as string | undefined, c.caseVersion);
    if (c.control !== "RUNNING") {
      throw new AppError(409, "CASE_PAUSED", "Cannot create proposal while case control is not RUNNING", false, c.caseVersion);
    }

    const { terms, money, route = "PAYPAL_CAPTURE_REFUND", sourceDigest, expiresInMinutes = 60 } = req.body || {};
    const amountMinor = Number(money?.amountMinor || 0);
    const currency = String(money?.currency || "USD");

    if (typeof sourceDigest !== "string") {
      throw new AppError(422, "SOURCE_MANIFEST_REQUIRED", "Refresh the case to get the current source manifest binding");
    }
    const sharedSources = await prisma.caseSource.findMany({
      where: {
        caseId: c.id,
        scanState: "CLEAN",
        audience: { in: ["CASE_SHARED", "PROVIDER_SHARED"] },
      },
    });
    const authoritativeSourceDigest = sourceManifestDigest(
      c.id,
      c.caseVersion,
      c.accessRevision,
      sharedSources,
    );
    if (sourceDigest !== authoritativeSourceDigest) {
      throw new AppError(409, "STALE_SOURCE_MANIFEST", "Shared evidence changed; refresh the case before drafting a proposal", false, c.caseVersion);
    }

    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ id: c.transactionId || "" }, { orderId: c.orderId }] },
    });
    if (!tx || amountMinor <= 0 || amountMinor > tx.refundableRemainingMinor) {
      throw new AppError(
        422,
        "POLICY_DENIED",
        `Proposed amountMinor (${amountMinor}) must be > 0 and <= remaining refundable balance (${tx?.refundableRemainingMinor || 0})`
      );
    }

    const nextCaseVer = c.caseVersion + 1;
    const paramsHash = canonicalHash({
      caseId: c.id,
      caseVersion: nextCaseVer,
      proposerParty: actorParty,
      terms,
      amountMinor,
      currency,
      route,
      sourceDigest: authoritativeSourceDigest,
    });

    const expiresAt = new Date(Date.now() + Number(expiresInMinutes) * 60 * 1000);
    const traceId = generateTraceId("tr_prop");

    const created = await prisma.$transaction(async (db) => {
      const priorCount = await db.proposal.count({ where: { caseId: c.id } });
      const proposalVersion = priorCount + 1;

      await db.proposal.updateMany({
        where: { caseId: c.id, status: "AWAITING_CONSENT" },
        data: { status: "SUPERSEDED" },
      });

      const prop = await db.proposal.create({
        data: {
          caseId: c.id,
          proposerParty: actorParty,
          proposalVersion,
          caseVersion: nextCaseVer,
          terms: String(terms),
          amountMinor,
          currency,
          route: route as any,
          sourceDigest: authoritativeSourceDigest,
          paramsHash,
          status: "AWAITING_CONSENT",
          expiresAt,
        },
      });

      const actReq = await db.actionRequest.create({
        data: {
          caseId: c.id,
          proposalId: prop.id,
          proposalVersion,
          caseVersion: nextCaseVer,
          route: route as any,
          amountMinor,
          currency,
          paramsHash,
          status: "AWAITING_CONSENT",
        },
      });

      await db.approvalRequest.create({
        data: {
          caseId: c.id,
          actionRequestId: actReq.id,
          scope: "ALLOW_VOLUNTARY_SETTLEMENT_PROPOSAL",
          amountMinor,
          currency,
          paramsHash,
          caseVersion: nextCaseVer,
          proposalVersion,
          status: "PENDING",
        },
      });

      const updatedCase = await db.disputeCase.update({
        where: { id: c.id },
        data: {
          stage: "AWAITING_CONSENT",
          caseVersion: nextCaseVer,
        },
      });

      await db.auditEvent.create({
        data: {
          eventName: "PROPOSAL_CREATED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          actorParty,
          targetType: "DISPUTE_CASE",
          targetId: c.id,
          summary: `${actorParty} proposed USD ${(amountMinor / 100).toFixed(2)} settlement`,
          caseVersion: updatedCase.caseVersion,
          controlVersion: updatedCase.controlVersion,
          traceId,
        },
      });

      return { prop, actReq, updatedCase };
    });

    return sendSuccess(
      res,
      {
        proposalId: created.prop.id,
        proposalVersion: created.prop.proposalVersion,
        proposerParty: created.prop.proposerParty,
        caseVersion: created.updatedCase.caseVersion,
        stage: created.updatedCase.stage,
        actionRequestId: created.actReq.id,
        paramsHash: created.prop.paramsHash,
        requiredConsents: [
          { party: "SELLER", intent: "ACCEPT_PROPOSAL_TERMS", status: "PENDING" },
          { party: "CUSTOMER", intent: "ACCEPT_PROPOSAL_TERMS", status: "PENDING" },
          { party: "SELLER", intent: "AUTHORIZE_FINANCIAL_EXECUTION", status: "PENDING" },
        ],
        expiresAt: created.prop.expiresAt.toISOString(),
      },
      created.updatedCase.caseVersion,
      201,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/disputes/:id/reviews (Increments controlVersion only; does NOT change caseVersion)
disputesRouter.post("/disputes/:id/reviews", requireSession, async (req, res) => {
  try {
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    const { reason, contestedFindingIds = [], newSourceRefs = [] } = req.body || {};
    if (!reason) throw new AppError(422, "VALIDATION_ERROR", "Review reason is required");

    const result = await prisma.$transaction(async (db) => {
      const rev = await db.reviewRequest.create({
        data: {
          caseId: c.id,
          requesterId: req.auth!.userId,
          requesterParty: actorParty,
          reason: String(reason),
          contestedFindingIds,
          newSourceRefs,
        },
      });

      const updatedCase = await db.disputeCase.update({
        where: { id: c.id },
        data: {
          control: "WAITING_ADMIN",
          controlVersion: { increment: 1 },
          gateReason: "PARTY_REQUESTED_REVIEW",
        },
      });

      return { rev, updatedCase };
    });

    return sendSuccess(
      res,
      {
        reviewRequestId: result.rev.id,
        caseId: c.id,
        control: result.updatedCase.control,
        controlVersion: result.updatedCase.controlVersion,
        caseVersion: result.updatedCase.caseVersion,
      },
      result.updatedCase.caseVersion,
      201
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/action-requests/:id/consents
disputesRouter.post("/action-requests/:id/consents", requireSession, async (req, res) => {
  try {
    const actReq = await prisma.actionRequest.findUnique({ where: { id: req.params.id } });
    if (!actReq) throw new AppError(404, "NOT_FOUND", "ActionRequest not found");

    const c = await prisma.disputeCase.findUnique({ where: { id: actReq.caseId } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");
    const actorParty = getActorParty(req.auth!, c);

    requireIfMatch(req.headers["if-match"] as string | undefined, actReq.proposalVersion);

    const { paramsHash, caseVersion, intent, decision = "APPROVED", stepUpId } = req.body || {};
    if (paramsHash !== actReq.paramsHash || Number(caseVersion) !== c.caseVersion) {
      throw new AppError(
        409,
        "STALE_CONSENT",
        "Action parameters or caseVersion changed after this proposal was created",
        false,
        c.caseVersion
      );
    }

    if (intent === "AUTHORIZE_FINANCIAL_EXECUTION" && actorParty !== "SELLER") {
      throw new AppError(403, "FORBIDDEN", "Only the Seller fund owner can grant AUTHORIZE_FINANCIAL_EXECUTION");
    }

    if (intent === "AUTHORIZE_FINANCIAL_EXECUTION") {
      if (!stepUpId) {
        throw new AppError(
          403,
          "STEP_UP_REQUIRED",
          "Financial authorization requires a fresh MFA verification"
        );
      }
      await verifyStepUpToken(req.auth!.userId, stepUpId, "MERCHANT_EXECUTION", actReq.id);
    }

    const consent = await prisma.partyConsent.create({
      data: {
        caseId: c.id,
        actionRequestId: actReq.id,
        actorId: req.auth!.userId,
        party: actorParty,
        intent: intent as any,
        decision: decision === "REJECTED" ? "REJECTED" : "APPROVED",
        paramsHash: actReq.paramsHash,
        caseVersion: c.caseVersion,
        proposalVersion: actReq.proposalVersion,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    if (decision === "REJECTED") {
      await prisma.proposal.update({
        where: { id: actReq.proposalId },
        data: { status: "REJECTED" },
      });
      await prisma.disputeCase.update({
        where: { id: c.id },
        data: { stage: "MEDIATING" },
      });
    }

    const allConsents = await prisma.partyConsent.findMany({
      where: { actionRequestId: actReq.id, revoked: false, decision: "APPROVED" },
    });

    const hasSellerTerms = allConsents.some((x) => x.party === "SELLER" && x.intent === "ACCEPT_PROPOSAL_TERMS");
    const hasCustTerms = allConsents.some((x) => x.party === "CUSTOMER" && x.intent === "ACCEPT_PROPOSAL_TERMS");
    const hasSellerExec = allConsents.some((x) => x.party === "SELLER" && x.intent === "AUTHORIZE_FINANCIAL_EXECUTION");
    const allRequiredConsentsMet = hasSellerTerms && hasCustTerms && hasSellerExec;

    return sendSuccess(
      res,
      {
        consentId: consent.id,
        actionRequestId: actReq.id,
        party: consent.party,
        intent: consent.intent,
        decision: consent.decision,
        paramsHash: consent.paramsHash,
        allRequiredConsentsMet,
        approvedAt: consent.approvedAt.toISOString(),
        expiresAt: consent.expiresAt.toISOString(),
      },
      c.caseVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});
