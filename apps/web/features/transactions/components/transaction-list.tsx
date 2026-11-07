import Link from "next/link";
import { ArrowUpRight, HardDrive } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/format";
import type { Transaction } from "@/features/transactions/types";
import TransactionStatusBadge from "./transactions-status";
export default function TransactionList({ items }: { items: Transaction[] }) {
  if (!items.length)
    return (
      <p role="status" className="vp-panel text-sm text-slate-600">
        No transactions match your filters.
      </p>
    );
  return (
    <div className="vp-transaction-table">
      <div
        aria-hidden="true"
        className="vp-transaction-columns vp-transaction-labels"
      >
        <span>Transaction</span>
        <span className="vp-transaction-date">Verified (UTC)</span>
        <span>Status</span>
        <span className="vp-transaction-amount">Amount</span>
        <span />
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/workspace/transactions/${encodeURIComponent(item.id)}`}
              className="vp-transaction-columns vp-transaction-row"
            >
              <div className="vp-transaction-product">
                <span className="vp-product-mark" aria-hidden="true">
                  <HardDrive size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.merchantName} · {item.id}
                  </small>
                </div>
              </div>
              <time
                dateTime={item.createdAt ?? undefined}
                className="vp-transaction-date"
              >
                {formatDate(item.createdAt).split(",")[0]}
              </time>
              <div>
                <TransactionStatusBadge status={item.status} />
              </div>
              <strong className="vp-transaction-amount">
                {formatMoney(item.amountCents, item.currency)}
              </strong>
              <ArrowUpRight
                className="vp-transaction-arrow"
                size={13}
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
