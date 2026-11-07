import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireSession, verifyStepUpToken } from "../middleware/auth";
import { checkIdempotency, saveIdempotency } from "../middleware/idempotency";
import { AppError, requireIfMatch, sendError, sendSuccess } from "../utils/envelope";
import { generateTraceId } from "../utils/crypto";
import { PayPalAdapter } from "../integrations/paypal.adapter";

export const adminRouter = Router();

function requireAdminWorkspace(req: any) {
  if (req.auth?.workspaceType !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Endpoint requires an active ADMIN workspace session");
  }
}

// GET /api/v1/admin/disputes
adminRouter.get("/admin/disputes", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const { filter = "ALL" } = req.query;

    let where: any = {};
    if (filter === "NEEDS_REVIEW") where = { control: "WAITING_ADMIN" };
    else if (filter === "MANUAL") where = { control: "MANUAL" };
    else if (filter === "CLOSED") where = { stage: { in: ["RESOLVED", "CLOSED_NO_AGREEMENT"] } };

    const cases = await prisma.disputeCase.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    const items = await Promise.all(
      cases.map(async (c) => {
        const pendingApv = await prisma.approvalRequest.findFirst({
          where: { caseId: c.id, status: "PENDING" },
        });
        return {
          caseId: c.id,
          transactionId: c.transactionId,
          merchantId: c.merchantId,
          initiatorParty: c.initiatorParty,
          stage: c.stage,
          control: c.control,
          controlVersion: c.controlVersion,
          caseVersion: c.caseVersion,
          gateReason: c.gateReason,
          assignedReviewerId: c.assignedReviewerId,
          pendingApprovalRequestId: pendingApv?.id || null,
          updatedAt: c.updatedAt.toISOString(),
        };
      })
    );

    return sendSuccess(res, { items });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/admin/disputes/:id (Metadata by default; shared sources only when assigned + disputes.investigate)
adminRouter.get("/admin/disputes/:id", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");

    const canInvestigate =
      req.auth!.permissions.includes("disputes.investigate") && c.assignedReviewerId === req.auth!.userId;

    const sharedSources = canInvestigate
      ? await prisma.caseSource.findMany({
          where: { caseId: c.id, audience: { in: ["CASE_SHARED", "PROVIDER_SHARED"] } },
        })
      : [];

    const latestRun = canInvestigate
      ? await prisma.agentRun.findFirst({
          where: { caseId: c.id, purpose: "SHARED_ASSESSMENT" },
          orderBy: { createdAt: "desc" },
        })
      : null;

    const pendingApprovalRequests = await prisma.approvalRequest.findMany({
      where: { caseId: c.id, status: "PENDING" },
    });

    return sendSuccess(
      res,
      {
        case: {
          caseId: c.id,
          transactionId: c.transactionId,
          merchantId: c.merchantId,
          initiatorParty: c.initiatorParty,
          stage: c.stage,
          control: c.control,
          controlVersion: c.controlVersion,
          caseVersion: c.caseVersion,
          assignedReviewerId: c.assignedReviewerId,
          investigationAccessGranted: canInvestigate,
        },
        sharedPerspectives: canInvestigate
          ? {
              customerStatement: c.customerStatement,
              sellerStatement: c.sellerStatement,
            }
          : null,
        sharedSources: sharedSources.map((s) => ({
          sourceId: s.id,
          sourceVersion: s.sourceVersion,
          ownerParty: s.ownerParty,
          originalName: s.originalName,
          locator: s.locator,
        })),
        latestAssessment: latestRun?.resultPayload || null,
        pendingApprovalRequests: pendingApprovalRequests.map((ap) => ({
          approvalRequestId: ap.id,
          scope: ap.scope,
          caseVersion: ap.caseVersion,
          status: ap.status,
        })),
      },
      c.caseVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/admin/disputes/:id/assignments
adminRouter.post("/admin/disputes/:id/assignments", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");

    const { reviewerId = req.auth!.userId, conflictDeclarationAccepted, reason } = req.body || {};
    if (!conflictDeclarationAccepted || !reason) {
      throw new AppError(422, "VALIDATION_ERROR", "conflictDeclarationAccepted and reason are required");
    }

    // Conflict of interest check: Reviewer cannot be the Customer on the case
    if (reviewerId === c.customerId) {
      throw new AppError(403, "CONFLICT_OF_INTEREST", "Reviewer cannot be a party to the transaction");
    }

    const assignment = await prisma.caseAssignment.create({
      data: {
        caseId: c.id,
        reviewerId: String(reviewerId),
        conflictDeclarationAccepted: Boolean(conflictDeclarationAccepted),
        reason: String(reason),
      },
    });

    await prisma.disputeCase.update({
      where: { id: c.id },
      data: { assignedReviewerId: String(reviewerId) },
    });

    return sendSuccess(
      res,
      {
        assignmentId: assignment.id,
        caseId: c.id,
        reviewerId: assignment.reviewerId,
        assignedAt: assignment.assignedAt.toISOString(),
      },
      c.caseVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/admin/disputes/:id/interventions (Uses If-Match: controlVersion; NEVER increments caseVersion)
adminRouter.post("/admin/disputes/:id/interventions", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const c = await prisma.disputeCase.findUnique({ where: { id: req.params.id } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");

    requireIfMatch(req.headers["if-match"] as string | undefined, c.controlVersion);

    const { action, reason, stepUpId } = req.body || {};
    if (!action || !reason) {
      throw new AppError(422, "VALIDATION_ERROR", "action and reason are required");
    }

    await verifyStepUpToken(req.auth!.userId, stepUpId, "ADMIN_INTERVENTION", c.id);

    let nextControl: "RUNNING" | "WAITING_ADMIN" | "PAUSED" | "MANUAL" = "RUNNING";
    if (action === "PAUSE") nextControl = "PAUSED";
    else if (action === "SET_MANUAL" || action === "OFFICIAL_HANDOFF") nextControl = "MANUAL";
    else if (action === "REQUEST_INVESTIGATION") nextControl = "WAITING_ADMIN";
    else nextControl = "RUNNING";

    const traceId = generateTraceId("tr_adm");
    const decisionId = `dec_${Date.now().toString(36)}`;

    const updated = await prisma.$transaction(async (db) => {
      const nextControlVer = c.controlVersion + 1;
      const u = await db.disputeCase.update({
        where: { id: c.id },
        data: {
          control: nextControl,
          controlVersion: nextControlVer,
          stage: action === "OFFICIAL_HANDOFF" ? "EXTERNAL_PENDING" : c.stage,
        },
      });

      await db.auditEvent.create({
        data: {
          eventName: "ADMIN_INTERVENTION",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          actorParty: "ADMIN",
          targetType: "DISPUTE_CASE",
          targetId: c.id,
          summary: `Supervisor recorded ${action}`,
          reason: String(reason),
          caseVersion: u.caseVersion,
          controlVersion: u.controlVersion,
          traceId,
        },
      });

      return u;
    });

    return sendSuccess(
      res,
      {
        decisionId,
        caseId: updated.id,
        control: updated.control,
        controlVersion: updated.controlVersion,
        stage: updated.stage,
        caseVersion: updated.caseVersion,
        resumeTriggered: nextControl === "RUNNING",
      },
      updated.caseVersion,
      200,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/admin/approval-requests
adminRouter.get("/admin/approval-requests", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const items = await prisma.approvalRequest.findMany({
      orderBy: { createdAt: "desc" },
    });
    return sendSuccess(res, {
      items: items.map((ap) => ({
        approvalRequestId: ap.id,
        caseId: ap.caseId,
        actionRequestId: ap.actionRequestId,
        scope: ap.scope,
        amountMinor: ap.amountMinor,
        currency: ap.currency,
        paramsHash: ap.paramsHash,
        caseVersion: ap.caseVersion,
        proposalVersion: ap.proposalVersion,
        status: ap.status,
        createdAt: ap.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/admin/approval-requests/:id/decisions
adminRouter.post("/admin/approval-requests/:id/decisions", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const ap = await prisma.approvalRequest.findUnique({ where: { id: req.params.id } });
    if (!ap) throw new AppError(404, "NOT_FOUND", "ApprovalRequest not found");

    requireIfMatch(req.headers["if-match"] as string | undefined, ap.proposalVersion);

    const { decision, scope, paramsHash, caseVersion, stepUpId, reason } = req.body || {};
    if (paramsHash !== ap.paramsHash || Number(caseVersion) !== ap.caseVersion || scope !== ap.scope) {
      throw new AppError(409, "STALE_CONSENT", "Approval request parameters or caseVersion do not match", false, ap.caseVersion);
    }

    await verifyStepUpToken(req.auth!.userId, stepUpId, "ADMIN_APPROVAL");

    const decisionId = `dec_${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.approvalRequest.update({
      where: { id: ap.id },
      data: {
        status: decision === "REJECTED" ? "REJECTED" : "APPROVED",
        decisionId,
        reviewerId: req.auth!.userId,
        reason: String(reason || ""),
        expiresAt,
      },
    });

    return sendSuccess(
      res,
      {
        decisionId,
        approvalRequestId: ap.id,
        decision: decision === "REJECTED" ? "REJECTED" : "APPROVED",
        expiresAt: expiresAt.toISOString(),
      },
      ap.caseVersion
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/admin/audit-events
adminRouter.get("/admin/audit-events", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const { caseId } = req.query;
    const items = await prisma.auditEvent.findMany({
      where: caseId ? { targetId: String(caseId) } : undefined,
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, {
      items: items.map((ev) => ({
        auditId: ev.id,
        eventName: ev.eventName,
        actorId: ev.actorId,
        workspaceId: ev.workspaceId,
        targetType: ev.targetType,
        targetId: ev.targetId,
        reason: ev.reason,
        caseVersion: ev.caseVersion,
        controlVersion: ev.controlVersion,
        traceId: ev.traceId,
        createdAt: ev.createdAt.toISOString(),
      })),
      nextCursor: null,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/action-requests/:id/execute (Atomic CAS claim + PayPal Capture Refund executor)
adminRouter.post("/action-requests/:id/execute", requireSession, async (req, res) => {
  try {
    const routeKey = `POST:/api/v1/action-requests/${req.params.id}/execute`;
    const idem = await checkIdempotency(req, routeKey);
    if (idem.cachedResponse) {
      return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    }

    const actReq = await prisma.actionRequest.findUnique({ where: { id: req.params.id } });
    if (!actReq) throw new AppError(404, "NOT_FOUND", "ActionRequest not found");

    const c = await prisma.disputeCase.findUnique({ where: { id: actReq.caseId } });
    if (!c) throw new AppError(404, "NOT_FOUND", "Dispute case not found");

    if (req.auth!.workspaceType !== "SELLER" || req.auth!.merchantId !== c.merchantId) {
      throw new AppError(403, "FORBIDDEN", "Only the authorized Seller merchant can execute settlement refunds");
    }

    requireIfMatch(req.headers["if-match"] as string | undefined, c.caseVersion);

    if (c.control !== "RUNNING") {
      throw new AppError(409, "CASE_PAUSED", "Cannot execute action while workflow control is not RUNNING", false, c.caseVersion);
    }

    const { paramsHash } = req.body || {};
    if (paramsHash !== actReq.paramsHash || actReq.caseVersion !== c.caseVersion) {
      throw new AppError(409, "STALE_CONSENT", "ActionRequest parameters or caseVersion are stale", false, c.caseVersion);
    }

    // Verify all 3 required consents are valid, unrevoked, and unexpired
    const now = new Date();
    const consents = await prisma.partyConsent.findMany({
      where: {
        actionRequestId: actReq.id,
        revoked: false,
        decision: "APPROVED",
        expiresAt: { gt: now },
        paramsHash: actReq.paramsHash,
        caseVersion: c.caseVersion,
      },
    });

    const hasSellerTerms = consents.some((x) => x.party === "SELLER" && x.intent === "ACCEPT_PROPOSAL_TERMS");
    const hasCustTerms = consents.some((x) => x.party === "CUSTOMER" && x.intent === "ACCEPT_PROPOSAL_TERMS");
    const hasSellerExec = consents.some((x) => x.party === "SELLER" && x.intent === "AUTHORIZE_FINANCIAL_EXECUTION");

    if (!hasSellerTerms || !hasCustTerms || !hasSellerExec) {
      throw new AppError(409, "STALE_CONSENT", "Missing required bilateral terms consent or merchant financial authorization", false, c.caseVersion);
    }

    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ id: c.transactionId || "" }, { orderId: c.orderId }] },
    });
    if (!tx || !tx.paypalCaptureId || tx.refundableRemainingMinor < actReq.amountMinor) {
      throw new AppError(422, "POLICY_DENIED", "Insufficient remaining refundable balance on capture");
    }

    // Claim ActionRequest atomically
    const claimed = await prisma.actionRequest.updateMany({
      where: { id: actReq.id, status: "AWAITING_CONSENT" },
      data: { status: "CLAIMED" },
    });
    if (claimed.count === 0) {
      const existingOp = await prisma.providerOperation.findUnique({ where: { actionRequestId: actReq.id } });
      if (existingOp) {
        return sendSuccess(
          res,
          {
            operationId: existingOp.id,
            type: existingOp.type,
            actionRequestId: actReq.id,
            caseStage: c.stage,
            operationStatus: existingOp.status,
            pollUrl: `/api/v1/operations/${existingOp.id}`,
          },
          c.caseVersion,
          202
        );
      }
      throw new AppError(409, "VERSION_CONFLICT", "ActionRequest was already claimed or invalidated", false, c.caseVersion);
    }

    // Reserve refundable balance immediately
    await prisma.transaction.update({
      where: { id: tx.id },
      data: { refundableRemainingMinor: { decrement: actReq.amountMinor } },
    });

    let opStatus: "SUCCEEDED" | "UNKNOWN" = "SUCCEEDED";
    let providerRef: string | null = null;

    try {
      const refundRes = await PayPalAdapter.refundCapture({
        captureId: tx.paypalCaptureId,
        amountMinor: actReq.amountMinor,
        currency: actReq.currency,
        note: `VelaPal voluntary settlement for case ${c.id}`,
        requestId: `pp-ref-${actReq.id}`,
      });
      providerRef = refundRes.id;
    } catch {
      opStatus = "UNKNOWN";
    }

    const newCaseStage = opStatus === "SUCCEEDED" ? "RESOLVED" : "EXECUTION_UNKNOWN";
    const operation = await prisma.providerOperation.create({
      data: {
        type: "CAPTURE_REFUND",
        actionRequestId: actReq.id,
        caseId: c.id,
        route: actReq.route,
        status: opStatus,
        amountMinor: actReq.amountMinor,
        currency: actReq.currency,
        paypalCaptureId: tx.paypalCaptureId,
        providerRef,
        requestIdKey: `op-ref-${actReq.id}`,
        verifiedAt: opStatus === "SUCCEEDED" ? new Date() : null,
        nextStep:
          opStatus === "SUCCEEDED"
            ? `Refund of USD ${(actReq.amountMinor / 100).toFixed(2)} verified by PayPal Sandbox.`
            : "Provider timed out. Use Reconcile on this operationId without sending a second refund.",
      },
    });

    await prisma.disputeCase.update({
      where: { id: c.id },
      data: { stage: newCaseStage as any },
    });

    if (opStatus === "SUCCEEDED") {
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          paymentStatus: tx.refundableRemainingMinor - actReq.amountMinor <= 0 ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
    }

    const responsePayload = {
      data: {
        operationId: operation.id,
        type: operation.type,
        actionRequestId: actReq.id,
        caseStage: newCaseStage,
        operationStatus: operation.status,
        pollUrl: `/api/v1/operations/${operation.id}`,
      },
      meta: {
        traceId: generateTraceId("tr_exec"),
        version: c.caseVersion,
        timestamp: new Date().toISOString(),
      },
    };

    await saveIdempotency(req, routeKey, idem.key, idem.requestHash, 202, responsePayload);
    return res.status(202).json(responsePayload);
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/webhooks/paypal (Exempt from CSRF/Origin; verified via PayPal signature)
adminRouter.post("/webhooks/paypal", async (req, res) => {
  try {
    const headers: Record<string, string | undefined> = {
      "paypal-auth-algo": req.headers["paypal-auth-algo"] as string,
      "paypal-cert-url": req.headers["paypal-cert-url"] as string,
      "paypal-transmission-id": req.headers["paypal-transmission-id"] as string,
      "paypal-transmission-sig": req.headers["paypal-transmission-sig"] as string,
      "paypal-transmission-time": req.headers["paypal-transmission-time"] as string,
    };

    const eventBody = req.body || {};
    const valid = await PayPalAdapter.verifyWebhookSignature(headers, eventBody);
    if (!valid) {
      throw new AppError(401, "UNAUTHENTICATED", "Invalid PayPal webhook signature");
    }

    const eventId = String(eventBody.id || `WH-${Date.now()}`);
    await prisma.webhookInbox.upsert({
      where: { id: eventId },
      update: { processed: true, processedAt: new Date() },
      create: {
        id: eventId,
        eventType: String(eventBody.event_type || "UNKNOWN"),
        payload: eventBody,
        processed: true,
        processedAt: new Date(),
      },
    });

    return sendSuccess(res, {
      received: true,
      webhookEventId: eventId,
    });
  } catch (err) {
    return sendError(res, err);
  }
});
