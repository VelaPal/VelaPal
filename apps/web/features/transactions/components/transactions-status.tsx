import type { TransactionStatus } from "@/features/transactions/types";

export const transactionStatusLabels: Record<TransactionStatus, string> = {
  APPROVAL_PENDING: "Approval pending",
  UNCONFIRMED: "Unconfirmed",
  PARTIALLY_REFUNDED: "Partially refunded",
  PAID: "Paid",
  PENDING: "Pending",
  FAILED: "Failed",
  REFUNDED: "Refunded",
  UNKNOWN: "Unconfirmed",
};

const statusStyles: Record<TransactionStatus, string> = {
  APPROVAL_PENDING: "bg-amber-50 text-amber-800",
  UNCONFIRMED: "bg-amber-50 text-amber-800",
  PARTIALLY_REFUNDED: "bg-blue-50 text-blue-700",
  PAID: "bg-emerald-50 text-emerald-700",
  PENDING: "bg-amber-50 text-amber-800",
  FAILED: "bg-rose-50 text-rose-700",
  REFUNDED: "bg-blue-50 text-blue-700",
  UNKNOWN: "bg-slate-100 text-slate-700",
};

type TransactionStatusProps = {
  status: TransactionStatus;
};

export default function TransactionStatusBadge({
  status,
}: TransactionStatusProps) {
  return (
    <span className={`vp-payment-badge ${statusStyles[status]}`}>
      {transactionStatusLabels[status]}
    </span>
  );
}
