"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { AdminBadge, AdminNotice } from "./admin-ui";
import Link from "next/link";
import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { adminService } from "@/services/contracts/admin.service";
import {
  Panel,
  Badge,
  ErrorNotice,
  MfaStepUp,
  useAction,
} from "@/components/ui/workflow";
import Assessment from "@/features/disputes/assessment";
import { formatDate, formatMoney } from "@/lib/format";
import type { ApprovalRequest } from "@/services/contracts/types";

export function Approval({
  request: a,
  refresh,
}: {
  request: ApprovalRequest;
  refresh: () => Promise<unknown>;
}) {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("REJECTED");
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4 text-sm">
      <Link className="vp-link" href={`/workspace/admin/${a.caseId}`}>
        {a.caseId}
      </Link>
      <p>
        {a.scope} · {formatMoney(a.amountMinor, a.currency)} · Case v
        {a.caseVersion} · Proposal v{a.proposalVersion}
      </p>
      <p className="break-all text-xs">Binding: {a.paramsHash}</p>
      <label className="vp-label">
        Decision
        <select
          className="vp-input"
          value={decision}
          onChange={(e) => setDecision(e.target.value as typeof decision)}
        >
          <option>REJECTED</option>
          <option>APPROVED</option>
        </select>
      </label>
      <label className="vp-label">
        Decision reason
        <textarea
          className="vp-input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I reviewed the assigned shared investigation and this exact scope.
      </label>
      {confirmed && reason.trim().length >= 10 && (
        <MfaStepUp
          purpose="ADMIN_APPROVAL"
          targetId={a.approvalRequestId}
          onVerified={async (id) => {
            await adminService.decideApproval(
              a.approvalRequestId,
              a.proposalVersion,
              {
                decision,
                scope: a.scope,
                paramsHash: a.paramsHash,
                caseVersion: a.caseVersion,
                stepUpId: id,
                reason,
              },
            );
            await refresh();
          }}
        />
      )}
    </div>
  );
}
export function AdminInvestigation({ caseId }: { caseId: string }) {
  const { session } = useSession();
  const action = useAction();
  const [reason, setReason] = useState("");
  const [conflict, setConflict] = useState(false);
  const [intervention, setIntervention] = useState<
    | "PAUSE"
    | "RESUME"
    | "REQUEST_INVESTIGATION"
    | "ALLOW_VOLUNTARY_MEDIATION"
    | "SET_MANUAL"
    | "OFFICIAL_HANDOFF"
  >("ALLOW_VOLUNTARY_MEDIATION");
  const [confirmed, setConfirmed] = useState(false);
  const [tab, setTab] = useState("Overview");
  const detail = useSWR(
    session?.activeWorkspace.type === "ADMIN"
      ? [session.activeWorkspace.id, "admin-case", caseId]
      : null,
    () => adminService.detail(caseId),
    { refreshInterval: 5000 },
  );
  const caseEvents = useSWR(
    session?.activeWorkspace.type === "ADMIN" && tab === "Activity"
      ? [session.activeWorkspace.id, "case-audit", caseId]
      : null,
    () => adminService.auditEvents(caseId),
  );
  const approvals = useSWR(
    session?.activeWorkspace.type === "ADMIN" && tab === "Mediation"
      ? [session.activeWorkspace.id, "case-approvals", caseId]
      : null,
    () => adminService.approvalRequests(),
  );
  if (session?.activeWorkspace.type !== "ADMIN")
    return <p role="alert">Admin workspace access required.</p>;
  const d = detail.data;
  if (!d?.case)
    return (
      <div className="space-y-4">
        <ErrorNotice error={detail.error} />
        <p role="status">
          {detail.error
            ? "Investigation unavailable."
            : "Loading investigation..."}
        </p>
        <button className="vp-secondary" onClick={() => void detail.mutate()}>
          Retry
        </button>
      </div>
    );
  return (
    <div className="vp-admin-page vp-admin-investigation">
      <Link className="vp-back-link" href="/workspace/admin">
        <ArrowLeft size={14} />
        Dispute monitoring
      </Link>
      <header className="vp-page-heading">
        <div>
          <p className="vp-eyebrow">
            {caseId} / {d.case.initiatorParty ?? "SHARED"}-INITIATED / CASE V
            {d.case.caseVersion ?? "-"}
          </p>
          <h1 className="vp-case-category-title">
            {d?.case?.category
              ? d.case.category.replaceAll("_", " ").toLowerCase()
              : "Case investigation"}
          </h1>
          <p className="vp-admin-description">
            {d.case.transactionId ?? d.case.orderId ?? caseId}
          </p>
        </div>
        <button className="vp-secondary" onClick={() => void detail.mutate()}>
          <RefreshCw size={14} />
          Refresh investigation
        </button>
      </header>
      <ErrorNotice error={detail.error} />
      {action.feedback}
      {!d && !detail.error && <p role="status">Loading investigation...</p>}
      {d && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge>{d.case.stage}</Badge>
            <Badge>{d.case.control}</Badge>
            <Badge>Case v{d.case.caseVersion}</Badge>
            <Badge>Control v{d.case.controlVersion}</Badge>
          </div>
          {d.case.control === "WAITING_ADMIN" && (
            <div className="vp-admin-gate-banner">
              <ShieldCheck size={19} />
              <div>
                <strong>A supervisor needs to review this step</strong>
                <p>
                  Review shared evidence and uncertainty before authorizing a
                  specific next step.
                </p>
              </div>
              <AdminBadge>Needs human review</AdminBadge>
            </div>
          )}
          <div className="vp-investigation-grid">
            <div className="vp-investigation-main">
              <nav className="vp-case-tabs" aria-label="Investigation views">
                {["Overview", "Evidence", "Mediation", "Activity"].map((t) => (
                  <button
                    key={t}
                    aria-pressed={tab === t}
                    onClick={() => setTab(t)}
                  >
                    {t}
                    {t === "Evidence" && d.case.investigationAccessGranted
                      ? ` ${d.sharedSources?.length ?? 0}`
                      : ""}
                  </button>
                ))}
              </nav>
              {!d.case.investigationAccessGranted && tab !== "Activity" ? (
                <Panel title="Metadata-only access">
                  <p className="vp-section-description">
                    Assign an investigator before accessing shared sources.
                    Private party sources are never included.
                  </p>
                </Panel>
              ) : (
                <>
                  {tab === "Overview" && (
                    <>
                      <Panel title="Two perspectives. One case.">
                        <p className="vp-section-description">
                          The reporting party does not receive a presumption of
                          correctness.
                        </p>
                        <div className="vp-admin-perspectives">
                          {[
                            [
                              "Customer",
                              d.sharedPerspectives?.customerStatement,
                            ],
                            [
                              "Seller / Merchant",
                              d.sharedPerspectives?.sellerStatement,
                            ],
                          ].map(([party, statement]) => (
                            <div key={party}>
                              <span className="vp-avatar">
                                {party?.charAt(0)}
                              </span>
                              <strong>{party}</strong>
                              <p>
                                {statement ??
                                  "No shared statement has been supplied."}
                              </p>
                              <small>Party statement &middot; unverified</small>
                            </div>
                          ))}
                        </div>
                      </Panel>
                      <Panel title="What is known, and what is still open">
                        <div className="vp-admin-fact-list">
                          <article>
                            <span className="vp-eyebrow">LINKED RECORD</span>
                            <h3>A transaction or order is linked.</h3>
                            <p>
                              {d.case.transactionId ??
                                d.case.orderId ??
                                "No linked reference supplied."}{" "}
                              &middot; Provider verification is tracked
                              separately.
                            </p>
                          </article>
                          <article>
                            <span className="vp-eyebrow">PARTY CLAIMS</span>
                            <h3>Statements are not findings of fault.</h3>
                            <p>
                              Neither the first report nor a missing response
                              proves wrongdoing. File metadata does not
                              establish authenticity.
                            </p>
                          </article>
                          <article>
                            <span className="vp-eyebrow">NEEDS ATTENTION</span>
                            <h3>Material uncertainty stays visible.</h3>
                            <p>
                              Review the shared evidence and current case
                              context before changing workflow control.
                            </p>
                          </article>
                        </div>
                      </Panel>
                      <Panel title="Shared evidence investigation">
                        <p className="vp-section-description">
                          {d.sharedSources?.length ?? 0} shared source(s)
                          available to this assigned investigation. Private
                          party drafts remain private.
                        </p>
                        <button
                          className="vp-link"
                          onClick={() => setTab("Evidence")}
                        >
                          Review shared evidence
                          <ArrowRight size={14} />
                        </button>
                      </Panel>
                      <Panel title="Suggested next step">
                        <p className="vp-section-description">
                          Hold any gated action. An assigned investigator should
                          assess uncertainty and authorize only the next
                          appropriate step.
                        </p>
                        <button
                          className="vp-secondary"
                          onClick={() => setTab("Mediation")}
                        >
                          Open mediation
                          <ArrowRight size={14} />
                        </button>
                      </Panel>
                    </>
                  )}
                  {tab === "Evidence" && (
                    <Panel title="Shared evidence investigation">
                      <p className="vp-section-description">
                        Only shared, authorized sources returned for this
                        investigation are shown.
                      </p>
                      <ul className="vp-admin-source-list">
                        {d.sharedSources?.map((source) => (
                          <li
                            id={`source-${source.sourceId}`}
                            key={source.sourceId}
                          >
                            <FileText size={21} />
                            <div>
                              <strong>{source.originalName}</strong>
                              <p>
                                {source.sourceId} &middot; v
                                {source.sourceVersion} &middot; {source.locator}
                              </p>
                              <small>
                                {source.ownerParty} &middot; {source.scanState}
                              </small>
                            </div>
                            <Badge>{source.audience}</Badge>
                          </li>
                        ))}
                      </ul>
                      {!d.sharedSources?.length && (
                        <p className="vp-empty-note">
                          No shared evidence is available.
                        </p>
                      )}
                    </Panel>
                  )}
                  {tab === "Mediation" && (
                    <>
                      <Panel title="Shared assessment">
                        {d.latestAssessment ? (
                          <Assessment assessment={d.latestAssessment} />
                        ) : (
                          <p className="vp-section-description">
                            No shared assessment has been returned for this
                            case.
                          </p>
                        )}
                      </Panel>
                      <Panel title="Scoped approval requests">
                        <ErrorNotice error={approvals.error} />
                        {approvals.isLoading && (
                          <p role="status">Loading approval requests...</p>
                        )}
                        {approvals.data?.items
                          ?.filter((a) => a.caseId === caseId)
                          ?.map((a) => (
                            <Approval
                              key={a.approvalRequestId}
                              request={a}
                              refresh={() => approvals.mutate()}
                            />
                          ))}
                        {approvals.data?.items?.length === 0 && (
                          <p className="vp-section-description">
                            No pending approval requests for this case.
                          </p>
                          )}
                      </Panel>
                      <AdminNotice>
                        Supervisor intervention does not replace either
                        party&apos;s consent or authorize an arbitrary payment.
                      </AdminNotice>
                    </>
                  )}
                  {tab === "Activity" && (
                    <Panel title="Case activity">
                      <ErrorNotice error={caseEvents.error} />
                      {caseEvents.isLoading && (
                        <p role="status">Loading case activity...</p>
                      )}
                      <ol className="vp-admin-case-activity">
                        {caseEvents.data?.items?.map((e) => (
                          <li key={e.auditId}>
                            <strong>{e.eventName}</strong>
                            <p>{e.reason}</p>
                            <small>
                              {e.actorId} &middot; {formatDate(e.createdAt)} UTC
                            </small>
                          </li>
                        ))}
                      </ol>
                      {caseEvents.data?.items?.length === 0 && (
                        <p className="vp-empty-note">
                          No administrative activity recorded for this case.
                        </p>
                      )}
                    </Panel>
                  )}
                </>
              )}
            </div>
            <aside className="vp-investigation-aside">
              <Panel title="Investigator assignment">
                <p className="mb-4 text-sm">
                  Assigned reviewer: {d.case.assignedReviewerId ?? "None"}.
                  Admin assignment grants access to shared evidence; private
                  drafts remain private.
                </p>
                <form
                  className="space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.run(async () => {
                      await adminService.assign(
                        caseId,
                        session!.user.id,
                        reason,
                      );
                      await detail.mutate();
                    }, "Investigator assignment recorded.");
                  }}
                >
                  <label className="vp-label">
                    Assignment / intervention reason
                    <textarea
                      className="vp-input"
                      required
                      minLength={10}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      required
                      checked={conflict}
                      onChange={(e) => setConflict(e.target.checked)}
                    />
                    I declare no conflict of interest in this case.
                  </label>
                  <button
                    className="vp-button"
                    disabled={action.busy || !conflict}
                  >
                    Assign myself
                  </button>
                </form>
              </Panel>
              {d.case.investigationAccessGranted && (
                <Panel title="Workflow intervention">
                  <p className="mb-4 text-sm text-slate-600">
                    Decisions change workflow control. They do not replace
                    either party’s consent or prove a provider result.
                  </p>
                  <label className="vp-label">
                    Intervention action
                    <select
                      className="vp-input"
                      value={intervention}
                      onChange={(e) => {
                        setIntervention(e.target.value as typeof intervention);
                        setConfirmed(false);
                      }}
                    >
                      {[
                        "ALLOW_VOLUNTARY_MEDIATION",
                        "REQUEST_INVESTIGATION",
                        "PAUSE",
                        "RESUME",
                        "SET_MANUAL",
                        "OFFICIAL_HANDOFF",
                      ].map((x) => (
                        <option key={x} value={x}>
                          {{
                            ALLOW_VOLUNTARY_MEDIATION: "Approve mediation step",
                            REQUEST_INVESTIGATION: "Request more investigation",
                            PAUSE: "Pause workflow",
                            RESUME: "Resume workflow",
                            SET_MANUAL: "Transfer to manual handling",
                            OFFICIAL_HANDOFF: "Prepare official handoff",
                          }[x] ?? x}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="my-4 flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Confirm {intervention} at control v{d.case.controlVersion},
                    with the reason entered above.
                  </label>
                  {confirmed && reason.trim().length >= 10 ? (
                    <MfaStepUp
                      key={`${intervention}:${d.case.controlVersion}`}
                      purpose="ADMIN_INTERVENTION"
                      targetId={caseId}
                      onVerified={async (id) => {
                        await adminService.intervene(
                          caseId,
                          d.case.controlVersion,
                          intervention,
                          reason,
                          id,
                        );
                        setConfirmed(false);
                        await detail.mutate();
                      }}
                    />
                  ) : (
                    <p className="text-sm text-slate-500">
                      Enter a reason of at least 10 characters and confirm the
                      scoped action to start MFA.
                    </p>
                  )}
                </Panel>
              )}
              <Panel title="Case details">
                <dl className="vp-admin-review">
                  {[
                    ["Initiated by", d.case.initiatorParty],
                    [
                      "Category",
                      d?.case?.category
                        ? d.case.category.replaceAll("_", " ").toLowerCase()
                        : "-",
                    ],
                    [
                      "Assigned reviewer",
                      d.case.assignedReviewerId ?? "Unassigned",
                    ],
                    [
                      "PayPal status",
                      d.case.officialPaypalDisputeId ??
                        "Not linked - internal VelaPal case",
                    ],
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt>{k}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
                </dl>
                <p className="vp-form-note">
                  Private drafts remain private. AI does not decide guilt or
                  move money. Provider results are tracked separately.
                </p>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
export function AuditEvents({ compact = false }: { compact?: boolean }) {
  const { session } = useSession();
  const events = useSWR(
    session?.activeWorkspace.type === "ADMIN"
      ? [session.activeWorkspace.id, "audit"]
      : null,
    () => adminService.auditEvents(),
    { refreshInterval: 5000 },
  );
  if (session?.activeWorkspace.type !== "ADMIN")
    return <p role="alert">Admin workspace access required.</p>;
  return (
    <Panel title={compact ? "Recent administrative activity" : "Audit events"}>
      <ErrorNotice error={events.error} />
      {events.isLoading && <p role="status">Loading audit events…</p>}
      <ol className="space-y-4">
        {events.data?.items?.map((e) => (
          <li
            key={e.auditId}
            className="space-y-2 rounded-xl border border-slate-200 p-4 text-sm"
          >
            <p className="font-medium">{e.eventName}</p>
            <p>{e.reason}</p>
            <Link
              className="vp-link break-all"
              href={`/workspace/admin/${e.targetId}`}
            >
              {e.targetId}
            </Link>
            <p className="break-all text-xs text-slate-500">
              {e.actorId} · Case v{e.caseVersion} · Control v{e.controlVersion}{" "}
              · {formatDate(e.createdAt)} UTC · {e.traceId}
            </p>
          </li>
        ))}
      </ol>
      {events.data?.items?.length === 0 && (
        <p className="text-sm">No audit events recorded yet.</p>
      )}
    </Panel>
  );
}
