"use client";
import { useId, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Bell, ChevronDown, ChevronRight } from "lucide-react";
import { useSession } from "@/features/auth/session";
import { ErrorNotice, MfaStepUp, useAction } from "@/components/ui/workflow";
import { activeNavigation, workspaceNavigation } from "./navigation";
export function WorkspacePicker() {
  const { session, workspaces, switchWorkspace } = useSession();
  const action = useAction();
  const [pending, setPending] = useState("");
  const id = useId();
  const role = session?.activeWorkspace.type;
  const label =
    role === "SELLER"
      ? "Seller workspace"
      : role === "ADMIN"
        ? "Admin workspace"
        : "Personal workspace";
  return (
    <>
      <div className="vp-workspace-picker">
        <span className="vp-workspace-identity" aria-hidden="true">
          {role === "SELLER"
            ? "V"
            : role === "ADMIN"
              ? "A"
              : session?.user.name.charAt(0)}
        </span>
        <div className="vp-workspace-picker-copy">
          <label htmlFor={id}>
            YOUR WORKSPACE<span className="sr-only"> · Switch workspace</span>
          </label>
          <select
            id={id}
            aria-label="Switch workspace"
            value={session?.activeWorkspace.id}
            disabled={action.busy}
            onChange={(e) => {
              const target = e.target.value;
              if (
                workspaces?.find((w) => w.id === target)?.type ===
                "ADMIN"
              )
                setPending(target);
              else void action.run(() => switchWorkspace(target));
            }}
          >
            {(workspaces?.length
              ? workspaces
              : session
                ? [session.activeWorkspace]
                : []
            )?.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id === session?.activeWorkspace.id
                  ? label
                  : w.name}
              </option>
            ))}
          </select>
        </div>
        <ChevronDown size={13} aria-hidden="true" />
      </div>
      <ErrorNotice error={action.error} />
      {pending && (
        <div className="vp-workspace-stepup">
          <MfaStepUp
            purpose="WORKSPACE_SWITCH"
            targetId={pending}
            onVerified={async (step) => {
              await switchWorkspace(pending, step);
              setPending("");
            }}
          />
          <button className="vp-link" onClick={() => setPending("")}>
            Cancel switch
          </button>
        </div>
      )}
    </>
  );
}
export default function WorkspaceControls() {
  const { session } = useSession();
  const pathname = usePathname();
  const role = session?.activeWorkspace.type;
  const items = workspaceNavigation(role);
  const active = activeNavigation(items, pathname);
  const current = items.find((i) => i.href === active)?.label ?? "Overview";
  const workspace =
    role === "ADMIN"
      ? "Admin workspace"
      : role === "SELLER"
        ? "Seller workspace"
        : "Personal workspace";
  const mock = process.env.NEXT_PUBLIC_API_MODE !== "api";
  return (
    <>
      <header className="vp-topbar">
        <div className="vp-mobile-brand-space" />
        <div className="vp-breadcrumb">
          <span>{workspace}</span>
          <ChevronRight size={13} aria-hidden="true" />
          <strong>{current}</strong>
        </div>
        <div className="vp-topbar-actions">
          <span className="vp-connection">
            <i aria-hidden="true" />
            {mock ? "VelaPal demo" : "VelaPal workspace"}
          </span>
          {role === "ADMIN" ? (
            <button
              type="button"
              className="vp-icon-button vp-notification"
              aria-label="Notifications unavailable in P0"
              disabled
            >
              <Bell size={18} aria-hidden="true" />
            </button>
          ) : (
            <Link
              href="/workspace/notifications"
              className="vp-icon-button vp-notification"
              aria-label="Notifications"
            >
              <Bell size={18} aria-hidden="true" />
            </Link>
          )}
          <Link
            href={
              role === "ADMIN"
                ? "/workspace/admin/settings"
                : "/workspace/settings"
            }
            className="vp-avatar"
            aria-label="Open account security"
          >
            {session?.user.name.charAt(0)}
          </Link>
        </div>
      </header>
      {mock && (
        <details className="vp-demo-strip">
          <summary>
            <span>Fictional data · No real payments, scans, or AI calls.</span>
            <span>About this demo ↗</span>
          </summary>
          <p>
            Synthetic demo · AI, scans and business records are simulated. No
            PayPal or Gemini calls. API data resets when the mock API restarts.
            Local previews can be reset in Settings.
          </p>
        </details>
      )}
    </>
  );
}
