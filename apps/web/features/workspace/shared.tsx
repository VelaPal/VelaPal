"use client";
import { type ReactNode } from "react";
import { useSession } from "@/features/auth/session";
import { Panel } from "@/components/ui/workflow";
import { AdminBadge } from "@/features/admin/admin-ui";
export function WorkspaceHeading({
  eyebrow,
  title,
  copy,
  action,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  action?: ReactNode;
}) {
  return (
    <header className="vp-page-heading">
      <div>
        <p className="vp-eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </header>
  );
}
export function PartySecurity() {
  const { session, logout } = useSession();
  return (
    <Panel title="Account & security">
      <p className="vp-section-description">
        Your VelaPal identity is separate from PayPal authorization.
      </p>
      <dl className="vp-admin-review">
        {[
          ["Account", session?.user.email ?? ""],
          ["Granted workspaces", session?.activeWorkspace.role ?? ""],
          ["MFA", "Recommended for sensitive actions"],
          ["Current session", session ? "Signed in" : "Not signed in"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="vp-settings-actions">
        <button className="vp-secondary" onClick={() => void logout()}>
          Sign out
        </button>
      </div>
      <AdminBadge>{session?.activeWorkspace.type ?? "No workspace"}</AdminBadge>
    </Panel>
  );
}
