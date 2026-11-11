import { transactionsService } from "@/services/contracts/transactions.service";
import { transactionsQuerySchema } from "@/features/transactions/schemas";
import type {
  TransactionDetail,
  TransactionListResponse,
  TransactionsQuery,
} from "@/features/transactions/types";
import type { Transaction as ApiTransaction } from "@/services/contracts/types";

function toRow(transaction: ApiTransaction) {
  return {
    id: transaction.id,
    title: transaction.orderId,
    merchantName: transaction.merchantName,
    amountCents: transaction.amountMinor,
    currency: transaction.currency,
    status: transaction.paymentStatus,
    createdAt: transaction.verifiedAt,
  };
}

export async function getTransactions(input: TransactionsQuery): Promise<TransactionListResponse> {
  const query = transactionsQuerySchema.parse(input);
  const { items } = await transactionsService.list();
  const matching = items
    .map(toRow)
    .filter(
      (transaction) =>
        (query.status === "ALL" || transaction.status === query.status) &&
        `${transaction.id} ${transaction.title} ${transaction.merchantName}`
          .toLowerCase()
          .includes(query.q.toLowerCase()),
    );
  const cursorIndex = query.cursor
    ? matching.findIndex((transaction) => transaction.id === query.cursor) + 1
    : 0;
  const start = Math.max(0, cursorIndex);
  const page = matching.slice(start, start + query.limit);

  return {
    items: page,
    nextCursor:
      start + page.length < matching.length ? page.at(-1)?.id ?? null : null,
  };
}

export async function getTransaction(id: string): Promise<TransactionDetail> {
  const { transaction, snapshot, activeCaseId } = await transactionsService.get(id);
  return {
    ...toRow(transaction),
    snapshot: {
      productName: snapshot.sku,
      description: `Variant: ${snapshot.variantId} · Snapshot: ${snapshot.snapshotId}`,
      quantity: snapshot.quantity ?? 1,
      unitPriceCents: snapshot.amountMinor,
      termsVersion: snapshot.snapshotHash ?? "Not supplied",
      approvedAt: null,
    },
    providerReferences: [
      ...(transaction.paypalOrderId
        ? [{ type: "ORDER" as const, id: transaction.paypalOrderId }]
        : []),
      ...(transaction.paypalCaptureId
        ? [{ type: "CAPTURE" as const, id: transaction.paypalCaptureId }]
        : []),
    ],
    activeCaseId,
  };
}
