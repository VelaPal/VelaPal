"use client";
import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { disputesService } from "@/services/contracts/disputes.service";
export function useCases() {
  const { session } = useSession();
  return useSWR(
    session && session.activeWorkspace.type !== "ADMIN"
      ? [session.activeWorkspace.id, "cases"]
      : null,
    () => disputesService.list(),
  );
}
export function useCase(id: string) {
  const { session } = useSession();
  return useSWR(
    session && session.activeWorkspace.type !== "ADMIN"
      ? [session.activeWorkspace.id, "case", id]
      : null,
    () => disputesService.get(id),
    { refreshInterval: 3000 },
  );
}
