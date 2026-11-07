"use client";
import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";
import RequestState from "@/components/ui/request-state";
import { useTransactions } from "@/features/transactions/hooks/use-transactions";
import TransactionList from "./transaction-list";
export default function RecentTransactions() {
  const { items, error, isLoading, isRefreshing, refresh } = useTransactions();
  return (
    <section
      aria-labelledby="recent-transactions-title"
      className="vp-recent-panel"
    >
      <header className="vp-section-heading">
        <div>
          <h2 id="recent-transactions-title">Recent transactions</h2>
          <p>The details behind every purchase.</p>
        </div>
        <Link href="/workspace/transactions" className="vp-link">
          View all
          <ArrowRight size={14} />
        </Link>
      </header>
      {isLoading || error ? (
        <RequestState
          error={error}
          loadingLabel="Loading recent transactions..."
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      ) : (
        <TransactionList items={items} />
      )}
      <p className="vp-table-footer">
        <ShieldCheck size={11} aria-hidden="true" />
        Only purchases from your connected merchant.
      </p>
    </section>
  );
}
