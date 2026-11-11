import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireSession } from "../middleware/auth";
import { checkIdempotency, saveIdempotency } from "../middleware/idempotency";
import { AppError, sendError, sendSuccess } from "../utils/envelope";
import { canonicalHash, generateTraceId } from "../utils/crypto";
import { PayPalAdapter } from "../integrations/paypal.adapter";

export const commerceRouter = Router();

// GET /api/v1/catalog
commerceRouter.get("/catalog", requireSession, async (req, res) => {
  try {
    const { type } = req.query;
    const items = await prisma.product.findMany({
      where: { status: "PUBLISHED", ...(type ? { type: String(type).toUpperCase() } : {}) },
      orderBy: { createdAt: "asc" },
    });
    const sellerWorkspaces = await prisma.workspace.findMany({
      where: { type: "SELLER", merchantId: { in: [...new Set(items.map((p) => p.merchantId))] } },
      select: { id: true, merchantId: true },
    });
    const sellerProfiles = await prisma.sellerProfile.findMany({
      where: { workspaceId: { in: sellerWorkspaces.map((ws) => ws.id) } },
      select: { workspaceId: true, paypalStatus: true, paypalSubscriptionEnabled: true },
    });
    let subscriptionAccess = false;
    if (items.some((product) => product.type === "SUBSCRIPTION")) {
      try { subscriptionAccess = await PayPalAdapter.hasSubscriptionsAccess(); } catch { subscriptionAccess = false; }
    }
    const paypalReady = new Set(sellerProfiles.filter((profile) => profile.paypalStatus === "ACTIVE" && profile.paypalSubscriptionEnabled).map((profile) => sellerWorkspaces.find((ws) => ws.id === profile.workspaceId)?.merchantId));
    return sendSuccess(res, {
      items: items.map((p) => ({
        id: p.id,
        productId: p.id,
        merchantId: p.merchantId,
        merchantName: p.merchantName,
        sku: p.sku,
        name: p.name,
        type: p.type,
        amountMinor: p.priceMinor,
        priceMinor: p.priceMinor,
        currency: p.currency,
        variants: (Array.isArray(p.variants) ? p.variants : []).map((variant: any) => ({
          id: String(variant.variantId || variant.id || "DEFAULT"),
          label: String(variant.label || variant.variantId || "Default"),
          sku: String(variant.sku || p.sku),
          amountMinor: Number(variant.priceMinor ?? variant.amountMinor ?? p.priceMinor),
        })),
        catalogVersion: p.catalogVersion,
        status: p.status,
        subscriptionAvailable: p.type !== "SUBSCRIPTION" || (subscriptionAccess && paypalReady.has(p.merchantId)),
      })),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/quotes
commerceRouter.post("/quotes", requireSession, async (req, res) => {
  try {
    const { productId, variantId, quantity = 1, spendingLimitMinor } = req.body || {};
    const product = await prisma.product.findFirst({ where: { id: String(productId), status: "PUBLISHED" } });
    if (!product) {
      throw new AppError(404, "NOT_FOUND", "Product not found in catalog");
    }
    const variants = (product.variants as any[]) || [];
    const selectedVariant = variants.find((v) => v.variantId === variantId) || variants[0];
    const unitMinor = selectedVariant ? Number(selectedVariant.priceMinor) : product.priceMinor;
    const amountMinor = unitMinor * Number(quantity);
    const preferences = await prisma.workspacePreference.findUnique({ where: { userId: req.auth!.userId } });
    const limitMinor = Number(spendingLimitMinor ?? preferences?.defaultLimitMinor ?? 7500);
    if (!Number.isSafeInteger(limitMinor) || limitMinor < 0 || !Number.isSafeInteger(Number(quantity)) || Number(quantity) < 1 || Number(quantity) > 100) {
      throw new AppError(422, "VALIDATION_ERROR", "A nonnegative spending limit and quantity between 1 and 100 are required");
    }
    const ruleResult = amountMinor > limitMinor ? "OVER_LIMIT" : "READY";

    const quote = await prisma.quote.create({
      data: {
        customerId: req.auth!.userId,
        merchantId: product.merchantId,
        productId: product.id,
        sku: selectedVariant?.sku || product.sku,
        variantId: selectedVariant?.variantId || "DEFAULT",
        quantity: Number(quantity),
        amountMinor,
        currency: "USD",
        spendingLimitMinor: limitMinor,
        ruleResult,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });

    return sendSuccess(
      res,
      {
        quoteId: quote.id,
        merchantId: quote.merchantId,
        productId: quote.productId,
        sku: quote.sku,
        variantId: quote.variantId,
        quantity: quote.quantity,
        amountMinor: quote.amountMinor,
        currency: quote.currency,
        spendingLimitMinor: quote.spendingLimitMinor,
        ruleResult: quote.ruleResult,
        quoteVersion: quote.quoteVersion,
        expiresAt: quote.expiresAt.toISOString(),
      },
      quote.quoteVersion,
      201
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/checkout/orders
commerceRouter.post("/checkout/orders", requireSession, async (req, res) => {
  try {
    const idem = await checkIdempotency(req, "POST:/api/v1/checkout/orders");
    if (idem.cachedResponse) {
      return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    }

    const { quoteId, quoteVersion, consentAccepted } = req.body || {};
    if (!consentAccepted) {
      throw new AppError(422, "POLICY_DENIED", "Explicit buyer checkout consent is required");
    }

    const quote = await prisma.quote.findUnique({ where: { id: String(quoteId) } });
    if (!quote || quote.customerId !== req.auth!.userId) {
      throw new AppError(403, "FORBIDDEN", "Quote does not belong to the active customer");
    }
    if (quoteVersion !== undefined && Number(quoteVersion) !== quote.quoteVersion) {
      throw new AppError(409, "STALE_QUOTE", "Quote version mismatch", false, quote.quoteVersion);
    }
    if (quote.ruleResult === "OVER_LIMIT") {
      throw new AppError(422, "OVER_SPENDING_LIMIT", "Quote exceeds buyer spending limit");
    }

    const product = await prisma.product.findUnique({ where: { id: quote.productId } });
    const snapshotHash = canonicalHash({
      customerId: quote.customerId,
      merchantId: quote.merchantId,
      sku: quote.sku,
      variantId: quote.variantId,
      quantity: quote.quantity,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
    });

    const snapshot = await prisma.purchaseSnapshot.create({
      data: {
        customerId: quote.customerId,
        merchantId: quote.merchantId,
        productId: quote.productId,
        sku: quote.sku,
        variantId: quote.variantId,
        quantity: quote.quantity,
        amountMinor: quote.amountMinor,
        currency: quote.currency,
        terms: `${product?.name || "Item"} (${quote.variantId}) x${quote.quantity} — USD ${(quote.amountMinor / 100).toFixed(2)}`,
        snapshotHash,
      },
    });

    const localOrderId = `ord_${crypto.randomBytes(4).toString("hex")}`;
    const ppOrder = await PayPalAdapter.createOrder({
      customId: localOrderId,
      amountMinor: quote.amountMinor,
      currency: quote.currency,
      requestId: `pp-ord-${idem.key}`,
    });

    await prisma.transaction.create({
      data: {
        orderId: localOrderId,
        customerId: quote.customerId,
        merchantId: quote.merchantId,
        merchantName: product?.merchantName || "Vela Market",
        snapshotId: snapshot.id,
        paypalOrderId: ppOrder.id,
        amountMinor: quote.amountMinor,
        refundableRemainingMinor: quote.amountMinor,
        currency: quote.currency,
        paymentStatus: "APPROVAL_PENDING",
      },
    });

    const approveUrl = ppOrder.links?.find((l: any) => l.rel === "approve")?.href || null;
    const responsePayload = {
      data: {
        checkoutOrderId: localOrderId,
        snapshot: {
          snapshotId: snapshot.id,
          sku: snapshot.sku,
          variantId: snapshot.variantId,
          quantity: snapshot.quantity,
          amountMinor: snapshot.amountMinor,
          currency: snapshot.currency,
          terms: snapshot.terms,
          snapshotHash: snapshot.snapshotHash,
          version: snapshot.version,
        },
        paypalOrder: {
          paypalOrderId: ppOrder.id,
          status: ppOrder.status,
          approveUrl,
        },
      },
      meta: {
        traceId: generateTraceId("tr_ord"),
        version: 1,
        timestamp: new Date().toISOString(),
      },
    };

    await saveIdempotency(req, "POST:/api/v1/checkout/orders", idem.key, idem.requestHash, 201, responsePayload);
    return res.status(201).json(responsePayload);
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/checkout/orders/:id/capture
commerceRouter.post("/checkout/orders/:id/capture", requireSession, async (req, res) => {
  try {
    const routeKey = `POST:/api/v1/checkout/orders/${req.params.id}/capture`;
    const idem = await checkIdempotency(req, routeKey);
    if (idem.cachedResponse) {
      return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    }

    const { paypalOrderId, snapshotHash } = req.body || {};
    const tx = await prisma.transaction.findUnique({ where: { orderId: req.params.id } });
    if (!tx || tx.customerId !== req.auth!.userId) {
      throw new AppError(403, "FORBIDDEN", "Order does not belong to the authenticated customer");
    }

    const snap = await prisma.purchaseSnapshot.findUnique({ where: { id: tx.snapshotId } });
    if (snapshotHash && snap && snap.snapshotHash !== snapshotHash) {
      throw new AppError(409, "STALE_CONSENT", "Snapshot hash does not match frozen checkout agreement");
    }

    let opStatus: "SUCCEEDED" | "UNKNOWN" = "SUCCEEDED";
    let captureId: string | null = null;
    try {
      const capRes = await PayPalAdapter.captureOrder(paypalOrderId || tx.paypalOrderId!, `pp-cap-${idem.key}`);
      const capture = capRes.purchase_units?.[0]?.payments?.captures?.[0];
      if (!capture?.id || capture.status !== "COMPLETED") {
        throw new Error(`PayPal capture was not confirmed (status: ${capture?.status || "missing"})`);
      }
      captureId = capture.id;
      await prisma.transaction.update({
        where: { id: tx.id },
        data: {
          paypalCaptureId: captureId,
          paymentStatus: "PAID",
          verifiedAt: new Date(),
        },
      });
    } catch {
      opStatus = "UNKNOWN";
      await prisma.transaction.update({
        where: { id: tx.id },
        data: { paymentStatus: "UNKNOWN" },
      });
    }

    const operation = await prisma.providerOperation.create({
      data: {
        type: "ORDER_CAPTURE",
        checkoutOrderId: tx.orderId,
        route: "PAYPAL_CAPTURE_REFUND",
        status: opStatus,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        paypalOrderId: tx.paypalOrderId,
        paypalCaptureId: captureId,
        providerRef: captureId,
        requestIdKey: `op-cap-${idem.key}`,
        verifiedAt: opStatus === "SUCCEEDED" ? new Date() : null,
        nextStep:
          opStatus === "SUCCEEDED"
            ? "Order payment captured and verified."
            : "Provider capture timed out. Reconcile using the same operationId.",
      },
    });

    const responsePayload = {
      data: {
        operationId: operation.id,
        checkoutOrderId: tx.orderId,
        status: operation.status,
        pollUrl: `/api/v1/operations/${operation.id}`,
      },
      meta: {
        traceId: generateTraceId("tr_cap"),
        version: 1,
        timestamp: new Date().toISOString(),
      },
    };

    await saveIdempotency(req, routeKey, idem.key, idem.requestHash, 202, responsePayload);
    return res.status(202).json(responsePayload);
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/transactions
commerceRouter.get("/transactions", requireSession, async (req, res) => {
  try {
    const where =
      req.auth!.workspaceType === "SELLER"
        ? { merchantId: req.auth!.merchantId || "" }
        : { customerId: req.auth!.userId };

    const items = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return sendSuccess(res, { items });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/transactions/:id
commerceRouter.get("/transactions/:id", requireSession, async (req, res) => {
  try {
    const tx = await prisma.transaction.findFirst({
      where: {
        OR: [{ id: req.params.id }, { orderId: req.params.id }],
      },
    });
    if (!tx) {
      throw new AppError(404, "NOT_FOUND", "Transaction or order not found");
    }
    if (
      req.auth!.workspaceType !== "ADMIN" &&
      tx.customerId !== req.auth!.userId &&
      tx.merchantId !== req.auth!.merchantId
    ) {
      throw new AppError(404, "NOT_FOUND", "Transaction not found in active workspace scope");
    }

    const snapshot = await prisma.purchaseSnapshot.findUnique({ where: { id: tx.snapshotId } });
    const activeCase = await prisma.disputeCase.findFirst({
      where: {
        OR: [{ transactionId: tx.id }, { orderId: tx.orderId }],
      },
    });

    return sendSuccess(res, {
      transaction: tx,
      snapshot,
      activeCaseId: activeCase?.id || null,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

// GET /api/v1/operations/:id
commerceRouter.get("/operations/:id", requireSession, async (req, res) => {
  try {
    const op = await prisma.providerOperation.findUnique({ where: { id: req.params.id } });
    if (!op) {
      throw new AppError(404, "NOT_FOUND", "Provider operation not found");
    }
    return sendSuccess(
      res,
      {
        operationId: op.id,
        type: op.type,
        actionRequestId: op.actionRequestId,
        caseId: op.caseId,
        route: op.route,
        status: op.status,
        amountMinor: op.amountMinor,
        currency: op.currency,
        providerRef: op.providerRef,
        lastCheckedAt: op.lastCheckedAt.toISOString(),
        verifiedAt: op.verifiedAt ? op.verifiedAt.toISOString() : null,
        nextStep: op.nextStep,
      },
      op.version
    );
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/operations/:id/reconcile (Reconciles UNKNOWN on the exact same operationId)
commerceRouter.post("/operations/:id/reconcile", requireSession, async (req, res) => {
  try {
    const routeKey = `POST:/api/v1/operations/${req.params.id}/reconcile`;
    const idem = await checkIdempotency(req, routeKey);
    if (idem.cachedResponse) {
      return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    }

    const op = await prisma.providerOperation.findUnique({ where: { id: req.params.id } });
    if (!op) {
      throw new AppError(404, "NOT_FOUND", "Provider operation not found");
    }

    let verifiedStatus: "SUCCEEDED" | "FAILED" | "UNKNOWN" = "UNKNOWN";
    let providerRef = op.providerRef;

    try {
      if (op.type === "CAPTURE_REFUND" && op.providerRef) {
        const refData = await PayPalAdapter.getRefund(op.providerRef);
        providerRef = refData.id || op.providerRef;
        verifiedStatus = refData.status === "COMPLETED"
          ? "SUCCEEDED"
          : ["FAILED", "CANCELLED"].includes(refData.status)
            ? "FAILED"
            : "UNKNOWN";
      } else if (op.type === "ORDER_CAPTURE" && op.paypalCaptureId) {
        const capData = await PayPalAdapter.getCapture(op.paypalCaptureId);
        providerRef = capData.id || op.paypalCaptureId;
        verifiedStatus = capData.status === "COMPLETED"
          ? "SUCCEEDED"
          : ["FAILED", "DECLINED"].includes(capData.status)
            ? "FAILED"
            : "UNKNOWN";
      }
    } catch {
      verifiedStatus = "UNKNOWN";
    }

    const updatedOp = await prisma.providerOperation.update({
      where: { id: op.id },
      data: {
        status: verifiedStatus,
        providerRef,
        lastCheckedAt: new Date(),
        verifiedAt: verifiedStatus === "SUCCEEDED" ? new Date() : null,
        nextStep:
          verifiedStatus === "SUCCEEDED"
            ? `Refund of USD ${(op.amountMinor / 100).toFixed(2)} verified by PayPal Sandbox.`
            : "Still awaiting definitive provider confirmation.",
        version: { increment: 1 },
      },
    });

    let caseStage: string | null = null;
    if (verifiedStatus === "SUCCEEDED" && op.caseId) {
      const updatedCase = await prisma.disputeCase.update({
        where: { id: op.caseId },
        data: { stage: "RESOLVED" },
      });
      caseStage = updatedCase.stage;
    }

    const responsePayload = {
      data: {
        operationId: updatedOp.id,
        type: updatedOp.type,
        actionRequestId: updatedOp.actionRequestId,
        caseId: updatedOp.caseId,
        route: updatedOp.route,
        status: updatedOp.status,
        amountMinor: updatedOp.amountMinor,
        currency: updatedOp.currency,
        providerRef: updatedOp.providerRef,
        lastCheckedAt: updatedOp.lastCheckedAt.toISOString(),
        verifiedAt: updatedOp.verifiedAt ? updatedOp.verifiedAt.toISOString() : null,
        caseStage,
        nextStep: updatedOp.nextStep,
      },
      meta: {
        traceId: generateTraceId("tr_rec"),
        version: updatedOp.version,
        timestamp: new Date().toISOString(),
      },
    };

    await saveIdempotency(req, routeKey, idem.key, idem.requestHash, 200, responsePayload);
    return res.status(200).json(responsePayload);
  } catch (err) {
    return sendError(res, err);
  }
});

// POST /api/v1/agent/runs & GET /api/v1/agent/runs/:id (Personal Assistant & Private Preparation)
commerceRouter.post("/agent/runs", requireSession, async (req, res) => {
  try {
    const { purpose = "PERSONAL_ASSISTANT", caseId = null, prompt = "" } = req.body || {};
    if (!["PERSONAL_ASSISTANT", "CUSTOMER_PREPARATION", "SELLER_PREPARATION"].includes(purpose)) {
      throw new AppError(422, "VALIDATION_ERROR", "Unsupported private agent purpose");
    }
    if (purpose === "PERSONAL_ASSISTANT" && (req.auth!.workspaceType !== "CUSTOMER" || caseId)) {
      throw new AppError(403, "FORBIDDEN", "Personal assistant runs require a Customer workspace and cannot include a case");
    }
    let contextInputVersion = 1;
    let contextAccessRevision = 1;
    if (["CUSTOMER_PREPARATION", "SELLER_PREPARATION"].includes(purpose)) {
      if (typeof caseId !== "string") throw new AppError(422, "VALIDATION_ERROR", "Preparation runs require an authorized case");
      const c = await prisma.disputeCase.findUnique({ where: { id: caseId } });
      const ownsCase = purpose === "CUSTOMER_PREPARATION"
        ? req.auth!.workspaceType === "CUSTOMER" && c?.customerId === req.auth!.userId
        : req.auth!.workspaceType === "SELLER" && c?.merchantId === req.auth!.merchantId;
      if (!c || !ownsCase) throw new AppError(404, "NOT_FOUND", "Case not found in the active workspace scope");
      contextInputVersion = c.privateContextVersion;
      contextAccessRevision = c.accessRevision;
    }
    if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.length > 2000) {
      throw new AppError(422, "VALIDATION_ERROR", "Prompt must be between 3 and 2000 characters");
    }
    const traceId = generateTraceId("tr_run");

    const run = await prisma.agentRun.create({
      data: {
        actorId: req.auth!.userId,
        caseId: caseId ? String(caseId) : null,
        purpose,
        audience: "PRIVATE",
        inputVersion: contextInputVersion,
        accessRevision: contextAccessRevision,
        status: "QUEUED",
        prompt: String(prompt),
      },
    });

    await prisma.outboxJob.create({
      data: {
        jobType: "RUN_AI_ASSESSMENT",
        payload: {
          runId: run.id,
          caseId: run.caseId,
          purpose: run.purpose,
          expectedContextVersion: contextInputVersion,
        },
        traceId,
      },
    });

    return sendSuccess(
      res,
      {
        runId: run.id,
        purpose: run.purpose,
        audience: run.audience,
        status: run.status,
        pollUrl: `/api/v1/agent/runs/${run.id}`,
      },
      contextInputVersion,
      202,
      traceId
    );
  } catch (err) {
    return sendError(res, err);
  }
});

commerceRouter.get("/agent/runs/:id", requireSession, async (req, res) => {
  try {
    const run = await prisma.agentRun.findUnique({ where: { id: req.params.id } });
    if (!run || run.actorId !== req.auth!.userId) {
      throw new AppError(404, "NOT_FOUND", "Agent run not found");
    }
    if (run.purpose === "PERSONAL_ASSISTANT" && req.auth!.workspaceType !== "CUSTOMER") {
      throw new AppError(404, "NOT_FOUND", "Agent run not found in active workspace scope");
    }
    if (run.caseId) {
      const c = await prisma.disputeCase.findUnique({ where: { id: run.caseId }, select: { customerId: true, merchantId: true } });
      const authorized = run.purpose === "CUSTOMER_PREPARATION"
        ? req.auth!.workspaceType === "CUSTOMER" && c?.customerId === req.auth!.userId
        : run.purpose === "SELLER_PREPARATION" && req.auth!.workspaceType === "SELLER" && c?.merchantId === req.auth!.merchantId;
      if (!authorized) throw new AppError(404, "NOT_FOUND", "Agent run not found in active workspace scope");
    }
    return sendSuccess(res, {
      runId: run.id,
      purpose: run.purpose,
      audience: run.audience,
      status: run.status,
      result: run.resultPayload,
    });
  } catch (err) {
    return sendError(res, err);
  }
});
