"use client";

import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { getOverviewSummary } from "@/services/overview.service";
import type { OverviewSummaryData } from "@/features/overview/types";

export function useOverview() {
  const {session} = useSession();
  const mode = session?.activeWorkspace.id;

  const {
    data,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<OverviewSummaryData, Error>(["overview", mode],
    () => getOverviewSummary(),
    {
      shouldRetryOnError: false,
      revalidateOnFocus: false,
    },
  );

  return {
    summary: data,
    error,
    isLoading,
    isRefreshing: isValidating,
    refresh: () => mutate(),
  };
}