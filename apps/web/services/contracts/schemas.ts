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
  paypalOrderId: z.string().nullable(),
  paypalCaptureId: z.string().nullable(),
  amountMinor: moneyMinor,
  refundableRemainingMinor: moneyMinor,
  currency: z.literal("USD"),
  paymentStatus,
  verifiedAt: z.string().nullable(),
});
export const snapshotDto = z.object({
  snapshotId: z.string(),
  sku: z.string(),
  variantId: z.string(),
  quantity: z.number().int().positive().optional(),
  amountMinor: moneyMinor,
  currency: z.literal("USD"),
  snapshotHash: z.string().optional(),
});
export const transactionDetailDto = z.object({
  transaction: transactionDto,
  snapshot: snapshotDto,
  activeCaseId: z.string().nullable(),
});
export const catalogDto = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      merchantId: z.string(),
      variants: z.array(z.object({ id: z.string(), amountMinor: moneyMinor })),
      currency: z.literal("USD"),
    }),
  ),
});
export const quoteDto = z.object({
  quoteId: z.string(),
  amountMinor: moneyMinor,
  currency: z.literal("USD"),
  quoteVersion: z.number().int().positive(),
  expiresAt: z.string(),
  ruleResult: z.string(),
});
