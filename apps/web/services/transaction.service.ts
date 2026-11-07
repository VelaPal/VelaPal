import { transactionsService } from "@/services/contracts/transactions.service";
import { transactionsQuerySchema } from "@/features/transactions/schemas";
import type {
  TransactionDetail,
  TransactionListResponse,
  TransactionsQuery,
} from "@/features/transactions/types";
import type { Transaction as ApiTransaction } from "@/services/contracts/types";
function row(t: ApiTransaction) {
  return {
    id: t.id,
    title: t.orderId,
    merchantName: t.merchantName,
    amountCents: t.amountMinor,
    currency: t.currency,
    status: t.paymentStatus,
    createdAt: t.verifiedAt,
  };
}
export async function getTransactions(
  input: TransactionsQuery,
): Promise<TransactionListResponse> {
  const q = transactionsQuerySchema.parse(input);
  const result = await transactionsService.list();
  const matching = result.items
    .map(row)
    .filter(
      (t) =>
        (q.status === "ALL" || t.status === q.status) &&
        `${t.id} ${t.title} ${t.merchantName}`
          .toLowerCase()
          .includes(q.q.toLowerCase()),
    );
  const start = q.cursor ? matching.findIndex((t) => t.id === q.cursor) + 1 : 0;
  const items = matching.slice(start, start + q.limit);
  return {
    items,
    nextCursor:
      start + items.length < matching.length
        ? (items.at(-1)?.id ?? null)
        : null,
  };
}
export async function getTransaction(id: string): Promise<TransactionDetail> {
  const {
    transaction: t,
    snapshot: s,
    activeCaseId,
  } = await transactionsService.get(id);
  return {
    ...row(t),
    snapshot: {
      productName: s.sku,
      description: `Variant: ${s.variantId} · Snapshot: ${s.snapshotId}`,
      quantity: s.quantity ?? 1,
      unitPriceCents: s.amountMinor,
      termsVersion: s.snapshotHash ?? "Not supplied",
      approvedAt: null,
    },
    providerReferences: [
      ...(t.paypalOrderId
        ? [{ type: "ORDER" as const, id: t.paypalOrderId }]
        : []),
      ...(t.paypalCaptureId
        ? [{ type: "CAPTURE" as const, id: t.paypalCaptureId }]
        : []),
    ],
    activeCaseId,
  };
}
