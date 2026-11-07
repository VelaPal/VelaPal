"use client";

import { useState, type FormEvent } from "react";
import RequestState from "@/components/ui/request-state";
import { transactionStatusSchema } from "@/features/transactions/schemas";
import { useTransactions } from "@/features/transactions/hooks/use-transactions";
import type { TransactionsQuery } from "@/features/transactions/types";
import TransactionList from "./transaction-list";
import { transactionStatusLabels } from "@/features/transactions/components/transactions-status";

const initialQuery: TransactionsQuery = {
  q: "",
  status: "ALL",
  cursor: null,
  limit: 5,
};

export default function TransactionsContent() {
  const [query, setQuery] = useState<TransactionsQuery>(initialQuery);
  const [search, setSearch] = useState("");
  const [status, setStatus] =
    useState<TransactionsQuery["status"]>("ALL");
  const [history, setHistory] = useState<(string | null)[]>([]);

  const {
    items,
    nextCursor,
    error,
    isLoading,
    isRefreshing,
    refresh,
  } = useTransactions(query);

  const busy = isLoading || isRefreshing;
  const isMock = process.env.NEXT_PUBLIC_API_MODE === "mock";

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setQuery({
      q: search.trim(),
      status,
      cursor: null,
      limit: 5,
    });

    setHistory([]);
  }

  function nextPage() {
    if (!nextCursor || busy) return;

    setHistory((previous) => [...previous, query.cursor]);
    setQuery((previous) => ({
      ...previous,
      cursor: nextCursor,
    }));
  }

  function previousPage() {
    const cursor = history.at(-1);

    if (cursor === undefined || busy) return;

    setHistory((previous) => previous.slice(0, -1));
    setQuery((previous) => ({
      ...previous,
      cursor,
    }));
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
            Transactions
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Review purchases and payments made through VelaPal.
          </p>
        </div>

        {isMock && (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
            Demo data
          </span>
        )}
      </header>

      <form
        onSubmit={applyFilters}
        className="grid items-end gap-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto]"
      >
        <div>
          <label
            htmlFor="transaction-search"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Search
          </label>
          <input
            id="transaction-search"
            type="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Item, merchant, or transaction ID"
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          />
        </div>

        <div>
          <label
            htmlFor="transaction-status"
            className="mb-2 block text-sm font-medium text-slate-700"
          >
            Status
          </label>
          <select
            id="transaction-status"
            value={status}
            onChange={(event) => {
              setStatus(
                event.target.value as TransactionsQuery["status"],
              );
            }}
            className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          >
            <option value="ALL">All statuses</option>
            {transactionStatusSchema.options.map((value) => (
              <option key={value} value={value}>
                {transactionStatusLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Apply filters
        </button>
      </form>

      {isLoading || error ? (
        <RequestState
          error={error}
          loadingLabel="Loading transactions..."
          onRetry={refresh}
          isRetrying={isRefreshing}
        />
      ) : (
        <TransactionList items={items} />
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          disabled={history.length === 0 || busy}
          onClick={previousPage}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <p className="text-xs text-slate-500">
          Page {history.length + 1} · UTC
        </p>

        <button
          type="button"
          disabled={!nextCursor || busy || Boolean(error)}
          onClick={nextPage}
          className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </div>
  );
}