"use client";

import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { getOverviewSummary } from "@/services/overview.service";
import type { OverviewSummaryData } from "@/features/overview/types";

export function useOverview() {
  const { session } = useSession();
  const result = useSWR<OverviewSummaryData, Error>(
    session?.activeWorkspace.id ? ["overview", session.activeWorkspace.id] : null,
    getOverviewSummary,
    { shouldRetryOnError: false, revalidateOnFocus: false },
  );

  return {
    summary: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isRefreshing: result.isValidating,
    refresh: () => result.mutate(),
  };
}
