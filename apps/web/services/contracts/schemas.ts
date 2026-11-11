import { z } from "zod";
export const moneyMinor = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
export const paymentStatus = z.enum([
  "APPROVAL_PENDING",
  "UNCONFIRMED",
  "PAID",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
  "FAILED",
  "UNKNOWN",
]);
export const transactionDto = z.object({
  id: z.string(),
  orderId: z.string(),
  customerId: z.string(),
  merchantId: z.string(),
  merchantName: z.string(),
  paypalOrderId: z.string().nullable().default(null),
  paypalCaptureId: z.string().nullable().default(null),
  amountMinor: moneyMinor,
  refundableRemainingMinor: moneyMinor.default(0),
  currency: z.literal("USD"),
  paymentStatus,
  verifiedAt: z.string().nullable().default(null),
});
export const snapshotDto = z.object({
  snapshotId: z.string().optional(),
  id: z.string().optional(),
  sku: z.string().default(""),
  variantId: z.string().default(""),
  quantity: z.number().int().positive().optional().default(1),
  amountMinor: moneyMinor,
  currency: z.literal("USD").default("USD"),
  snapshotHash: z.string().optional(),
}).transform((val) => ({
  snapshotId: val.snapshotId || val.id || "",
  sku: val.sku,
  variantId: val.variantId,
  quantity: val.quantity,
  amountMinor: val.amountMinor,
  currency: "USD" as const,
  snapshotHash: val.snapshotHash,
}));
export const transactionDetailDto = z.object({
  transaction: transactionDto,
  snapshot: snapshotDto,
  activeCaseId: z.string().nullable().default(null),
});
export const catalogDto = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      merchantId: z.string(),
      merchantName: z.string().optional(),
      sku: z.string().optional(),
      type: z.enum(["PHYSICAL", "DIGITAL", "SUBSCRIPTION"]).optional(),
      amountMinor: moneyMinor.optional(),
      variants: z.array(z.object({ id: z.string(), label: z.string().optional(), sku: z.string().optional(), amountMinor: moneyMinor })),
      currency: z.literal("USD"),
      status: z.enum(["PUBLISHED", "ARCHIVED"]).optional(),
      subscriptionAvailable: z.boolean().optional(),
      catalogVersion: z.number().int().optional(),
    }),
  ),
});
export const quoteDto = z.object({
  quoteId: z.string(),
  merchantId: z.string().optional(),
  productId: z.string().optional(),
  sku: z.string().optional(),
  variantId: z.string().optional(),
  quantity: z.number().int().positive().optional(),
  amountMinor: moneyMinor,
  currency: z.literal("USD"),
  spendingLimitMinor: moneyMinor.optional(),
  ruleResult: z.string(),
  quoteVersion: z.number().int().positive(),
  expiresAt: z.string(),
});
