"use client";

import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { getTransaction, getTransactions } from "@/services/transaction.service";
import type { TransactionDetail, TransactionsQuery } from "@/features/transactions/types";

const defaultQuery: TransactionsQuery = {
  q: "",
  status: "ALL",
  cursor: null,
  limit: 5,
};

const options = { shouldRetryOnError: false, revalidateOnFocus: false };

export function useTransactions(query: TransactionsQuery = defaultQuery) {
  const { session } = useSession();
  const result = useSWR(
    session?.activeWorkspace.id ? ["transactions", session.activeWorkspace.id, query] : null,
    () => getTransactions(query),
    options,
  );

  return {
    items: result.data?.items ?? [],
    nextCursor: result.data?.nextCursor ?? null,
    error: result.error,
    isLoading: result.isLoading,
    isRefreshing: result.isValidating,
    refresh: () => result.mutate(),
  };
}

export function useTransaction(id: string) {
  const { session } = useSession();
  const result = useSWR<TransactionDetail, Error>(
    id && session?.activeWorkspace.id
      ? ["transaction", session.activeWorkspace.id, id]
      : null,
    () => getTransaction(id),
    options,
  );

  return {
    transaction: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isRefreshing: result.isValidating,
    refresh: () => result.mutate(),
  };
}
