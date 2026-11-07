"use client";
import { type ReactNode, useState } from "react";
import { useSession } from "@/features/auth/session";
import { Panel, useAction } from "@/components/ui/workflow";
import { AdminDialog, AdminNotice } from "@/features/admin/admin-ui";
import { useWorkspacePreview } from "./use-workspace-preview";
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
export function PreviewDisclosure() {
  return (
    <p className="vp-p1-disclosure">
      Frontend preview · Fictional P1 records, stored in this tab. These are
      separate from API purchases, balances, permissions and provider results.
    </p>
  );
}
export function UnavailablePreview() {
  return (
    <AdminNotice>
      This screen needs a confirmed backend integration in API mode. Explore its
      fictional frontend flow in mock mode.
    </AdminNotice>
  );
}
export function PartySecurity() {
  const { session, logout } = useSession();
  const { state, enabled, commit, reset } = useWorkspacePreview();
  const [actionDialog, setDialog] = useState<
    "revoke" | "expire" | "reset" | null
  >(null);
  const [reviewed, setReviewed] = useState(false);
  const action = useAction();
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
          [
            "Current session",
            enabled
              ? "Cookie-authenticated mock session"
              : "Current signed-in session",
          ],
          [
            "Other sample session",
            state.otherSessionRevoked
              ? "Revoked · local fixture"
              : "Mobile browser · fixture",
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <div className="vp-settings-actions">
        <button
          className="vp-secondary"
          disabled={!enabled || state.otherSessionRevoked}
          onClick={() => {
            setReviewed(false);
            setDialog("revoke");
          }}
        >
          Revoke other session
        </button>
        <button
          className="vp-secondary"
          disabled={!enabled}
          onClick={() => setDialog("expire")}
        >
          Preview session expiry
        </button>
        <button
          className="vp-secondary"
          disabled={action.busy}
          onClick={() => void action.run(logout, "")}
        >
          Sign out
        </button>
      </div>
      {action.feedback}
      {enabled && (
        <details className="vp-prototype-controls">
          <summary>Prototype controls</summary>
          <p>
            Clear only this workspace’s local preview changes. API disputes and
            transactions remain unchanged.
          </p>
          <button className="vp-secondary" onClick={() => setDialog("reset")}>
            Reset demo workspace
          </button>
        </details>
      )}
      {actionDialog && (
        <AdminDialog
          title={
            actionDialog === "revoke"
              ? "Revoke sample session"
              : actionDialog === "expire"
                ? "Your session has expired."
                : "Reset workspace preview"
          }
          onClose={() => setDialog(null)}
        >
          <p className="vp-admin-dialog-copy">
            {actionDialog === "revoke"
              ? "Revoke the fictional mobile session. This does not change any real session."
              : actionDialog === "expire"
                ? "This previews an expired session. Sign in again ends your current mock session."
                : "Restore local preview defaults. Existing API records and authentication remain unchanged."}
          </p>
          {actionDialog === "revoke" && (
            <label className="vp-consent-label">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed the sample session and its consequences.
            </label>
          )}
          <div className="vp-intake-actions">
            <button className="vp-secondary" onClick={() => setDialog(null)}>
              Go back
            </button>
            <button
              className="vp-button"
              disabled={(actionDialog === "revoke" && !reviewed) || action.busy}
              onClick={() => {
                if (actionDialog === "expire") {
                  void action.run(logout, "");
                  return;
                }
                if (actionDialog === "revoke")
                  commit({ kind: "revoke-sample" });
                else {
                  reset();
                  window.location.reload();
                }
                setDialog(null);
              }}
            >
              {actionDialog === "expire"
                ? "Sign in again"
                : actionDialog === "revoke"
                  ? "Confirm demo revocation"
                  : "Reset local preview"}
            </button>
          </div>
        </AdminDialog>
      )}
    </Panel>
  );
}
