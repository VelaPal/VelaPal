import {z} from "zod"; 

export const transactionStatusSchema = z.enum(["PAID","PENDING","FAILED","REFUNDED","UNKNOWN","APPROVAL_PENDING","UNCONFIRMED","PARTIALLY_REFUNDED"]);

export const transactionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  merchantName: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.literal("USD"),
  status: transactionStatusSchema,
  createdAt: z.string().datetime({ offset: true }).nullable(),
});

export const transactionDetailSchema = transactionSchema.extend({
  snapshot: z.object({
    productName: z.string().min(1),
    description: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPriceCents: z.number().int().nonnegative(),
    termsVersion: z.string().min(1),
    approvedAt: z.string().datetime({ offset: true }).nullable(),
  }),
  providerReferences: z.array(
    z.object({
      type: z.enum(["ORDER", "CAPTURE", "SUBSCRIPTION", "REFUND"]),
      id: z.string().min(1),
    }),
  ),
  activeCaseId: z.string().min(1).nullable(),
});

export const transactionListResponseSchema = z.object({
  items: z.array(transactionSchema),
  nextCursor: z.string().min(1).nullable(),
});

export const transactionDetailResponseSchema = z.object({
  item: transactionDetailSchema,
});

export const transactionsQuerySchema = z.object({
  q: z.string().trim().max(100),
  status: transactionStatusSchema.or(z.literal("ALL")),
  cursor: z.string().min(1).nullable(),
  limit: z.number().int().min(1).max(50),
});

export type TransactionStatus = z.infer< typeof transactionStatusSchema>;

export type Transaction = z.infer<typeof transactionSchema>;

export type TransactionDetail = z.infer<typeof transactionDetailSchema>;

export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;

export type TransactionsQuery = z.infer<typeof transactionsQuerySchema>;
