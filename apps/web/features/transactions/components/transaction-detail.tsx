"use client";

import Link from "next/link";
import RequestState from "@/components/ui/request-state";
import { formatDate, formatMoney } from "@/lib/format";
import { useTransaction } from "@/features/transactions/hooks/use-transactions";
import TransactionStatusBadge from "@/features/transactions/components/transactions-status";
import { transactionsService } from "@/services/contracts/transactions.service";
import { useAction } from "@/components/ui/workflow";

type TransactionDetailProps = {
  transactionId: string;
};

export default function TransactionDetail({
  transactionId,
}: TransactionDetailProps) {
  const action = useAction();
  const { transaction, error, isLoading, isRefreshing, refresh } =
    useTransaction(transactionId);

  const fields = transaction
    ? [
        {
          label: "Transaction ID",
          value: transaction.id,
        },
        {
          label: "Verified (UTC)",
          value: formatDate(transaction.createdAt),
        },
        {
          label: "Quantity",
          value: String(transaction.snapshot?.quantity ?? "-"),
        },
        {
          label: "Snapshot total",
          value: formatMoney(
            transaction.snapshot?.unitPriceCents ?? 0,
            transaction.currency,
          ),
        },
        {
          label: "Snapshot binding",
          value: transaction.snapshot?.termsVersion ?? "-",
        },
        {
          label: "Approved at (UTC)",
          value: transaction.snapshot?.approvedAt
            ? formatDate(transaction.snapshot.approvedAt)
            : "Not supplied",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Link
        href="/workspace/transactions"
        className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
      >
        Back to transactions
      </Link>
      {transaction && (
        <Link
          className="vp-button"
          href={
            transaction.activeCaseId
              ? `/workspace/cases/${transaction.activeCaseId}`
              : `/workspace/cases/new?transactionId=${encodeURIComponent(transaction.id)}`
          }
        >
          {transaction.activeCaseId ? "Open resolution case" : "Report an issue"}
        </Link>
      )}

      {isLoading || error ? (
        <RequestState
          error={error}
          loadingLabel="Loading transaction..."
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      ) : !transaction ? (
        <p className="text-sm text-slate-600">
          This transaction is unavailable.
        </p>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <p className="text-xs font-medium tracking-widest text-slate-500">
              TRANSACTION DETAILS
            </p>

            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900">
              {transaction.title}
            </h1>

            <p className="mt-2 text-sm text-slate-600">
              {transaction.merchantName}
            </p>

            <dl className="mt-8 grid gap-6 sm:grid-cols-2">
              {fields.map((field) => (
                <div key={field.label}>
                  <dt className="text-xs text-slate-500">{field.label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium text-slate-900">
                    {field.value}
                  </dd>
                </div>
              ))}
            </dl>

            <div className="mt-8 border-t border-slate-200 pt-6">
              <h2 className="text-sm font-semibold text-slate-900">
                Purchase agreement
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-700">
                {transaction.snapshot?.productName ?? "Purchase details unavailable"}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {transaction.snapshot?.description ?? "No description supplied."}
              </p>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm text-slate-500">Purchase amount</h2>

              <p className="mt-3 text-3xl font-semibold text-slate-900 tabular-nums">
                {formatMoney(transaction.amountCents, transaction.currency)}
              </p>

              <div className="mt-4">
                <TransactionStatusBadge status={transaction.status} />
              </div>

              {["APPROVAL_PENDING", "UNKNOWN", "UNCONFIRMED"].includes(transaction.status) && (
                <div className="mt-4 space-y-3 border-t border-slate-200 pt-4">
                  {transaction.status === "APPROVAL_PENDING" ? (
                    <p className="text-xs leading-5 text-slate-600">
                      Buyer authorization pending. Click below to capture funds and confirm payment.
                    </p>
                  ) : (
                    <p className="text-xs leading-5 text-slate-600">
                      The payment outcome is still unconfirmed. If you have not approved this on PayPal Sandbox yet, open the approval link below, then capture.
                    </p>
                  )}
                  {transaction.providerReferences?.find((r) => r.type === "ORDER")?.id && (
                    <a
                      href={`https://www.sandbox.paypal.com/checkoutnow?token=${encodeURIComponent(transaction.providerReferences.find((r) => r.type === "ORDER")!.id)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    >
                      Open PayPal Sandbox approval page ↗
                    </a>
                  )}
                  <button
                    type="button"
                    disabled={action.busy}
                    onClick={() => void action.run(async () => {
                      await transactionsService.captureCheckoutOrder(
                        transaction.title || transaction.id,
                        crypto.randomUUID()
                      );
                      await refresh();
                    }, "Payment captured and confirmed successfully!")}
                    className="min-h-10 w-full rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {action.busy ? "Capturing payment…" : "Capture & complete payment"}
                  </button>
                  {action.feedback}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-slate-900">
                References
              </h2>

              <dl className="mt-4 space-y-4">
                {transaction.providerReferences?.map((reference) => (
                  <div key={`${reference.type}:${reference.id}`}>
                    <dt className="text-xs text-slate-500">{reference.type}</dt>
                    <dd className="mt-1 break-all text-xs leading-5 text-slate-700">
                      {reference.id}
                    </dd>
                  </div>
                ))}

                {transaction.activeCaseId && (
                  <div>
                    <dt className="text-xs text-slate-500">Case reference</dt>
                    <dd className="mt-1 break-all text-sm text-slate-700">
                      {transaction.activeCaseId}
                    </dd>
                  </div>
                )}
              </dl>

              {!transaction.providerReferences?.length && (
                <p className="mt-4 text-sm text-slate-600">
                  No provider reference is available yet.
                </p>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
