import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireSession } from "../middleware/auth";
import { AppError, sendError, sendSuccess } from "../utils/envelope";
import { PayPalAdapter } from "../integrations/paypal.adapter";
import { StorageAdapter } from "../integrations/storage.adapter";
import { checkIdempotency, saveIdempotency } from "../middleware/idempotency";
import { generateTraceId } from "../utils/crypto";

export const workspaceRouter = Router();
workspaceRouter.use(requireSession);

function requireType(req: any, type: "CUSTOMER" | "SELLER" | "ADMIN") {
  if (req.auth?.workspaceType !== type) {
    throw new AppError(403, "WORKSPACE_MISMATCH", `An active ${type.toLowerCase()} workspace is required`);
  }
}

function requireMerchant(req: any) {
  requireType(req, "SELLER");
  if (!req.auth.merchantId) throw new AppError(409, "MERCHANT_NOT_CONFIGURED", "This Seller workspace has no merchant account binding");
  return req.auth.merchantId as string;
}

function validWebsite(value: unknown) {
  if (typeof value !== "string") return false;
  try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; }
}

function productDto(product: any) {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  return {
    id: product.id,
    productId: product.id,
    merchantId: product.merchantId,
    merchantName: product.merchantName,
    sku: product.sku,
    name: product.name,
    type: product.type,
    amountMinor: product.priceMinor,
    priceMinor: product.priceMinor,
    currency: product.currency,
    variants,
    catalogVersion: product.catalogVersion,
    status: product.status,
    hasDigitalAsset: Boolean(product.digitalObjectKey),
  };
}

// CUSTOMER preferences are server persisted and never read from browser fixtures.
workspaceRouter.get("/workspace/preferences", async (req, res) => {
  try {
    requireType(req, "CUSTOMER");
    const prefs = await prisma.workspacePreference.upsert({
      where: { userId: req.auth!.userId },
      create: { userId: req.auth!.userId },
      update: {},
    });
    return sendSuccess(res, {
      defaultLimitMinor: prefs.defaultLimitMinor,
      remindersEnabled: prefs.remindersEnabled,
      notificationsReadAt: prefs.notificationsReadAt?.toISOString() ?? null,
    }, prefs.updatedAt.getTime());
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.patch("/workspace/preferences", async (req, res) => {
  try {
    requireType(req, "CUSTOMER");
    const body = req.body || {};
    const data: Record<string, unknown> = {};
    if (body.defaultLimitMinor !== undefined) {
      const amount = Number(body.defaultLimitMinor);
      if (!Number.isSafeInteger(amount) || amount < 0) throw new AppError(422, "VALIDATION_ERROR", "defaultLimitMinor must be a nonnegative integer");
      data.defaultLimitMinor = amount;
    }
    if (body.remindersEnabled !== undefined) {
      if (typeof body.remindersEnabled !== "boolean") throw new AppError(422, "VALIDATION_ERROR", "remindersEnabled must be boolean");
      data.remindersEnabled = body.remindersEnabled;
    }
    if (!Object.keys(data).length) throw new AppError(422, "VALIDATION_ERROR", "Provide at least one supported preference");
    const prefs = await prisma.workspacePreference.upsert({
      where: { userId: req.auth!.userId },
      create: { userId: req.auth!.userId, ...data },
      update: data,
    });
    return sendSuccess(res, { defaultLimitMinor: prefs.defaultLimitMinor, remindersEnabled: prefs.remindersEnabled }, prefs.updatedAt.getTime());
  } catch (err) { return sendError(res, err); }
});

// Activity notifications are derived from authorized transaction and dispute records.
workspaceRouter.get("/workspace/notifications", async (req, res) => {
  try {
    if (!["CUSTOMER", "SELLER"].includes(req.auth!.workspaceType)) throw new AppError(403, "WORKSPACE_MISMATCH", "Choose a Customer or Seller workspace");
    const seller = req.auth!.workspaceType === "SELLER";
    const [txs, cases, subscriptions, prefs] = await Promise.all([
      prisma.transaction.findMany({ where: seller ? { merchantId: req.auth!.merchantId || "" } : { customerId: req.auth!.userId }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.disputeCase.findMany({ where: seller ? { merchantId: req.auth!.merchantId || "" } : { customerId: req.auth!.userId }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.subscription.findMany({ where: seller ? { merchantId: req.auth!.merchantId || "" } : { customerId: req.auth!.userId }, orderBy: { updatedAt: "desc" }, take: 50 }),
      prisma.workspacePreference.upsert({ where: { userId: req.auth!.userId }, create: { userId: req.auth!.userId }, update: {} }),
    ]);
    const notifications = [
      ...txs.map((tx) => ({ id: `transaction:${tx.id}`, title: "Payment status updated", message: `${tx.merchantName} · ${tx.paymentStatus} · ${(tx.amountMinor / 100).toFixed(2)} ${tx.currency}`, href: `/workspace/transactions/${tx.id}`, createdAt: tx.updatedAt.toISOString() })),
      ...cases.map((c) => ({ id: `case:${c.id}`, title: "Resolution case updated", message: `${c.category.replaceAll("_", " ").toLowerCase()} · ${c.stage.replaceAll("_", " ").toLowerCase()}`, href: `/workspace/cases/${c.id}`, createdAt: c.updatedAt.toISOString() })),
      ...subscriptions.map((sub) => ({ id: `subscription:${sub.id}`, title: "Subscription status updated", message: `${sub.productName} · ${sub.status} · ${(sub.amountMinor / 100).toFixed(2)} ${sub.currency} / month`, href: "/workspace/subscriptions", createdAt: sub.updatedAt.toISOString() })),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return sendSuccess(res, {
      items: notifications.map((n) => ({ ...n, read: Boolean(prefs.notificationsReadAt && new Date(n.createdAt) <= prefs.notificationsReadAt) })),
      remindersEnabled: prefs.remindersEnabled,
      readAt: prefs.notificationsReadAt?.toISOString() ?? null,
    });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/workspace/notifications/read-all", async (req, res) => {
  try {
    if (!["CUSTOMER", "SELLER"].includes(req.auth!.workspaceType)) throw new AppError(403, "WORKSPACE_MISMATCH", "Choose a Customer or Seller workspace");
    const readAt = new Date();
    await prisma.workspacePreference.upsert({ where: { userId: req.auth!.userId }, create: { userId: req.auth!.userId, notificationsReadAt: readAt }, update: { notificationsReadAt: readAt } });
    return sendSuccess(res, { readAt: readAt.toISOString() });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.get("/workspace/library", async (req, res) => {
  try {
    requireType(req, "CUSTOMER");
    const txs = await prisma.transaction.findMany({ where: { customerId: req.auth!.userId, paymentStatus: { in: ["PAID", "PARTIALLY_REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 100 });
    const snapshots = await prisma.purchaseSnapshot.findMany({ where: { id: { in: txs.map((tx) => tx.snapshotId) } } });
    const productIds = [...new Set(snapshots.map((s) => s.productId))];
    const [products, assets] = await Promise.all([
      prisma.product.findMany({ where: { id: { in: productIds }, type: "DIGITAL" } }),
      prisma.libraryAsset.findMany({ where: { productId: { in: productIds }, verified: true } }),
    ]);
    const bySnapshot = new Map(snapshots.map((s) => [s.id, s]));
    const byProduct = new Map(products.map((p) => [p.id, p]));
    const byAsset = new Map(assets.map((a) => [a.productId, a]));
    const items = [];
    for (const tx of txs) {
      const snapshot = bySnapshot.get(tx.snapshotId);
      const product = snapshot ? byProduct.get(snapshot.productId) : null;
      if (!snapshot || !product) continue;
      const asset = byAsset.get(product.id);
      const downloadUrl = asset ? await StorageAdapter.createProductDownloadUrl(asset.objectKey, asset.fileName) : null;
      items.push({ transactionId: tx.id, orderId: tx.orderId, merchantName: tx.merchantName, paidAt: tx.verifiedAt?.toISOString() ?? tx.createdAt.toISOString(), name: product.name, sku: snapshot.sku, terms: snapshot.terms, amountMinor: snapshot.amountMinor, currency: snapshot.currency, asset: asset ? { fileName: asset.fileName, mime: asset.mime, byteCount: asset.byteCount, downloadUrl } : null });
    }
    return sendSuccess(res, { items });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.get("/merchant-applications/mine", async (req, res) => {
  try {
    if (!["CUSTOMER", "SELLER"].includes(req.auth!.workspaceType)) throw new AppError(403, "WORKSPACE_MISMATCH", "A personal or Seller workspace is required");
    const item = await prisma.merchantApplication.findFirst({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" } });
    return sendSuccess(res, { application: item });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/merchant-applications", async (req, res) => {
  try {
    requireType(req, "CUSTOMER");
    const { name, website, category, country } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 120 || !validWebsite(website) || typeof category !== "string" || category.trim().length < 2 || typeof country !== "string" || country.trim().length < 2) throw new AppError(422, "VALIDATION_ERROR", "Enter a business name, valid website, category, and country");
    const previous = await prisma.merchantApplication.findFirst({ where: { userId: req.auth!.userId }, orderBy: { createdAt: "desc" } });
    if (previous?.status === "PENDING") throw new AppError(409, "APPLICATION_PENDING", "Your existing application is awaiting review");
    if (previous?.status === "APPROVED") throw new AppError(409, "APPLICATION_APPROVED", "Your account already has an approved merchant application");
    const application = await prisma.merchantApplication.create({ data: { userId: req.auth!.userId, name: name.trim(), website, category: category.trim(), country: country.trim() } });
    return sendSuccess(res, { application }, 1, 201);
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.get("/seller/profile", async (req, res) => {
  try {
    const merchantId = requireMerchant(req);
    const profile = await prisma.sellerProfile.upsert({ where: { workspaceId: req.auth!.workspaceId }, create: { workspaceId: req.auth!.workspaceId, displayName: req.auth!.workspaceName }, update: {} });
    return sendSuccess(res, { displayName: profile.displayName, website: profile.website, paypalStatus: profile.paypalStatus, paypalMerchantId: profile.paypalMerchantId, paypalSubscriptionEnabled: profile.paypalSubscriptionEnabled, paypalCapabilities: profile.paypalCapabilities, merchantId });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.patch("/seller/profile", async (req, res) => {
  try {
    requireMerchant(req);
    const { displayName, website } = req.body || {};
    if (typeof displayName !== "string" || displayName.trim().length < 2 || displayName.trim().length > 120 || (website !== null && website !== undefined && !validWebsite(website))) throw new AppError(422, "VALIDATION_ERROR", "Enter a business name and a valid http(s) website");
    const profile = await prisma.sellerProfile.upsert({ where: { workspaceId: req.auth!.workspaceId }, create: { workspaceId: req.auth!.workspaceId, displayName: displayName.trim(), website: website || null }, update: { displayName: displayName.trim(), website: website || null } });
    return sendSuccess(res, { displayName: profile.displayName, website: profile.website, paypalStatus: profile.paypalStatus });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/seller/paypal/onboarding", async (req, res) => {
  try {
    requireMerchant(req);
    if (!process.env.PAYPAL_PARTNER_MERCHANT_ID || !process.env.PAYPAL_PARTNER_ATTRIBUTION_ID) throw new AppError(503, "PAYPAL_PARTNER_UNAVAILABLE", "PayPal partner onboarding needs PAYPAL_PARTNER_MERCHANT_ID and PAYPAL_PARTNER_ATTRIBUTION_ID");
    const profile = await prisma.sellerProfile.upsert({ where: { workspaceId: req.auth!.workspaceId }, create: { workspaceId: req.auth!.workspaceId, displayName: req.auth!.workspaceName }, update: {} });
    if (profile.paypalStatus === "ACTIVE" && profile.paypalMerchantId) return sendSuccess(res, { status: profile.paypalStatus, merchantId: profile.paypalMerchantId });
    const trackingId = profile.paypalTrackingId || `vp_${req.auth!.workspaceId}`;
    const base = process.env.WEB_ORIGIN || "http://localhost:3000";
    const returnUrl = process.env.PAYPAL_ONBOARDING_RETURN_URL || `${base}/workspace/settings`;
    const result = await PayPalAdapter.createSellerReferral({ trackingId, returnUrl, name: profile.displayName, email: req.auth!.email });
    const actionUrl = result.links?.find((link: any) => link.rel === "action_url")?.href;
    if (!actionUrl) throw new AppError(502, "PAYPAL_RESPONSE_INVALID", "PayPal did not return a seller authorization URL");
    await prisma.sellerProfile.update({ where: { id: profile.id }, data: { paypalTrackingId: trackingId, paypalStatus: "PENDING" } });
    return sendSuccess(res, { status: "PENDING", actionUrl, trackingId }, 1, 201);
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/seller/paypal/confirm", async (req, res) => {
  try {
    requireMerchant(req);
    const profile = await prisma.sellerProfile.findUnique({ where: { workspaceId: req.auth!.workspaceId } });
    const { trackingId, merchantIdInPayPal, permissionsGranted, consentStatus, isEmailConfirmed } = req.body || {};
    if (!profile?.paypalTrackingId || trackingId !== profile.paypalTrackingId) throw new AppError(403, "FORBIDDEN", "PayPal onboarding callback does not match this Seller workspace");
    if (!merchantIdInPayPal || permissionsGranted !== "true" || consentStatus !== "true" || isEmailConfirmed !== "true") throw new AppError(422, "PAYPAL_CONSENT_INCOMPLETE", "PayPal has not confirmed merchant consent and email verification");
    const integration = await PayPalAdapter.getSellerIntegration(String(merchantIdInPayPal));
    const grants = (integration.oauth_integrations || [])
      .filter((grant: any) => grant.integration_method === "PAYPAL")
      .flatMap((grant: any) => Array.isArray(grant.oauth_third_party) ? grant.oauth_third_party : [grant.oauth_third_party || {}]);
    const selectedGrants = grants.filter((grant: any) => grant.partner_client_id === process.env.PAYPAL_CLIENT_ID && Array.isArray(grant.scopes));
    const hasPaymentPermission = selectedGrants.some((grant: any) => grant.scopes.some((scope: string) => scope.includes("payments")));
    const hasSubscriptionPermission = selectedGrants.some((grant: any) => grant.scopes.some((scope: string) => scope.includes("/services/subscriptions")));
    if (integration.payments_receivable !== true || integration.primary_email_confirmed !== true || !hasPaymentPermission) throw new AppError(409, "PAYPAL_MERCHANT_NOT_READY", "PayPal has not confirmed account readiness and the requested VelaPal permissions");
    const updated = await prisma.sellerProfile.update({ where: { id: profile.id }, data: { paypalMerchantId: String(merchantIdInPayPal), paypalStatus: "ACTIVE", paypalSubscriptionEnabled: hasSubscriptionPermission, paypalCapabilities: integration.oauth_integrations || [] } });
    return sendSuccess(res, { paypalStatus: updated.paypalStatus, paypalMerchantId: updated.paypalMerchantId, paypalSubscriptionEnabled: updated.paypalSubscriptionEnabled, paypalCapabilities: updated.paypalCapabilities });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.get("/seller/products", async (req, res) => {
  try {
    const merchantId = requireMerchant(req);
    const items = await prisma.product.findMany({ where: { merchantId }, orderBy: { createdAt: "desc" } });
    return sendSuccess(res, { items: items.map(productDto) });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/seller/products", async (req, res) => {
  try {
    const merchantId = requireMerchant(req);
    const { name, sku, type, amountMinor, variants = [] } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.length > 120 || typeof sku !== "string" || !/^[A-Za-z0-9_-]{2,64}$/.test(sku) || !["PHYSICAL", "DIGITAL", "SUBSCRIPTION"].includes(type) || !Number.isSafeInteger(amountMinor) || amountMinor < 0 || !Array.isArray(variants)) throw new AppError(422, "VALIDATION_ERROR", "Invalid product details");
    const product = await prisma.product.create({ data: { merchantId, merchantName: req.auth!.workspaceName, name: name.trim(), sku: sku.trim(), type, priceMinor: amountMinor, currency: "USD", variants, status: "PUBLISHED" } });
    return sendSuccess(res, { product: productDto(product) }, product.catalogVersion, 201);
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.patch("/seller/products/:id", async (req, res) => {
  try {
    const merchantId = requireMerchant(req);
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, merchantId } });
    if (!existing) throw new AppError(404, "NOT_FOUND", "Product not found in this Seller workspace");
    const body = req.body || {};
    const data: any = {};
    if (body.name !== undefined) { if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 120) throw new AppError(422, "VALIDATION_ERROR", "Invalid product name"); data.name = body.name.trim(); }
    if (body.sku !== undefined) { if (typeof body.sku !== "string" || !/^[A-Za-z0-9_-]{2,64}$/.test(body.sku)) throw new AppError(422, "VALIDATION_ERROR", "Invalid SKU"); data.sku = body.sku.trim(); }
    if (body.amountMinor !== undefined) {
      if (!Number.isSafeInteger(body.amountMinor) || body.amountMinor < 0) throw new AppError(422, "VALIDATION_ERROR", "Invalid price");
      if (existing.type === "SUBSCRIPTION" && existing.paypalPlanId && body.amountMinor !== existing.priceMinor) throw new AppError(409, "PAYPAL_PLAN_IMMUTABLE", "This PayPal plan has an approved recurring price. Create a new product to change the price.");
      data.priceMinor = body.amountMinor;
      const variants = Array.isArray(existing.variants) ? existing.variants as any[] : [];
      if (variants.length === 1) data.variants = [{ ...variants[0], priceMinor: body.amountMinor }];
    }
    if (body.sku !== undefined) {
      const variants = Array.isArray(existing.variants) ? existing.variants as any[] : [];
      if (variants.length === 1) data.variants = [{ ...variants[0], sku: body.sku.trim() }];
    }
    if (body.status !== undefined) {
      if (!["PUBLISHED", "ARCHIVED"].includes(body.status)) throw new AppError(422, "VALIDATION_ERROR", "Invalid product status");
      if (body.status === "PUBLISHED" && existing.type === "DIGITAL") {
        const asset = await prisma.libraryAsset.findUnique({ where: { productId: existing.id } });
        if (!asset?.verified) throw new AppError(409, "DIGITAL_ASSET_REQUIRED", "Upload and verify the digital product file before publishing");
      }
      data.status = body.status;
    }
    if (!Object.keys(data).length) throw new AppError(422, "VALIDATION_ERROR", "Provide at least one product field");
    const product = await prisma.product.update({ where: { id: existing.id }, data: { ...data, catalogVersion: { increment: 1 } } });
    return sendSuccess(res, { product: productDto(product) }, product.catalogVersion);
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/seller/products/:id/digital-upload", async (req, res) => {
  try {
    const merchantId = requireMerchant(req);
    const product = await prisma.product.findFirst({ where: { id: req.params.id, merchantId, type: "DIGITAL" } });
    if (!product) throw new AppError(404, "NOT_FOUND", "Digital product not found");
    const { fileName, mime, byteCount } = req.body || {};
    if (typeof fileName !== "string" || !fileName.trim() || fileName.length > 180 || typeof mime !== "string" || !["application/pdf", "application/epub+zip", "application/zip"].includes(mime) || !Number.isSafeInteger(byteCount) || byteCount < 1 || byteCount > 50 * 1024 * 1024) throw new AppError(422, "VALIDATION_ERROR", "Upload a PDF, EPUB, or ZIP up to 50 MB");
    const objectKey = `library/${merchantId}/${product.id}/${crypto.randomUUID()}`;
    const uploadUrl = await StorageAdapter.createProductUploadUrl(objectKey, mime);
    await prisma.libraryAsset.upsert({ where: { productId: product.id }, create: { productId: product.id, objectKey, fileName: fileName.trim(), mime, byteCount, verified: false }, update: { objectKey, fileName: fileName.trim(), mime, byteCount, verified: false } });
    return sendSuccess(res, { uploadUrl, objectKey, fileName: fileName.trim(), mime, byteCount, method: "PUT", headers: { "Content-Type": mime }, expiresInSeconds: 600 });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/seller/products/:id/digital-upload/confirm", async (req, res) => {
  try {
    const merchantId = requireMerchant(req);
    const product = await prisma.product.findFirst({ where: { id: req.params.id, merchantId, type: "DIGITAL" } });
    const pendingAsset = product ? await prisma.libraryAsset.findUnique({ where: { productId: product.id } }) : null;
    if (!product || !pendingAsset || pendingAsset.verified || req.body?.objectKey !== pendingAsset.objectKey) throw new AppError(404, "NOT_FOUND", "Pending digital upload not found");
    const { fileName, mime, byteCount } = req.body || {};
    const actual = await StorageAdapter.inspectObject(pendingAsset.objectKey);
    if (!actual.byteCount || actual.byteCount !== byteCount || actual.mime !== mime) throw new AppError(422, "UPLOAD_NOT_VERIFIED", "Uploaded file size or content type does not match the signed upload request");
    const asset = await prisma.libraryAsset.update({ where: { productId: product.id }, data: { verified: true, fileName, mime, byteCount } });
    await prisma.product.update({ where: { id: product.id }, data: { digitalObjectKey: asset.objectKey, catalogVersion: { increment: 1 } } });
    return sendSuccess(res, { uploaded: true, fileName: asset.fileName, byteCount: asset.byteCount });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.get("/subscriptions", async (req, res) => {
  try {
    if (!["CUSTOMER", "SELLER"].includes(req.auth!.workspaceType)) throw new AppError(403, "WORKSPACE_MISMATCH", "Choose a Customer or Seller workspace");
    const where = req.auth!.workspaceType === "SELLER" ? { merchantId: req.auth!.merchantId || "" } : { customerId: req.auth!.userId };
    const items = await prisma.subscription.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    const synced = [];
    for (const item of items) {
      let current = item;
      if (PayPalAdapter.isConfigured() && !["CANCELLED", "EXPIRED"].includes(item.status)) {
        try {
          const sellerWorkspace = await prisma.workspace.findFirst({ where: { merchantId: item.merchantId, type: "SELLER" } });
          const sellerProfile = sellerWorkspace ? await prisma.sellerProfile.findUnique({ where: { workspaceId: sellerWorkspace.id } }) : null;
          if (!sellerProfile?.paypalMerchantId || sellerProfile.paypalStatus !== "ACTIVE") throw new Error("Seller PayPal authorization is not active");
          const provider = await PayPalAdapter.getSubscription(item.paypalSubscriptionId, sellerProfile.paypalMerchantId);
          current = await prisma.subscription.update({ where: { id: item.id }, data: { status: String(provider.status || item.status), nextBillingTime: provider.billing_info?.next_billing_time ? new Date(provider.billing_info.next_billing_time) : null, statusUpdatedAt: new Date() } });
        } catch (err) {
          throw new AppError(502, "PAYPAL_SUBSCRIPTION_SYNC_FAILED", err instanceof Error ? err.message : "PayPal subscription status could not be refreshed", true);
        }
      }
      synced.push({ id: current.id, paypalSubscriptionId: current.paypalSubscriptionId, productId: current.productId, productName: current.productName, amountMinor: current.amountMinor, currency: current.currency, status: current.status, nextBillingTime: current.nextBillingTime?.toISOString() ?? null, createdAt: current.createdAt.toISOString() });
    }
    return sendSuccess(res, { items: synced, providerConfigured: await PayPalAdapter.hasSubscriptionsAccess() });
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/subscriptions", async (req, res) => {
  try {
    requireType(req, "CUSTOMER");
    const routeKey = "POST:/api/v1/subscriptions";
    const idem = await checkIdempotency(req, routeKey);
    if (idem.cachedResponse) return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    if (!await PayPalAdapter.hasSubscriptionsAccess()) throw new AppError(503, "PAYPAL_SUBSCRIPTIONS_UNAVAILABLE", "PayPal credentials are missing the subscriptions API scope");
    const productId = String(req.body?.productId || "");
    const product = await prisma.product.findFirst({ where: { id: productId, type: "SUBSCRIPTION", status: "PUBLISHED" } });
    if (!product) throw new AppError(404, "NOT_FOUND", "Published subscription product not found");
    const sellerWorkspace = await prisma.workspace.findFirst({ where: { merchantId: product.merchantId, type: "SELLER" } });
    const sellerProfile = sellerWorkspace ? await prisma.sellerProfile.findUnique({ where: { workspaceId: sellerWorkspace.id } }) : null;
    if (!sellerProfile?.paypalMerchantId || sellerProfile.paypalStatus !== "ACTIVE" || !sellerProfile.paypalSubscriptionEnabled) throw new AppError(409, "SELLER_PAYPAL_SUBSCRIPTIONS_NOT_ENABLED", "This merchant has not authorized the PayPal subscriptions capability");
    let planId = product.paypalPlanId;
    if (!planId) {
      const providerProduct = await PayPalAdapter.createSubscriptionProduct(product.name, `VelaPal seller subscription ${product.sku}`, sellerProfile.paypalMerchantId, `vp-product-${product.id}-v${product.catalogVersion}`);
      const plan = await PayPalAdapter.createMonthlyPlan({ productId: providerProduct.id, name: product.name, amountMinor: product.priceMinor, currency: product.currency, sellerMerchantId: sellerProfile.paypalMerchantId, requestId: `vp-plan-${product.id}-v${product.catalogVersion}` });
      planId = String(plan.id);
      await prisma.product.update({ where: { id: product.id }, data: { paypalProductId: String(providerProduct.id), paypalPlanId: planId } });
    }
    const base = process.env.WEB_ORIGIN || "http://localhost:3000";
    const result = await PayPalAdapter.createSubscription(planId, `${base}/workspace/subscriptions?paypal=approved`, `${base}/workspace/subscriptions?paypal=cancelled`, sellerProfile.paypalMerchantId, idem.key);
    const approveUrl = result.links?.find((link: any) => link.rel === "approve")?.href;
    if (!result.id || !approveUrl) throw new AppError(502, "PAYPAL_RESPONSE_INVALID", "PayPal did not return subscription approval details");
    await prisma.subscription.create({ data: { paypalSubscriptionId: String(result.id), paypalPlanId: planId, customerId: req.auth!.userId, merchantId: product.merchantId, paypalSellerMerchantId: sellerProfile.paypalMerchantId, productId: product.id, productName: product.name, amountMinor: product.priceMinor, currency: product.currency, status: String(result.status || "APPROVAL_PENDING") } });
    const payload = { data: { paypalSubscriptionId: result.id, status: result.status, approveUrl }, meta: { traceId: generateTraceId("tr_sub"), version: 1, timestamp: new Date().toISOString() } };
    await saveIdempotency(req, routeKey, idem.key, idem.requestHash, 201, payload);
    return res.status(201).json(payload);
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.post("/subscriptions/:id/cancel", async (req, res) => {
  try {
    requireType(req, "CUSTOMER");
    const routeKey = `POST:/api/v1/subscriptions/${req.params.id}/cancel`;
    const idem = await checkIdempotency(req, routeKey);
    if (idem.cachedResponse) return res.status(idem.cachedResponse.statusCode).json(idem.cachedResponse.body);
    const item = await prisma.subscription.findFirst({ where: { id: req.params.id, customerId: req.auth!.userId } });
    if (!item) throw new AppError(404, "NOT_FOUND", "Subscription not found");
    if (["CANCELLED", "EXPIRED"].includes(item.status)) return sendSuccess(res, { status: item.status });
    if (typeof req.body?.reason !== "string" || req.body.reason.trim().length < 10) throw new AppError(422, "VALIDATION_ERROR", "Provide a cancellation reason of at least 10 characters");
    await PayPalAdapter.cancelSubscription(item.paypalSubscriptionId, req.body.reason.trim(), item.paypalSellerMerchantId, idem.key);
    let status = "CANCEL_REQUESTED";
    try {
      const provider = await PayPalAdapter.getSubscription(item.paypalSubscriptionId, item.paypalSellerMerchantId);
      status = String(provider.status || status);
      await prisma.subscription.update({ where: { id: item.id }, data: { status, statusUpdatedAt: new Date(), nextBillingTime: provider.billing_info?.next_billing_time ? new Date(provider.billing_info.next_billing_time) : null } });
    } catch { /* The provider webhook remains authoritative if status lookup is delayed. */ }
    const payload = { data: { status, providerStatusPending: status === "CANCEL_REQUESTED" }, meta: { traceId: generateTraceId("tr_subc"), version: 1, timestamp: new Date().toISOString() } };
    await saveIdempotency(req, routeKey, idem.key, idem.requestHash, 200, payload);
    return res.status(200).json(payload);
  } catch (err) { return sendError(res, err); }
});

workspaceRouter.get("/subscriptions/:id/transactions", async (req, res) => {
  try {
    if (!["CUSTOMER", "SELLER"].includes(req.auth!.workspaceType)) throw new AppError(403, "WORKSPACE_MISMATCH", "Choose a Customer or Seller workspace");
    const item = await prisma.subscription.findFirst({
      where: req.auth!.workspaceType === "SELLER"
        ? { id: req.params.id, merchantId: req.auth!.merchantId || "" }
        : { id: req.params.id, customerId: req.auth!.userId },
    });
    if (!item) throw new AppError(404, "NOT_FOUND", "Subscription not found in this workspace");
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60 * 1000);
    const result = await PayPalAdapter.getSubscriptionTransactions(item.paypalSubscriptionId, item.paypalSellerMerchantId, start.toISOString(), end.toISOString());
    return sendSuccess(res, { items: (result.transactions || []).map((transaction: any) => ({ id: transaction.id, status: transaction.status, time: transaction.time, amount: transaction.amount_with_breakdown?.gross_amount || transaction.amount })) });
  } catch (err) { return sendError(res, err); }
});
