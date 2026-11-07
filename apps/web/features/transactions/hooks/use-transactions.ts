"use client";

import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { getTransaction, getTransactions} from "@/services/transaction.service";
import type {TransactionDetail,TransactionListResponse,TransactionsQuery} from "@/features/transactions/types";

const options = {shouldRetryOnError: false, revalidateOnFocus: false};

const defaultQuery: TransactionsQuery = {
  q: "",
  status: "ALL",
  cursor: null,
  limit: 5,
};

export function useTransactions(query: TransactionsQuery = defaultQuery,) {
  const {session} = useSession();
  const mode = session?.activeWorkspace.id;
  const result = useSWR<TransactionListResponse, Error>(["transactions", mode, query],() => getTransactions(query),options);
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
  const {session} = useSession();
  const mode = session?.activeWorkspace.id;
  const result = useSWR<TransactionDetail, Error>( id ? ["transaction", mode, id] : null,() => getTransaction(id), options);
  
    return {
    transaction: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isRefreshing: result.isValidating,
    refresh: () => result.mutate(),
  };
}