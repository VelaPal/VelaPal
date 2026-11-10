"use client";
import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "@/features/auth/session";
import {
  createAdminPreview,
  applyAdminPreviewAction,
  type AdminPreview,
  type PreviewAction,
} from "./admin-preview";
const states = new Map<string, AdminPreview>();
const listeners = new Set<() => void>();
const fallback = createAdminPreview();
function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
function getState(key: string) {
  if (!states.has(key)) {
    let stored: AdminPreview | null = null;
    try {
      const raw = sessionStorage.getItem(key);
      if (raw) {
        const data = JSON.parse(raw);
        if (
          Array.isArray(data.users) &&
          Array.isArray(data.merchants) &&
          Array.isArray(data.audit) &&
          Array.isArray(data.permissions) &&
          Array.isArray(data.invitations) &&
          typeof data.aiEnabled === "boolean"
        )
          stored = data;
      }
    } catch {}
    states.set(key, stored ?? createAdminPreview());
  }
  return states.get(key)!;
}
export function useAdminPreview() {
  const { session } = useSession();
  const enabled = session?.activeWorkspace.type === "ADMIN";
  const key = `velapal:admin-preview:${session?.user.id}:${session?.activeWorkspace.id}`;
  const read = useCallback(
    () => (enabled ? getState(key) : fallback),
    [key, enabled],
  );
  const state = useSyncExternalStore(subscribe, read, () => fallback);
  return {
    state,
    enabled,
    commit: (action: PreviewAction, reason: string, code: string) => {
      if (!enabled || !session)
        throw new Error(
          "This action is available in the local Admin preview only.",
        );
      const next = applyAdminPreviewAction(
        getState(key),
        {
          name: session.user.name,
          workspaceType: session.activeWorkspace.type,
        },
        action,
        reason,
        code,
      );
      sessionStorage.setItem(key, JSON.stringify(next));
      states.set(key, next);
      listeners.forEach((fn) => fn());
    },
    reset: () => {
      if (!enabled) return;
      sessionStorage.removeItem(key);
      states.set(key, createAdminPreview());
      listeners.forEach((fn) => fn());
    },
  };
}
