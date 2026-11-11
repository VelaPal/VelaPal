import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireSession, verifyStepUpToken } from "../middleware/auth";
import { checkIdempotency, saveIdempotency } from "../middleware/idempotency";
import { AppError, requireIfMatch, sendError, sendSuccess } from "../utils/envelope";
import { generateTraceId } from "../utils/crypto";
import { PayPalAdapter } from "../integrations/paypal.adapter";

export const adminRouter = Router();

adminRouter.get("/admin/merchant-applications", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const items = await prisma.merchantApplication.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
    const owners = await prisma.user.findMany({ where: { id: { in: [...new Set(items.map((item) => item.userId))] } }, select: { id: true, name: true, emailCanonical: true } });
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
    return sendSuccess(res, { items: items.map((item) => ({ ...item, owner: ownerById.get(item.userId) || null })) });
  } catch (err) { return sendError(res, err); }
});

adminRouter.post("/admin/merchant-applications/:id/review", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const app = await prisma.merchantApplication.findUnique({ where: { id: req.params.id } });
    if (!app) throw new AppError(404, "NOT_FOUND", "Merchant application not found");
    if (app.status !== "PENDING") throw new AppError(409, "APPLICATION_ALREADY_REVIEWED", "Only pending applications can be reviewed");
    const { decision, reason, stepUpId } = req.body || {};
    if (!["APPROVED", "REJECTED"].includes(decision) || typeof reason !== "string" || reason.trim().length < 10) throw new AppError(422, "VALIDATION_ERROR", "Choose APPROVED or REJECTED and provide a review reason");
    await verifyStepUpToken(req.auth!.userId, stepUpId, "ADMIN_APPROVAL", app.id);
    const result = await prisma.$transaction(async (tx) => {
      const reviewed = await tx.merchantApplication.update({ where: { id: app.id }, data: { status: decision, reviewNote: reason.trim(), reviewedBy: req.auth!.userId, reviewedAt: new Date() } });
      if (decision !== "APPROVED") return { application: reviewed, workspace: null };
      const merchantId = `merch_${app.id}`;
      const workspace = await tx.workspace.create({ data: { type: "SELLER", name: app.name, merchantId, memberships: { create: { userId: app.userId, role: "SELLER_OWNER", permissions: ["commerce.read", "commerce.manage", "disputes.read", "disputes.respond"] } } } });
      await tx.sellerProfile.create({ data: { workspaceId: workspace.id, displayName: app.name, website: app.website } });
      return { application: reviewed, workspace: { id: workspace.id, name: workspace.name, merchantId } };
    });
    return sendSuccess(res, result, 1);
  } catch (err) { return sendError(res, err); }
});

function requireAdminWorkspace(req: any) {
  if (req.auth?.workspaceType !== "ADMIN") {
    throw new AppError(403, "FORBIDDEN", "Endpoint requires an active ADMIN workspace session");
  }
}

// Read-only operational screens. These are deliberately sourced from the
// application database so the Admin workspace never has to fall back to UI fixtures.
adminRouter.get("/admin/users", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
      select: {
        id: true,
        name: true,
        emailCanonical: true,
        status: true,
        mfaEnabled: true,
        createdAt: true,
        memberships: {
          where: { status: "ACTIVE" },
          select: { role: true, workspace: { select: { id: true, name: true, type: true } } },
        },
      },
    });
    return sendSuccess(res, {
      items: users.map((user) => ({
        ...user,
        createdAt: user.createdAt.toISOString(),
        memberships: user.memberships.map((membership) => ({
          role: membership.role,
          workspaceId: membership.workspace.id,
          workspaceName: membership.workspace.name,
          workspaceType: membership.workspace.type,
        })),
      })),
    });
  } catch (err) { return sendError(res, err); }
});

adminRouter.get("/admin/transactions", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const items = await prisma.transaction.findMany({
      orderBy: { createdAt: "desc" },
      take: 250,
      select: {
        id: true, orderId: true, customerId: true, merchantId: true, merchantName: true,
        amountMinor: true, refundableRemainingMinor: true, currency: true,
        paymentStatus: true, paypalOrderId: true, paypalCaptureId: true,
        verifiedAt: true, createdAt: true,
      },
    });
    return sendSuccess(res, { items: items.map((item) => ({
      ...item,
      verifiedAt: item.verifiedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })) });
  } catch (err) { return sendError(res, err); }
});

adminRouter.get("/admin/ai-runs", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const [runs, jobStates] = await Promise.all([
      prisma.agentRun.findMany({ orderBy: { createdAt: "desc" }, take: 200, select: {
        id: true, actorId: true, caseId: true, purpose: true, audience: true,
        status: true, inputVersion: true, createdAt: true, updatedAt: true, resultPayload: true,
      } }),
      prisma.outboxJob.groupBy({ by: ["state"], _count: { _all: true } }),
    ]);
    return sendSuccess(res, {
      items: runs.map((run) => {
        const result = run.resultPayload && typeof run.resultPayload === "object" && !Array.isArray(run.resultPayload)
          ? run.resultPayload as Record<string, unknown> : null;
        return {
          runId: run.id, actorId: run.actorId, caseId: run.caseId, purpose: run.purpose,
          audience: run.audience, status: run.status, inputVersion: run.inputVersion,
          modelMode: typeof result?.modelMode === "string" ? result.modelMode : null,
          createdAt: run.createdAt.toISOString(), updatedAt: run.updatedAt.toISOString(),
        };
      }),
      jobs: jobStates.map((item) => ({ state: item.state, count: item._count._all })),
    });
  } catch (err) { return sendError(res, err); }
});

adminRouter.get("/admin/analytics", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const [users, workspaces, transactions, cases, providers, stageCounts, paymentCounts] = await Promise.all([
      prisma.user.count(), prisma.workspace.count(), prisma.transaction.count(),
      prisma.disputeCase.count(), prisma.providerOperation.count(),
      prisma.disputeCase.groupBy({ by: ["stage"], _count: { _all: true } }),
      prisma.transaction.groupBy({ by: ["paymentStatus"], _count: { _all: true } }),
    ]);
    return sendSuccess(res, {
      totals: { users, workspaces, transactions, cases, providerOperations: providers },
      casesByStage: stageCounts.map((item) => ({ stage: item.stage, count: item._count._all })),
      transactionsByStatus: paymentCounts.map((item) => ({ status: item.paymentStatus, count: item._count._all })),
    });
  } catch (err) { return sendError(res, err); }
});

adminRouter.get("/admin/roles", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    const memberships = await prisma.membership.findMany({
      orderBy: [{ workspace: { type: "asc" } }, { role: "asc" }],
      take: 500,
      select: {
        id: true, userId: true, role: true, permissions: true, status: true,
        user: { select: { name: true, emailCanonical: true } },
        workspace: { select: { id: true, name: true, type: true } },
      },
    });
    return sendSuccess(res, { items: memberships.map((item) => ({
      membershipId: item.id, userId: item.userId, name: item.user.name,
      email: item.user.emailCanonical, role: item.role, permissions: item.permissions,
      status: item.status, workspaceId: item.workspace.id, workspaceName: item.workspace.name,
      workspaceType: item.workspace.type,
    })) });
  } catch (err) { return sendError(res, err); }
});

adminRouter.get("/admin/settings", requireSession, async (req, res) => {
  try {
    requireAdminWorkspace(req);
    await prisma.user.count();
    return sendSuccess(res, {
      service: { name: "VelaPal API", status: "CONNECTED", contractVersion: "6.1.2" },
      integrations: {
        database: "CONNECTED",
        paypal: process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET ? "CONFIGURED" : "NOT_CONFIGURED",
        ai: process.env.AI_SERVICE_URL ? "ENDPOINT_CONFIGURED" : "LOCAL_DEFAULT_ENDPOINT",
        storage: process.env.S3_ENDPOINT ? "ENDPOINT_CONFIGURED" : "LOCAL_DEFAULT_ENDPOINT",
      },
      checkedAt: new Date().toISOString(),
    });
  } catch (err) { return sendError(res, err); }
});

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
          mime: s.mime,
          scanState: s.scanState,
          audience: s.audience,
          previewUrl: `/api/v1/disputes/${c.id}/sources/${s.id}/stream?v=${s.sourceVersion}`,
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
      where: { status: "PENDING" },
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
    if (!["APPROVED", "REJECTED"].includes(decision)) {
      throw new AppError(422, "VALIDATION_ERROR", "Decision must be APPROVED or REJECTED");
    }
    if (paramsHash !== ap.paramsHash || Number(caseVersion) !== ap.caseVersion || scope !== ap.scope) {
      throw new AppError(409, "STALE_CONSENT", "Approval request parameters or caseVersion do not match", false, ap.caseVersion);
    }
    if (ap.status !== "PENDING") {
      throw new AppError(409, "VERSION_CONFLICT", "Approval request has already been decided", false, ap.caseVersion);
    }
    if (ap.actionRequestId) {
      const [action, approvalCase] = await Promise.all([
        prisma.actionRequest.findUnique({ where: { id: ap.actionRequestId } }),
        prisma.disputeCase.findUnique({ where: { id: ap.caseId } }),
      ]);
      if (
        !action ||
        action.status !== "AWAITING_CONSENT" ||
        action.caseVersion !== ap.caseVersion ||
        approvalCase?.caseVersion !== ap.caseVersion
      ) {
        throw new AppError(409, "STALE_CONSENT", "Proposal changed before admin review", false, approvalCase?.caseVersion);
      }
    }

    await verifyStepUpToken(req.auth!.userId, stepUpId, "ADMIN_APPROVAL");

    const decisionId = `dec_${Date.now().toString(36)}`;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.$transaction(async (db) => {
      const claimed = await db.approvalRequest.updateMany({
        where: { id: ap.id, status: "PENDING", proposalVersion: ap.proposalVersion },
        data: {
          status: decision,
          decisionId,
          reviewerId: req.auth!.userId,
          reason: String(reason || ""),
          expiresAt: decision === "APPROVED" ? expiresAt : null,
        },
      });
      if (claimed.count === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Approval request was decided by another reviewer", false, ap.caseVersion);
      }
      if (decision === "REJECTED" && ap.actionRequestId) {
        const action = await db.actionRequest.findUnique({ where: { id: ap.actionRequestId } });
        if (action) {
          await db.actionRequest.updateMany({
            where: { id: action.id, status: "AWAITING_CONSENT" },
            data: { status: "INVALIDATED" },
          });
          await db.proposal.updateMany({
            where: { id: action.proposalId, status: "AWAITING_CONSENT" },
            data: { status: "REJECTED" },
          });
        }
      }
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

    const adminApproval = await prisma.approvalRequest.findFirst({
      where: {
        actionRequestId: actReq.id,
        scope: "ALLOW_VOLUNTARY_SETTLEMENT_PROPOSAL",
        status: "APPROVED",
        paramsHash: actReq.paramsHash,
        caseVersion: c.caseVersion,
        expiresAt: { gt: now },
      },
    });
    if (!adminApproval) {
      throw new AppError(409, "POLICY_DENIED", "An active admin approval is required before financial execution", false, c.caseVersion);
    }

    const tx = await prisma.transaction.findFirst({
      where: { OR: [{ id: c.transactionId || "" }, { orderId: c.orderId }] },
    });
    if (!tx || !tx.paypalCaptureId || tx.refundableRemainingMinor < actReq.amountMinor) {
      throw new AppError(422, "POLICY_DENIED", "Insufficient remaining refundable balance on capture");
    }

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

    const traceId = generateTraceId("tr_ref");
    const claimedOperation = await prisma.$transaction(async (db) => {
      const claimed = await db.actionRequest.updateMany({
        where: { id: actReq.id, status: "AWAITING_CONSENT" },
        data: { status: "EXECUTION_PENDING" },
      });
      if (claimed.count === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "ActionRequest is already executing or has been invalidated", false, c.caseVersion);
      }

      const reserved = await db.transaction.updateMany({
        where: { id: tx.id, refundableRemainingMinor: { gte: actReq.amountMinor } },
        data: { refundableRemainingMinor: { decrement: actReq.amountMinor } },
      });
      if (reserved.count === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Refundable balance changed before execution could be claimed", false, c.caseVersion);
      }

      const caseClaim = await db.disputeCase.updateMany({
        where: { id: c.id, caseVersion: c.caseVersion, control: "RUNNING" },
        data: { stage: "EXECUTION_PENDING", caseVersion: { increment: 1 } },
      });
      if (caseClaim.count === 0) {
        throw new AppError(409, "VERSION_CONFLICT", "Case changed before execution could be claimed", false, c.caseVersion);
      }

      return db.providerOperation.create({
        data: {
          type: "CAPTURE_REFUND",
          actionRequestId: actReq.id,
          caseId: c.id,
          route: actReq.route,
          status: "PENDING",
          amountMinor: actReq.amountMinor,
          currency: actReq.currency,
          paypalCaptureId: tx.paypalCaptureId,
          requestIdKey: `op-ref-${actReq.id}`,
          nextStep: "PayPal refund is being processed.",
        },
      });
    });

    // The database claim and refundable-balance reservation are committed
    // before making the provider call. Reuse a stable PayPal request ID.
    let refundRes: Awaited<ReturnType<typeof PayPalAdapter.refundCapture>> | null = null;
    let providerError: unknown = null;
    try {
      refundRes = await PayPalAdapter.refundCapture({
        captureId: tx.paypalCaptureId,
        amountMinor: actReq.amountMinor,
        currency: actReq.currency,
        note: `VelaPal voluntary settlement for case ${c.id}`,
        requestId: `pp-ref-${actReq.id}`,
      });
    } catch (err) {
      providerError = err;
    }

    if (!refundRes?.id || refundRes.status !== "COMPLETED") {
      const nextStep = providerError
        ? "PayPal outcome is unknown. Reconcile this operation before retrying."
        : `PayPal returned ${refundRes?.status || "no confirmed status"}. Reconcile this operation before retrying.`;
      if (providerError) console.error(`[PAYPAL REFUND ${traceId}]`, providerError);
      const updatedCase = await prisma.$transaction(async (db) => {
        await db.actionRequest.updateMany({
          where: { id: actReq.id, status: "EXECUTION_PENDING" },
          data: { status: "EXECUTION_UNKNOWN" },
        });
        await db.providerOperation.update({
          where: { id: claimedOperation.id },
          data: {
            status: "UNKNOWN",
            providerRef: refundRes?.id ?? null,
            nextStep,
          },
        });
        const updated = await db.disputeCase.update({
          where: { id: c.id },
          data: { stage: "EXECUTION_UNKNOWN", caseVersion: { increment: 1 } },
        });
        await db.auditEvent.create({
          data: {
            eventName: "FINANCIAL_EXECUTION_UNKNOWN",
            actorId: req.auth!.userId,
            workspaceId: req.auth!.workspaceId,
            actorParty: "SELLER",
            targetType: "DISPUTE_CASE",
            targetId: c.id,
            summary: "PayPal refund outcome requires reconciliation",
            caseVersion: updated.caseVersion,
            controlVersion: updated.controlVersion,
            traceId,
          },
        });
        return updated;
      });
      return sendSuccess(res, {
        operationId: claimedOperation.id,
        type: claimedOperation.type,
        actionRequestId: actReq.id,
        caseStage: updatedCase.stage,
        operationStatus: "UNKNOWN",
        pollUrl: `/api/v1/operations/${claimedOperation.id}`,
        nextStep,
      }, updatedCase.caseVersion, 202, traceId);
    }

    const { operation, updatedCase } = await prisma.$transaction(async (db) => {
      await db.actionRequest.update({
        where: { id: actReq.id },
        data: { status: "COMPLETED" },
      });

      const updatedTx = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
      const recordedTx = await db.transaction.update({
        where: { id: tx.id },
        data: {
          paymentStatus: updatedTx.refundableRemainingMinor === 0 ? "REFUNDED" : "PARTIALLY_REFUNDED",
        },
      });
      const op = await db.providerOperation.update({
        where: { id: claimedOperation.id },
        data: {
          status: "SUCCEEDED",
          providerRef: refundRes.id,
          verifiedAt: new Date(),
          nextStep: `Refund of ${actReq.currency} ${(actReq.amountMinor / 100).toFixed(2)} verified by PayPal.`,
        },
      });
      const updated = await db.disputeCase.update({
        where: { id: c.id },
        data: { stage: "RESOLVED", caseVersion: { increment: 1 } },
      });
      await db.auditEvent.create({
        data: {
          eventName: "FINANCIAL_EXECUTION_SUCCEEDED",
          actorId: req.auth!.userId,
          workspaceId: req.auth!.workspaceId,
          actorParty: "SELLER",
          targetType: "DISPUTE_CASE",
          targetId: c.id,
          summary: `PayPal refund of ${actReq.currency} ${(actReq.amountMinor / 100).toFixed(2)} completed (${recordedTx.paymentStatus})`,
          caseVersion: updated.caseVersion,
          controlVersion: updated.controlVersion,
          traceId,
        },
      });
      return { operation: op, updatedCase: updated };
    });

    const newCaseStage = updatedCase.stage;

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
        traceId,
        version: updatedCase.caseVersion,
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
    const eventType = String(eventBody.event_type || "UNKNOWN");
    const inbox = await prisma.webhookInbox.upsert({
      where: { id: eventId },
      update: {},
      create: { id: eventId, eventType, payload: eventBody, processed: false },
    });
    if (!inbox.processed) {
      const resource = eventBody.resource || {};
      if (eventType.startsWith("BILLING.SUBSCRIPTION.")) {
        const subscriptionId = String(resource.id || resource.billing_agreement_id || "");
        const item = subscriptionId ? await prisma.subscription.findUnique({ where: { paypalSubscriptionId: subscriptionId } }) : null;
        if (item) {
          const eventStatus: Record<string, string> = {
            "BILLING.SUBSCRIPTION.CREATED": "APPROVAL_PENDING",
            "BILLING.SUBSCRIPTION.ACTIVATED": "ACTIVE",
            "BILLING.SUBSCRIPTION.CANCELLED": "CANCELLED",
            "BILLING.SUBSCRIPTION.SUSPENDED": "SUSPENDED",
            "BILLING.SUBSCRIPTION.EXPIRED": "EXPIRED",
          };
          const status = String(resource.status || eventStatus[eventType] || item.status);
          await prisma.subscription.update({ where: { id: item.id }, data: { status, statusUpdatedAt: new Date(), nextBillingTime: resource.billing_info?.next_billing_time ? new Date(resource.billing_info.next_billing_time) : item.nextBillingTime } });
        }
      } else if (eventType === "MERCHANT.ONBOARDING.COMPLETED") {
        const trackingId = String(resource.tracking_id || resource.merchant_id || "");
        const merchantId = String(resource.merchant_id_in_paypal || resource.payer_id || "");
        const profile = trackingId ? await prisma.sellerProfile.findFirst({ where: { paypalTrackingId: trackingId } }) : null;
        if (profile && merchantId) {
          const integration = await PayPalAdapter.getSellerIntegration(merchantId);
          if (integration.payments_receivable === true && integration.primary_email_confirmed === true) {
            const grants = (integration.oauth_integrations || []).filter((grant: any) => grant.integration_method === "PAYPAL").flatMap((grant: any) => Array.isArray(grant.oauth_third_party) ? grant.oauth_third_party : [grant.oauth_third_party || {}]);
            const selectedGrants = grants.filter((grant: any) => grant.partner_client_id === process.env.PAYPAL_CLIENT_ID && Array.isArray(grant.scopes));
            const paypalSubscriptionEnabled = selectedGrants.some((grant: any) => grant.scopes.some((scope: string) => scope.includes("/services/subscriptions")));
            await prisma.sellerProfile.update({ where: { id: profile.id }, data: { paypalMerchantId: merchantId, paypalStatus: "ACTIVE", paypalSubscriptionEnabled, paypalCapabilities: integration.oauth_integrations || [] } });
          }
        }
      }
      await prisma.webhookInbox.update({ where: { id: eventId }, data: { processed: true, processedAt: new Date() } });
    }

    return sendSuccess(res, {
      received: true,
      webhookEventId: eventId,
    });
  } catch (err) {
    return sendError(res, err);
  }
});
