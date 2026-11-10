"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  Check,
  Sailboat,
  ShieldCheck,
  Users,
  Store,
  Scale,
  Activity,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import { useSession } from "@/features/auth/session";
import { adminService } from "@/services/contracts/admin.service";
import { ErrorNotice, Panel, useAction } from "@/components/ui/workflow";
import StatCard from "@/components/ui/stat-card";
import { formatDate, formatMoney } from "@/lib/format";
import {
  previewTransactions,
  staffPermissions,
  type PreviewAction,
  type PreviewMerchant,
} from "./admin-preview";
import { useAdminPreview } from "./use-admin-preview";
import { ApiAdminMerchants } from "./admin-merchants-api";
import {
  AdminHeading,
  AdminNotice,
  AdminTable,
  AdminSearch,
  AdminBadge,
  AdminDialog,
  AdminConfirm,
  ExportButton,
  exportCsv,
  PreviewUnavailable,
} from "./admin-ui";
type Confirmation = {
  title: string;
  description: string;
  target: string;
  action: PreviewAction;
};
function Confirm({
  value,
  close,
}: {
  value: Confirmation | null;
  close: () => void;
}) {
  return value ? <AdminConfirm {...value} onClose={close} /> : null;
}
export function AdminUsers() {
  const { state, enabled } = useAdminPreview();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const rows = state.users.filter(
    (u) =>
      (status === "All" || status === u.status) &&
      `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="User management"
        description="Review account status and revoke access with an accountable decision."
      />
      {!enabled ? (
        <PreviewUnavailable />
      ) : (
        <>
          <div className="vp-admin-filters">
            <AdminSearch
              value={query}
              onChange={setQuery}
              label="Search name or email…"
            />
            <select
              className="vp-input"
              aria-label="Account status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["All", "Active", "Suspended"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <AdminTable
            headers={[
              "Account",
              "Workspaces",
              "Verification",
              "Status",
              "Action",
            ]}
          >
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <strong>{u.name}</strong>
                  <small>{u.email}</small>
                </td>
                <td>{u.roles.join(", ")}</td>
                <td>{u.verified ? "Verified" : "Pending"}</td>
                <td>
                  <AdminBadge>{u.status}</AdminBadge>
                </td>
                <td>
                  <button
                    className="vp-link"
                    disabled={u.roles.includes("admin")}
                    onClick={() =>
                      setConfirmation({
                        title:
                          u.status === "Active"
                            ? "Suspend account"
                            : "Restore account",
                        description:
                          "Change this fictional account’s access status in the local preview. Existing financial records are retained. This does not revoke any real session.",
                        target: `${u.id} · ${u.name}`,
                        action: {
                          kind: "user",
                          id: u.id,
                          status:
                            u.status === "Active" ? "Suspended" : "Active",
                        },
                      })
                    }
                  >
                    {u.roles.includes("admin")
                      ? "Internal policy"
                      : u.status === "Active"
                        ? "Suspend"
                        : "Restore access"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="vp-empty-note">
                  No accounts match this search.
                </td>
              </tr>
            )}
          </AdminTable>
          <AdminNotice>
            Administrators cannot use this screen to change their own
            privileges. Sensitive staff access is managed through the internal
            role workflow.
          </AdminNotice>
          <Confirm value={confirmation} close={() => setConfirmation(null)} />
        </>
      )}
    </div>
  );
}
export function AdminMerchants() {
  const { state, enabled } = useAdminPreview();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  if (process.env.NEXT_PUBLIC_API_MODE === "api") return <ApiAdminMerchants />;
  const merchant = state.merchants.find((m) => m.id === selected);
  const rows = state.merchants.filter(
    (m) =>
      (status === "All" || m.status === status) &&
      `${m.name} ${m.owner} ${m.email}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const review = (m: PreviewMerchant, status: "Approved" | "Rejected") => {
    setSelected(null);
    setConfirmation({
      title: status === "Approved" ? "Approve merchant" : "Reject merchant",
      description:
        "Record a VelaPal business review. This does not connect PayPal, authorize a payment or grant access to customer funds.",
      target: `${m.id} · ${m.name}`,
      action: { kind: "merchant", id: m.id, status },
    });
  };
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="Merchant verification"
        description="A VelaPal approval is a business decision. PayPal authorization is separate."
      />
      {!enabled ? (
        <PreviewUnavailable />
      ) : (
        <>
          <div className="vp-admin-filters">
            <AdminSearch
              label="Search businesses…"
              value={query}
              onChange={setQuery}
            />
            <select
              className="vp-input"
              aria-label="Merchant status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["All", "Pending", "Approved", "Rejected"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <AdminTable
            headers={[
              "Business",
              "Owner",
              "Category",
              "Review status",
              "Action",
            ]}
          >
            {rows.map((m) => (
              <tr key={m.id}>
                <td>
                  <strong>{m.name}</strong>
                  <small>
                    {m.country} · {m.id}
                  </small>
                </td>
                <td>{m.owner}</td>
                <td>{m.category}</td>
                <td>
                  <AdminBadge>{m.status}</AdminBadge>
                </td>
                <td>
                  <button className="vp-link" onClick={() => setSelected(m.id)}>
                    Review details
                    <ArrowRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="vp-empty-note">
                  No businesses match this search.
                </td>
              </tr>
            )}
          </AdminTable>
          {merchant && (
            <AdminDialog
              title={merchant.name}
              onClose={() => setSelected(null)}
            >
              <AdminBadge>{merchant.status}</AdminBadge>
              <dl className="vp-admin-review">
                {[
                  ["Responsible person", merchant.owner],
                  ["Business email", merchant.email],
                  ["Category", merchant.category],
                  ["Country", merchant.country],
                  ["Website", merchant.website],
                  ["Review note", merchant.note],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd>{v}</dd>
                  </div>
                ))}
              </dl>
              <AdminNotice>
                Check business completeness and eligibility. Payment
                authorization must be verified separately.
              </AdminNotice>
              <div className="vp-intake-actions">
                <button
                  className="vp-secondary"
                  onClick={() => review(merchant, "Rejected")}
                >
                  Reject with reason
                </button>
                <button
                  className="vp-button"
                  onClick={() => review(merchant, "Approved")}
                >
                  Review approval
                  <ArrowRight size={14} />
                </button>
              </div>
            </AdminDialog>
          )}
          <Confirm value={confirmation} close={() => setConfirmation(null)} />
        </>
      )}
    </div>
  );
}
export function AdminTransactions() {
  const { enabled } = useAdminPreview();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const rows = previewTransactions.filter(
    (t) =>
      (status === "All" || t.status === status) &&
      `${t.id} ${t.product} ${t.merchant}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="Transaction monitoring"
        description="Inspect verified state and correlation references. No arbitrary refund controls."
        action={
          enabled && (
            <ExportButton
              label="Export demo"
              onClick={() =>
                exportCsv(
                  "velapal-demo-transactions.csv",
                  [
                    "Reference",
                    "Product",
                    "Merchant",
                    "State",
                    "Gross USD",
                    "Evidence",
                  ],
                  rows.map((t) => [
                    t.id,
                    t.product,
                    t.merchant,
                    t.status,
                    (t.amountMinor / 100).toFixed(2),
                    "Seeded fixture; no live provider event",
                  ]),
                )
              }
            />
          )
        }
      />
      {!enabled ? (
        <PreviewUnavailable />
      ) : (
        <>
          <div className="vp-admin-filters">
            <AdminSearch
              value={query}
              onChange={setQuery}
              label="Search transaction references…"
            />
            <select
              className="vp-input"
              aria-label="Transaction status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["All", "Paid", "Refunded", "Pending"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <AdminTable
            headers={[
              "Reference",
              "Merchant",
              "State",
              "Gross amount",
              "Evidence of state",
            ]}
          >
            {rows.map((t) => (
              <tr key={t.id}>
                <td>
                  <strong>{t.id}</strong>
                  <small>{t.product}</small>
                </td>
                <td>{t.merchant}</td>
                <td>
                  <AdminBadge>{t.status}</AdminBadge>
                </td>
                <td>{formatMoney(t.amountMinor)}</td>
                <td>
                  Seeded fixture<small>No live provider event</small>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="vp-empty-note">
                  No transactions match this view.
                </td>
              </tr>
            )}
          </AdminTable>
          <AdminNotice>
            In production, signed webhooks and provider reads drive settlement
            state. These sample records are not a PayPal balance, payout report,
            or completed refund verification.
          </AdminNotice>
        </>
      )}
    </div>
  );
}
const agents = [
  {
    name: "Personal Agent",
    purpose: "Purchase guidance",
    sources: "Owned purchases and subscriptions",
  },
  {
    name: "Buyer Agent",
    purpose: "Prepare buyer position",
    sources: "Buyer-owned private + shared sources",
  },
  {
    name: "Merchant Agent",
    purpose: "Prepare merchant position",
    sources: "Merchant-owned private + shared sources",
  },
  {
    name: "Evidence Agent",
    purpose: "Check facts and contradictions",
    sources: "Approved shared evidence only",
  },
  {
    name: "Mediator Agent",
    purpose: "Propose options, never rule",
    sources: "Shared assessment + policy references",
  },
];
export function AdminAi() {
  const { state, enabled } = useAdminPreview();
  const [trace, setTrace] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="AI agent monitoring"
        description="Understand what ran, which sources were allowed, and where a person must decide."
        action={
          enabled && (
            <button
              className="vp-secondary"
              onClick={() =>
                setConfirmation({
                  title: state.aiEnabled ? "Pause new runs" : "Resume new runs",
                  description:
                    "Update the scripted monitoring preview. No live model is connected; existing API runs and party permissions remain unchanged.",
                  target: "Demo AI monitoring",
                  action: { kind: "ai", enabled: !state.aiEnabled },
                })
              }
            >
              {state.aiEnabled ? "Pause new runs" : "Resume new runs"}
            </button>
          )
        }
      />
      {!enabled ? (
        <PreviewUnavailable />
      ) : (
        <>
          <AdminNotice>
            All five logical roles share one proposed Python service. The
            prototype uses scripted output; no Gemini calls are made.
          </AdminNotice>
          <div className="vp-agent-monitor-grid">
            {agents.map((a, i) => (
              <section className="vp-panel vp-agent-monitor-card" key={a.name}>
                <div>
                  <Sailboat size={24} />
                  <AdminBadge>
                    {state.aiEnabled ? "Available" : "Paused"}
                  </AdminBadge>
                </div>
                <h2>{a.name}</h2>
                <p>{a.purpose}</p>
                <small>{a.sources}</small>
                <button className="vp-link" onClick={() => setTrace(i)}>
                  Inspect sample trace
                  <ArrowRight size={14} />
                </button>
              </section>
            ))}
          </div>
          {trace !== null && (
            <AdminDialog
              title={`${agents[trace].name} · sample trace`}
              onClose={() => setTrace(null)}
            >
              <p className="vp-admin-dialog-copy">
                Scripted demonstration trace. No live request or private party
                source is loaded.
              </p>
              <dl className="vp-admin-review">
                <div>
                  <dt>Logical role</dt>
                  <dd>{agents[trace].name}</dd>
                </div>
                <div>
                  <dt>Purpose</dt>
                  <dd>{agents[trace].purpose}</dd>
                </div>
                <div>
                  <dt>Allowed sources</dt>
                  <dd>{agents[trace].sources}</dd>
                </div>
                <div>
                  <dt>Model mode</dt>
                  <dd>Scripted fixture</dd>
                </div>
                <div>
                  <dt>Human decision</dt>
                  <dd>Required before any payment or case action</dd>
                </div>
              </dl>
              <ol className="vp-admin-trace">
                <li>Check the requested purpose and permitted source scope.</li>
                <li>
                  Organize relevant records and identify missing evidence.
                </li>
                <li>
                  Return a supported next step, uncertainty, and citations.
                </li>
                <li>Wait for the person’s explicit approval.</li>
              </ol>
              <button className="vp-secondary" onClick={() => setTrace(null)}>
                Close
              </button>
            </AdminDialog>
          )}
          <Confirm value={confirmation} close={() => setConfirmation(null)} />
        </>
      )}
    </div>
  );
}
const permissionMatrix = [
  [
    "Purchases & history",
    "Own records",
    "Own merchant receipts",
    "Monitoring scope",
  ],
  [
    "Product catalogue",
    "Read published",
    "Manage own merchant",
    "No implicit edit",
  ],
  [
    "Private case drafts",
    "Own buyer position",
    "Own merchant position",
    "No default access",
  ],
  [
    "Financial action",
    "Own consent",
    "Merchant consent + capability",
    "No blanket authority",
  ],
  ["Merchant approval", "No", "Application only", "merchants.manage"],
  ["Role changes", "No", "No global grants", "roles.manage + step-up"],
];
function StaffAssignment() {
  const { state } = useAdminPreview();
  const [selected, setSelected] = useState(state.permissions);
  const [review, setReview] = useState(false);
  return (
    <Panel title="Internal staff assignment">
      <p className="vp-section-description">
        Nadia Rahma · Read-only auditor demo. Your own permissions cannot be
        edited here.
      </p>
      <div className="vp-permission-grid">
        {staffPermissions.map((p) => (
          <label className="vp-consent-label" key={p}>
            <input
              type="checkbox"
              checked={selected.includes(p)}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked ? [...v, p] : v.filter((x) => x !== p),
                )
              }
            />
            {p}
          </label>
        ))}
      </div>
      <button className="vp-button" onClick={() => setReview(true)}>
        Review changes
        <ArrowRight size={14} />
      </button>
      {review && (
        <AdminConfirm
          title="Update staff permissions"
          description={`Review the exact read-only grants: ${selected.join(", ") || "No permissions"}. This changes the local preview only.`}
          target="Nadia Rahma · Read-only auditor"
          action={{ kind: "permissions", permissions: selected }}
          onClose={() => setReview(false)}
        />
      )}
    </Panel>
  );
}
export function AdminRoles() {
  const { enabled } = useAdminPreview();
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="Roles & permissions"
        description="Grant a specific responsibility. Never an unrestricted workspace by default."
      />
      <Panel title="Permission matrix">
        <p className="vp-section-description">
          Every permission also requires resource ownership or an approved
          administrative scope.
        </p>
        <AdminTable
          headers={["Capability", "Customer", "Seller", "Administrator"]}
        >
          {permissionMatrix.map((row) => (
            <tr key={row[0]}>
              {row.map((v) => (
                <td key={v}>{v}</td>
              ))}
            </tr>
          ))}
        </AdminTable>
      </Panel>
      {enabled ? <StaffAssignment /> : <PreviewUnavailable />}
    </div>
  );
}
export function AdminAnalytics() {
  const { state, enabled } = useAdminPreview();
  const counts = ["Pending", "Approved", "Rejected"].map((status) => ({
    status,
    count: state.merchants.filter((m) => m.status === status).length,
  }));
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="Operational reporting"
        description="A transparent view of the demonstration dataset."
        action={
          enabled && (
            <ExportButton
              label="Export report"
              onClick={() =>
                exportCsv(
                  "velapal-demo-report.csv",
                  ["Metric", "Count"],
                  [
                    ["Accounts", state.users.length],
                    ["Audit events", state.audit.length],
                    ...counts.map((c) => [`${c.status} merchants`, c.count]),
                  ],
                )
              }
            />
          )
        }
      />
      {!enabled ? (
        <PreviewUnavailable />
      ) : (
        <>
          <div className="vp-metrics-grid vp-case-metrics">
            <StatCard
              label="Accounts"
              value={String(state.users.length)}
              description="Seed + demo registrations"
              icon={Users}
              href="/workspace/admin/users"
            />
            <StatCard
              label="Approved merchants"
              value={String(counts[1].count)}
              description="VelaPal business approval"
              icon={Store}
              href="/workspace/admin/merchants"
            />
            <StatCard
              label="Audit events"
              value={String(state.audit.length)}
              description="Current browser session data"
              icon={Activity}
              href="/workspace/admin/audit"
            />
          </div>
          <Panel title="Merchant application funnel">
            <p className="vp-section-description">
              Snapshot counts, not conversion rates.
            </p>
            <div className="vp-merchant-funnel">
              {counts.map((c) => (
                <div key={c.status}>
                  <span>{c.status}</span>
                  <div>
                    <i
                      style={{
                        width: `${(c.count / Math.max(state.merchants.length, 1)) * 100}%`,
                      }}
                    />
                  </div>
                  <strong>{c.count}</strong>
                </div>
              ))}
            </div>
          </Panel>
          <AdminNotice>
            Latency, uptime, fraud rates, and AI accuracy cannot be inferred
            from a UI prototype. Production reports require real telemetry and
            defined measurement periods.
          </AdminNotice>
        </>
      )}
    </div>
  );
}
export function AdminSettings() {
  const { state, enabled, reset } = useAdminPreview();
  const { session, logout } = useSession();
  const action = useAction();
  const [dialog, setDialog] = useState<"invite" | "reset" | "expired" | null>(
    null,
  );
  const [email, setEmail] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="Administrative settings"
        description="Keep access deliberate and sensitive changes traceable."
      />
      <div className="vp-settings-grid">
        <Panel title="Internal administrator invitations">
          <p className="vp-section-description">
            No public admin signup. Invitees must verify the invitation and
            enroll MFA.
          </p>
          <button
            className="vp-button"
            disabled={!enabled}
            onClick={() => setDialog("invite")}
          >
            Preview internal invitation
            <ArrowRight size={14} />
          </button>
          {state.invitations.length > 0 && enabled && (
            <p className="vp-form-note">
              {state.invitations.length} local invitation preview(s). No email
              sent.
            </p>
          )}
        </Panel>
        <Panel title="Security policy">
          <p className="vp-section-description">
            Implementation targets; these controls are not enforced by this
            frontend preview.
          </p>
          <dl className="vp-admin-review">
            {[
              ["Admin MFA", "Required"],
              ["Admin idle timeout", "15 minutes · proposed"],
              ["Password reset token", "15 minutes · single use"],
              ["Merchant approval", "Manual review + reason"],
              ["Financial executor", "Consent + capability + reconciliation"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>
      </div>
      <Panel title="Account & security">
        <p className="vp-section-description">
          Your VelaPal identity is separate from PayPal authorization.
        </p>
        <dl className="vp-admin-review">
          {[
            ["Account", session?.user.email ?? ""],
            ["Granted workspaces", session?.activeWorkspace.role ?? ""],
            ["MFA", enabled ? "Verified · demo" : "Verified session"],
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
            onClick={() =>
              setConfirmation({
                title: "Revoke sample session",
                description:
                  "Revoke the fictional mobile session in this preview. Your current session remains active.",
                target: "Mobile browser · fixture",
                action: { kind: "revoke-session" },
              })
            }
          >
            Revoke other session
          </button>
          <button
            className="vp-secondary"
            disabled={!enabled}
            onClick={() => setDialog("expired")}
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
              Resetting removes browser-local Admin preview changes. It does not
              change any real account or existing API dispute records.
            </p>
            <button className="vp-secondary" onClick={() => setDialog("reset")}>
              Reset prototype records
            </button>
          </details>
        )}
      </Panel>
      {dialog === "invite" && (
        <AdminDialog
          title="Internal administrator invitation"
          onClose={() => setDialog(null)}
        >
          <p className="vp-admin-dialog-copy">
            Preview an invitation for internal staff. No email or account is
            created.
          </p>
          <form
            className="vp-auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              setDialog(null);
              setConfirmation({
                title: "Record invitation preview",
                description:
                  "Record a local invitation preview. Production invitees must verify their invitation and enroll MFA before access.",
                target: email,
                action: { kind: "invite", email },
              });
            }}
          >
            <label className="vp-label">
              Staff email
              <input
                className="vp-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.test"
              />
            </label>
            <label className="vp-label">
              Initial responsibility
              <select className="vp-input" disabled>
                <option>Read-only auditor</option>
              </select>
            </label>
            <button className="vp-button">
              Review invitation
              <ArrowRight size={14} />
            </button>
          </form>
        </AdminDialog>
      )}
      {dialog === "reset" && (
        <AdminDialog
          title="Reset prototype records"
          onClose={() => setDialog(null)}
        >
          <p className="vp-admin-dialog-copy">
            This clears local Admin preview changes, including review decisions
            and the local demo audit trail. Existing API disputes and sessions
            are preserved.
          </p>
          <div className="vp-intake-actions">
            <button className="vp-secondary" onClick={() => setDialog(null)}>
              Go back
            </button>
            <button
              className="vp-button"
              onClick={() => {
                reset();
                setDialog(null);
              }}
            >
              Reset local preview
            </button>
          </div>
        </AdminDialog>
      )}
      {dialog === "expired" && (
        <AdminDialog
          title="Your session has expired."
          onClose={() => setDialog(null)}
        >
          <p className="vp-admin-dialog-copy">
            This is the session-expiry preview. Sign in again to recover access.
            Your current session stays active until you choose to sign out.
          </p>
          <button
            className="vp-button"
            onClick={() => void action.run(logout, "")}
          >
            Sign in again
          </button>
        </AdminDialog>
      )}
      <Confirm value={confirmation} close={() => setConfirmation(null)} />
    </div>
  );
}
export function AdminOverview({
  caseCount,
  reviewCaseId,
}: {
  caseCount: number;
  reviewCaseId?: string;
}) {
  const { state } = useAdminPreview();
  const pending = state.merchants.find((m) => m.status === "Pending");
  return (
    <>
      <div className="vp-metrics-grid">
        <StatCard
          label="Active accounts"
          value={String(
            state.users.filter((u) => u.status === "Active").length,
          ).padStart(2, "0")}
          description="Seeded and demo registrations"
          icon={Users}
          href="/workspace/admin/users"
        />
        <StatCard
          label="Merchant reviews"
          value={String(
            state.merchants.filter((m) => m.status === "Pending").length,
          ).padStart(2, "0")}
          description="Applications awaiting review"
          icon={Store}
          href="/workspace/admin/merchants"
        />
        <StatCard
          label="Open disputes"
          value={String(caseCount).padStart(2, "0")}
          description="Shared case monitoring"
          icon={Scale}
          href="/workspace/admin"
        />
        <StatCard
          label="AI service"
          value={state.aiEnabled ? "Enabled" : "Paused"}
          description="Demo control, no live model"
          icon={Activity}
          href="/workspace/admin/ai"
        />
      </div>
      <div className="vp-admin-grid">
        <Panel title="Review queue">
          <p className="vp-section-description">
            No automatic approvals. Every change has an owner.
          </p>
          {pending && (
            <div className="vp-admin-overview-review">
              <div>
                <h3>{pending.name}</h3>
                <p>{pending.category} · Business verification pending</p>
              </div>
              <Link className="vp-secondary" href="/workspace/admin/merchants">
                Review
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
          {reviewCaseId ? (
            <div className="vp-admin-overview-review">
              <div>
                <h3>{reviewCaseId}</h3>
                <p>
                  Monitor the case; assigned supervisors review gated actions.
                </p>
              </div>
              <Link
                className="vp-secondary"
                href={`/workspace/admin/${reviewCaseId}`}
              >
                Monitor case
                <ArrowRight size={14} />
              </Link>
            </div>
          ) : (
            <p className="vp-empty-note">No cases require review.</p>
          )}
        </Panel>
        <Panel title="Operational boundaries">
          <div className="vp-operational-boundaries">
            {[
              [
                "Scoped access",
                "Operational visibility is not ownership of a customer’s funds or private evidence.",
              ],
              [
                "Explicit approval",
                "Sensitive decisions require a reason, step-up verification, and an audit event.",
              ],
              [
                "Provider reconciliation",
                "Unknown payment outcomes are held for verification, never retried blindly.",
              ],
            ].map(([k, v], i) => (
              <div key={k}>
                {i === 0 ? (
                  <ShieldCheck />
                ) : i === 1 ? (
                  <LockKeyhole />
                ) : (
                  <RefreshCw />
                )}
                <div>
                  <strong>{k}</strong>
                  <p>{v}</p>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
export function AdminAuditPage() {
  const { session } = useSession();
  const { state, enabled } = useAdminPreview();
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("All");
  const events = useSWR(
    session?.activeWorkspace.type === "ADMIN"
      ? [session.activeWorkspace.id, "audit"]
      : null,
    () => adminService.auditEvents(),
    { refreshInterval: 5000 },
  );
  const rows = [
    ...(enabled ? state.audit : []),
    ...(events.data?.items ?? []).map((e) => ({
      id: e.auditId,
      at: e.createdAt ?? "",
      actor: e.actorId ?? "Unknown actor",
      role: (e.actorId ?? "").startsWith("usr_admin") ? "admin" : "system",
      action: e.eventName ?? "Unknown event",
      target: e.targetId ?? "Unknown target",
      reason: e.reason ?? "No reason supplied",
    })),
  ]
    .filter(
      (e) =>
        (role === "All" || role === e.role) &&
        `${e.action} ${e.actor} ${e.target} ${e.reason}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title="Audit logs & security"
        description="Who did what, to which record, and why."
        action={
          <ExportButton
            label="Export audit"
            onClick={() =>
              exportCsv(
                "velapal-audit.csv",
                [
                  "Time UTC",
                  "Reference",
                  "Actor",
                  "Role",
                  "Action",
                  "Target",
                  "Reason",
                ],
                rows.map((e) => [
                  e.at,
                  e.id,
                  e.actor,
                  e.role,
                  e.action,
                  e.target,
                  e.reason,
                ]),
              )
            }
          />
        }
      />
      <div className="vp-admin-filters">
        <AdminSearch
          label="Search action, actor or target…"
          value={query}
          onChange={setQuery}
        />
        <select
          className="vp-input"
          aria-label="Audit role"
          value={role}
          onChange={(e) => setRole(e.target.value)}
        >
          {["All", "admin", "seller", "user", "system"].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </div>
      <ErrorNotice error={events.error} />
      {events.isLoading && <p role="status">Loading audit events...</p>}
      <AdminTable
        headers={["Time / reference", "Actor", "Action", "Target", "Reason"]}
      >
        {rows.map((e) => (
          <tr key={e.id}>
            <td>
              {formatDate(e.at)} UTC<small>{e.id}</small>
            </td>
            <td>
              <strong>{e.actor}</strong>
              <small>{e.role}</small>
            </td>
            <td>{e.action}</td>
            <td>
              {e.target?.startsWith("case_") ? (
                <Link className="vp-link" href={`/workspace/admin/${e.target}`}>
                  {e.target}
                </Link>
              ) : (
                e.target
              )}
            </td>
            <td>{e.reason}</td>
          </tr>
        ))}
        {!events.isLoading && rows.length === 0 && (
          <tr>
            <td colSpan={5} className="vp-empty-note">
              No audit events match this view.
            </td>
          </tr>
        )}
      </AdminTable>
      <AdminNotice>
        The local demo log can be reset. Production requires append-only
        records, restricted access, and a defined retention policy.
      </AdminNotice>
    </div>
  );
}
export function RecentAdminPreviewActivity() {
  const { state, enabled } = useAdminPreview();
  const { session } = useSession();
  const events = useSWR(
    enabled ? [session?.activeWorkspace.id, "audit"] : null,
    () => adminService.auditEvents(),
    { refreshInterval: 5000 },
  );
  const rows = [
    ...state.audit,
    ...(events.data?.items ?? []).map((e) => ({
      id: e.auditId,
      at: e.createdAt ?? "",
      actor: e.actorId ?? "Unknown actor",
      action: e.eventName ?? "Unknown event",
      target: e.targetId ?? "Unknown target",
    })),
  ]
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .slice(0, 4);
  if (!enabled) return null;
  return (
    <section className="vp-panel vp-admin-recent-panel">
      <div className="vp-section-heading">
        <h2>Recent administrative activity</h2>
        <Link className="vp-link" href="/workspace/admin/audit">
          Open audit logs
          <ArrowRight size={14} />
        </Link>
      </div>
      <ErrorNotice error={events.error} />
      <ol className="vp-admin-recent-activity">
        {rows.map((e) => (
          <li key={e.id}>
            <span className="vp-admin-activity-icon">
              <Check size={13} />
            </span>
            <div>
              <strong>{e.action}</strong>
              <p>
                {e.actor} · {e.target}
              </p>
            </div>
            <time>{formatDate(e.at)} UTC</time>
          </li>
        ))}
      </ol>
    </section>
  );
}
