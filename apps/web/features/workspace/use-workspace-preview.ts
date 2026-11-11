"use client";

import useSWR from "swr";
import { authService } from "@/services/contracts/auth.service";

/** Loads the signed-in workspace from the Express session endpoint. */
export function useWorkspacePreview() {
  const result = useSWR("current-workspace", authService.restoreSession, {
    shouldRetryOnError: false,
    revalidateOnFocus: false,
  });
  return {
    workspace: result.data?.activeWorkspace ?? null,
    isLoading: result.isLoading,
    error: result.error,
    refresh: () => result.mutate(),
  };
}
