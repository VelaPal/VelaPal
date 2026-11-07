"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "@/features/auth/session";
import {
  initialWorkspacePreview,
  applyWorkspacePreview,
  type WorkspacePreview,
  type WorkspacePreviewAction,
} from "./preview-state";
const records = new Map<string, WorkspacePreview>();
const listeners = new Set<() => void>();
const fallback = initialWorkspacePreview();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function read(key: string) {
  if (!records.has(key)) {
    let state = initialWorkspacePreview();
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const value = JSON.parse(raw);
        if (
          value.version === 1 &&
          value.subscription &&
          value.business &&
          Array.isArray(value.products) &&
          Array.isArray(value.history)
        )
          state = value;
      }
    } catch {}
    records.set(key, state);
  }
  return records.get(key)!;
}
export function useWorkspacePreview() {
  const { session } = useSession();
  const role = session?.activeWorkspace.type;
  const enabled =
    process.env.NEXT_PUBLIC_API_MODE !== "api" &&
    (role === "CUSTOMER" || role === "SELLER");
  const key = `velapal:workspace-preview:${session?.user.id}:${session?.activeWorkspace.id}`;
  const snapshot = useCallback(
    () => (enabled ? read(key) : fallback),
    [enabled, key],
  );
  const state = useSyncExternalStore(subscribe, snapshot, () => fallback);
  return {
    state,
    enabled,
    role,
    commit: (action: WorkspacePreviewAction) => {
      if (!enabled || !role)
        throw new Error(
          "This action is available in the frontend preview only.",
        );
      if (action.kind === "fulfilment" && !action.orderId)
        throw new Error("Choose an authorized order.");
      const next = applyWorkspacePreview(
        read(key),
        role,
        action,
        new Date().toISOString(),
      );
      sessionStorage.setItem(key, JSON.stringify(next));
      records.set(key, next);
      listeners.forEach((fn) => fn());
    },
    reset: () => {
      if (!enabled) return;
      sessionStorage.removeItem(key);
      records.set(key, initialWorkspacePreview());
      listeners.forEach((fn) => fn());
    },
  };
}
