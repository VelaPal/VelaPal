"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  Scale,
  ShieldCheck,
  ClipboardCheck,
  Search,
  RefreshCw,
} from "lucide-react";
import { useSession } from "@/features/auth/session";
import { adminService } from "@/services/contracts/admin.service";
import { ErrorNotice, Panel } from "@/components/ui/workflow";
import StatCard from "@/components/ui/stat-card";
import { AdminHeading, AdminBadge } from "./admin-ui";
import { AdminOverview, RecentAdminPreviewActivity } from "./admin-pages";
import { useAdminPreview } from "./use-admin-preview";
import { Approval } from "./admin-investigation";
const stageLabels: Record<string, string> = {
  AWAITING_EVIDENCE: "Waiting for evidence",
  MEDIATING: "In mediation",
  AWAITING_CONSENT: "Awaiting approval",
  EXECUTION_PENDING: "Action pending",
  EXECUTION_UNKNOWN: "Action needs reconciliation",
  EXTERNAL_PENDING: "Waiting for provider",
  RESOLVED: "Resolved",
  CLOSED_NO_AGREEMENT: "Closed without agreement",
};
export function AdminQueue({ overview = false }: { overview?: boolean }) {
  const { session } = useSession();
  const { enabled } = useAdminPreview();
  const [filter, setFilter] = useState("All cases");
  const [mine, setMine] = useState(false);
  const [query, setQuery] = useState("");
  const queue = useSWR(
    session?.activeWorkspace.type === "ADMIN"
      ? [session.activeWorkspace.id, "admin-queue", "ALL", mine]
      : null,
    () => adminService.disputes("ALL", mine),
    { refreshInterval: 5000 },
  );
  const approvals = useSWR(
    session?.activeWorkspace.type === "ADMIN"
      ? [session.activeWorkspace.id, "approvals"]
      : null,
    () => adminService.approvalRequests(),
  );
  if (session?.activeWorkspace.type !== "ADMIN")
    return <p role="alert">Admin workspace access required.</p>;
  const all = queue.data?.items ?? [];
  const closed = (s: string) => ["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(s);
  const visible = all.filter(
    (c) =>
      (filter === "All cases" ||
        (filter === "Needs review" && c.control === "WAITING_ADMIN") ||
        (filter === "Manual handling" &&
          ["MANUAL", "PAUSED"].includes(c.control)) ||
        (filter === "Closed" && closed(c.stage)) ||
        (filter === "Approval requests" &&
          approvals.data?.items?.some((a) => a.caseId === c.id))) &&
      [c.id, c.transactionId, c.merchantId, c.gateReason]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="vp-admin-page">
      <AdminHeading
        title={
          overview
            ? "A clear view of operations."
            : "A clear view. A careful intervention."
        }
        description={
          overview
            ? "Prioritize the decisions that need a human, with a record of every action."
            : "Monitor every case. Step in when evidence, risk, or a requested action needs human judgment."
        }
        action={
          <span className="vp-admin-governance">
            <ShieldCheck size={14} />
            {overview ? "MFA verified" : "Human-governed"}
            {enabled ? " · demo" : ""}
          </span>
        }
      />
      <ErrorNotice error={queue.error} />
      {queue.isLoading && <p role="status">Loading queue...</p>}
      {overview && enabled ? (
        <>
          <AdminOverview
            caseCount={all.filter((c) => !closed(c.stage)).length}
            reviewCaseId={
              all.find((c) => c.control === "WAITING_ADMIN")?.id ??
              all[0]?.id
            }
          />
          <RecentAdminPreviewActivity />
        </>
      ) : (
        <>
          <div className="vp-metrics-grid vp-case-metrics">
            <StatCard
              label="Open cases"
              value={String(
                all.filter((c) => !closed(c.stage)).length,
              ).padStart(2, "0")}
              description="Both parties, one shared record"
              icon={Scale}
            />
            <StatCard
              label="Needs review"
              value={String(
                all.filter((c) => c.control === "WAITING_ADMIN").length,
              ).padStart(2, "0")}
              description="Only exceptions need your attention"
              icon={ShieldCheck}
            />
            <StatCard
              label="Approval requests"
              value={
                approvals.data
                  ? String(approvals.data.items?.length ?? 0).padStart(2, "0")
                  : "—"
              }
              description="Specific actions, bounded permission"
              icon={ClipboardCheck}
            />
          </div>
          <section className="vp-case-list">
            <div className="vp-case-toolbar">
              <nav className="vp-case-tabs" aria-label="Admin dispute filters">
                {[
                  "All cases",
                  "Needs review",
                  "Approval requests",
                  "Manual handling",
                  "Closed",
                ].map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={t === filter}
                    onClick={() => setFilter(t)}
                  >
                    {t}
                  </button>
                ))}
              </nav>
              <label className="vp-case-search">
                <Search size={15} />
                <input
                  aria-label="Search cases"
                  placeholder="Search case or transaction"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
            </div>
            <div className="vp-admin-queue-options">
              <label className="vp-consent-label">
                <input
                  type="checkbox"
                  checked={mine}
                  onChange={(e) => setMine(e.target.checked)}
                />
                Assigned to me
              </label>
              <button className="vp-link" onClick={() => void queue.mutate()}>
                <RefreshCw size={13} />
                Refresh queue
              </button>
            </div>
            {visible.map((c) => (
              <Link
                className="vp-case-list-row"
                key={c.id}
                href={`/workspace/admin/${c.id}`}
              >
                <span
                  className={`vp-case-row-icon ${c.control === "WAITING_ADMIN" ? "needs-review" : ""}`}
                >
                  <Scale size={20} />
                </span>
                <div>
                  <p className="vp-case-list-kicker">
                    {c.id} · {c.initiatorParty} REPORT
                  </p>
                  <h2>
                    {c.gateReason
                      ? "Evidence conflict needs review"
                      : (stageLabels[c.stage] ?? "Shared case monitoring")}
                  </h2>
                  <p className="vp-case-list-meta">
                    {c.transactionId ?? "Order case"} · {c.merchantId}
                  </p>
                </div>
                <div className="vp-case-list-status">
                  <AdminBadge>
                    {c.control === "WAITING_ADMIN"
                      ? "Needs human review"
                      : (stageLabels[c.stage] ?? c.stage)}
                  </AdminBadge>
                  <span className="vp-case-list-meta">
                    {c.assignedReviewerId === session.user.id
                      ? "Assigned to you"
                      : c.assignedReviewerId
                        ? "Reviewer assigned"
                        : "Unassigned"}
                  </span>
                </div>
                <ArrowRight size={16} />
              </Link>
            ))}
            {queue.data && visible.length === 0 && (
              <p className="vp-empty-note">No cases match this view.</p>
            )}
            <p className="vp-table-footer">
              <ShieldCheck size={12} />
              Monitoring access does not grant access to private party evidence.
            </p>
          </section>
          {filter === "Approval requests" && (
            <Panel title="Approval requests">
              <ErrorNotice error={approvals.error} />
              {approvals.isLoading && <p role="status">Loading approvals...</p>}
              {approvals.data?.items?.length === 0 && (
                <p className="vp-empty-note">No pending approval requests.</p>
              )}
              {approvals.data?.items?.map((a) => (
                <Approval
                  key={a.approvalRequestId}
                  request={a}
                  refresh={() => approvals.mutate()}
                />
              ))}
            </Panel>
          )}
          <div className="vp-case-principles">
            {[
              [
                "Observe before intervening.",
                "Case records, claims and provider results remain separate.",
              ],
              [
                "Review the exact scope.",
                "Assigned investigators assess shared evidence before approving a specific action.",
              ],
              [
                "Every decision has a record.",
                "A reason, verification and audit event keep sensitive changes accountable.",
              ],
            ].map(([title, copy], i) => (
              <div key={title}>
                <span>0{i + 1}</span>
                <h2>{title}</h2>
                <p>{copy}</p>
              </div>
            ))}
          </div>
          <Link className="vp-link" href="/workspace/admin/audit">
            View audit events
            <ArrowRight size={14} />
          </Link>
        </>
      )}
    </div>
  );
}
