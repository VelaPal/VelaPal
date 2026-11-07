"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useCase } from "./hooks";
import { useSession } from "@/features/auth/session";
import { disputesService } from "@/services/contracts/disputes.service";
import { agentService } from "@/services/contracts/agent.service";
import type { SettlementRoute, SourceRef } from "@/services/contracts/types";
import {
  Panel,
  Badge,
  ErrorNotice,
  MfaStepUp,
  useAction,
} from "@/components/ui/workflow";
import { Assistant } from "@/features/agent/assistant";
import Assessment from "./assessment";
import Evidence from "./evidence";
import OperationTracker from "./operation";
import OfficialHandoff from "./official-handoff";
import { formatMoney, formatDate } from "@/lib/format";

export default function CaseDetail({ caseId }: { caseId: string }) {
  const { session } = useSession();
  const result = useCase(caseId);
  const action = useAction();
  const [tab, setTab] = useState("Evidence");
  const [text, setText] = useState("");
  const [audience, setAudience] = useState<"PRIVATE" | "CASE_SHARED">(
    "PRIVATE",
  );
  const [refs, setRefs] = useState<string[]>([]);
  const [runId, setRunId] = useState("");
  const [reason, setReason] = useState("");
  const [terms, setTerms] = useState("");
  const [amount, setAmount] = useState("2000");
  const [route, setRoute] = useState<SettlementRoute>("PAYPAL_CAPTURE_REFUND");
  const [checked, setChecked] = useState(false);
  const [mediation, setMediation] = useState(false);
  const [mediationDecision, setMediationDecision] = useState<
    "APPROVED" | "REJECTED"
  >("APPROVED");
  const executionKey = useRef("");
  const poll = useSWR(
    runId
      ? [session?.activeWorkspace.id, "assessment-run", runId]
      : null,
    () => agentService.get(runId),
    {
      refreshInterval: (d) =>
        d && ["QUEUED", "RUNNING"].includes(d.status) ? 1500 : 0,
      onSuccess: (d) => {
        if (!["QUEUED", "RUNNING"].includes(d.status)) void result.mutate();
      },
    },
  );
  const [sourceFocus, setSourceFocus] = useState("");
  useEffect(() => {
    if (tab === "Evidence" && sourceFocus) {
      document
        .getElementById(`source-${sourceFocus}`)
        ?.scrollIntoView({ block: "center" });
    }
  }, [tab, sourceFocus]);
  const d = result.data;
  const c = d?.case;
  const p = d?.activeProposal;
  const party = session?.activeWorkspace.type;
  if (party === "ADMIN")
    return (
      <Link className="vp-link" href={`/workspace/admin/${caseId}`}>
        Open assigned investigation
      </Link>
    );
  if (!d || !c)
    return (
      <div className="space-y-4">
        <ErrorNotice error={result.error} />
        <p role="status">
          {result.error ? "Case unavailable." : "Loading case…"}
        </p>
        <button className="vp-secondary" onClick={() => void result.mutate()}>
          Retry
        </button>
      </div>
    );
  const bindings =
    process.env.NEXT_PUBLIC_API_MODE !== "api"
      ? d.mockConsentBindings
      : undefined;
  const refresh = () => result.mutate();
  const assessment = d.latestAssessment;
  const stale =
    assessment?.status === "STALE" ||
    (assessment && assessment.inputVersion !== c.caseVersion);
  async function consent(
    intent: "ACCEPT_PROPOSAL_TERMS" | "AUTHORIZE_FINANCIAL_EXECUTION",
    decision: "APPROVED" | "REJECTED",
    stepUpId: string | null = null,
  ) {
    if (!p || !checked)
      throw new Error("Review and acknowledge the exact terms");
    await disputesService.grantConsent(p.actionRequestId, p.proposalVersion, {
      paramsHash: p.paramsHash,
      caseVersion: c!.caseVersion,
      intent,
      decision,
      stepUpId,
    });
    await refresh();
  }
  return (
    <div className="space-y-6">
      <Link href="/workspace/cases" className="vp-link">
        Back to cases
      </Link>
      <header className="space-y-3">
        <p className="text-xs tracking-widest text-slate-500">
          SHARED RESOLUTION CASE
        </p>
        <h1 className="break-all text-2xl font-semibold">{caseId}</h1>
        <p className="text-sm text-slate-600">
          {c.category.replaceAll("_", " ")} · Opened by {c.initiatorParty}
        </p>
        <div className="flex flex-wrap gap-2">
          <Badge>Stage: {c.stage}</Badge>
          <Badge>Control: {c.control}</Badge>
          <Badge>Provider: {d.providerOperation.status}</Badge>
        </div>
        <p className="text-sm">
          Next step: {c.nextAction.replaceAll("_", " ")}
        </p>
        <p className="text-xs text-slate-500">
          Case v{c.caseVersion} · Your private context v
          {c.privateContextVersion} · Control v{c.controlVersion} · Access
          revision {c.accessRevision}
        </p>
        <button
          className="vp-secondary"
          disabled={result.isValidating}
          onClick={() => void refresh()}
        >
          Refresh latest case
        </button>
      </header>
      <ErrorNotice error={result.error} />
      {action.feedback}
      <nav aria-label="Case sections" className="vp-case-tabs">
        {[
          "Evidence",
          "Discussion",
          "AI assessment",
          "Mediation & consent",
          "Private preparation",
          "Timeline",
        ].map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === "Evidence" && (
        <>
          <Panel title="Both perspectives">
            <div className="grid gap-5 md:grid-cols-2">
              <div>
                <h3 className="font-medium">Customer statement</h3>
                <p className="mt-2 text-sm">
                  {d.perspectives.customerStatement ?? "Awaiting statement"}
                </p>
              </div>
              <div>
                <h3 className="font-medium">Seller statement</h3>
                <p className="mt-2 text-sm">
                  {d.perspectives.sellerStatement ?? "Awaiting statement"}
                </p>
              </div>
            </div>
          </Panel>
          <Panel title="Evidence & access">
            <Evidence
              sources={d.sources}
              caseId={caseId}
              refresh={refresh}
              canUpload={c.capabilities.canShareEvidence}
            />
          </Panel>
        </>
      )}
      {tab === "Discussion" && (
        <Panel title="Statements and private notes">
          <ul className="mb-6 space-y-3">
            {d.messages?.map((m) => (
              <li
                key={m.messageId}
                className="rounded-xl bg-slate-50 p-4 text-sm"
              >
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge>{m.authorParty}</Badge>
                  <Badge>{m.audience}</Badge>
                </div>
                <p className="whitespace-pre-wrap break-words">{m.text}</p>
                {m.sourceRefs?.map((r) => (
                  <p key={r.sourceId} className="mt-2 break-all text-xs">
                    {r.sourceId} · v{r.version} · {r.locator}
                  </p>
                ))}
              </li>
            ))}
          </ul>
          {!d.messages?.length && (
            <p className="mb-4 text-sm text-slate-500">
              No messages visible to your party yet.
            </p>
          )}
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                const sourceRefs: SourceRef[] = d.sources
                  .filter((s) => refs.includes(s.sourceId))
                  .map((s) => ({
                    sourceId: s.sourceId,
                    version: s.sourceVersion,
                    locator: s.locator ?? "",
                  }));
                if (
                  audience === "CASE_SHARED" &&
                  sourceRefs.some(
                    (r) =>
                      d.sources.find((s) => s.sourceId === r.sourceId)
                        ?.audience !== "CASE_SHARED",
                  )
                )
                  throw new Error(
                    "Shared messages may cite only shared sources",
                  );
                await disputesService.message(
                  caseId,
                  { text, sourceRefs, audience },
                  audience === "PRIVATE"
                    ? c.privateContextVersion
                    : c.caseVersion,
                );
                setText("");
                setRefs([]);
                await refresh();
              });
            }}
          >
            <label className="vp-label">
              Audience
              <select
                className="vp-input"
                value={audience}
                onChange={(e) => {
                  setAudience(e.target.value as typeof audience);
                  setRefs([]);
                }}
              >
                <option value="PRIVATE">PRIVATE · only your party</option>
                <option value="CASE_SHARED">CASE_SHARED · both parties</option>
              </select>
            </label>
            <label className="vp-label">
              Message
              <textarea
                className="vp-input"
                required
                minLength={3}
                maxLength={5000}
                rows={4}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Cite available evidence
              </legend>
              {d.sources
                .filter(
                  (s) =>
                    s.scanState === "CLEAN" &&
                    (audience === "PRIVATE" || s.audience === "CASE_SHARED"),
                )
                .map((s) => (
                  <label
                    key={s.sourceId}
                    className="mb-2 flex items-start gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={refs.includes(s.sourceId)}
                      onChange={(e) =>
                        setRefs(
                          e.target.checked
                            ? [...refs, s.sourceId]
                            : refs.filter((id) => id !== s.sourceId),
                        )
                      }
                    />
                    {s.originalName} · v{s.sourceVersion}
                  </label>
                ))}
            </fieldset>
            <button
              className="vp-button"
              disabled={action.busy || !c.capabilities.canPostMessage}
            >
              Save {audience === "PRIVATE" ? "private note" : "shared response"}
            </button>
          </form>
        </Panel>
      )}
      {tab === "AI assessment" && (
        <Panel title="Evidence-based assessment">
          <div className="mb-5 space-y-3">
            <p className="text-sm text-slate-600">
              AI supports the conversation. It cannot decide liability, consent
              or financial execution.
            </p>
            <button
              className="vp-button"
              disabled={
                action.busy ||
                ["QUEUED", "RUNNING"].includes(poll.data?.status ?? "") ||
                c.control !== "RUNNING"
              }
              onClick={() =>
                void action.run(async () => {
                  const r = await disputesService.assess(caseId, c.caseVersion);
                  setRunId(r.runId);
                  await refresh();
                }, "Assessment queued through the public API.")
              }
            >
              Request shared assessment
            </button>
            {c.control !== "RUNNING" && (
              <p className="text-sm text-amber-800">
                Workflow {c.control}. Request human review or wait for the
                assigned investigator.
              </p>
            )}
            <ErrorNotice error={poll.error} />
            {poll.data && <Badge>Run: {poll.data.status}</Badge>}
            {stale && (
              <p
                role="status"
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                This assessment is stale. Shared context changed; request a new
                assessment.
              </p>
            )}
          </div>
          {assessment ? (
            <Assessment
              assessment={assessment}
              onSource={(id) => {
                setSourceFocus(id);
                setTab("Evidence");
              }}
            />
          ) : (
            <p className="text-sm">No assessment yet.</p>
          )}
          <form
            className="mt-6 space-y-3 border-t border-slate-200 pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(async () => {
                await disputesService.requestReview(caseId, {
                  reason,
                  contestedFindingIds:
                    assessment?.findings
                      .filter((f) => f.kind === "CONFLICT")
                      .map((f) => f.findingId) ?? [],
                  newSourceRefs: [],
                });
                await refresh();
              }, "Human review requested.");
            }}
          >
            <label className="vp-label">
              Reason for human review
              <textarea
                className="vp-input"
                required
                minLength={10}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <button
              className="vp-secondary"
              disabled={action.busy || !c.capabilities.canRequestReview}
            >
              Request human review
            </button>
          </form>
        </Panel>
      )}
      {tab === "Private preparation" && <Assistant caseId={caseId} />}
      {tab === "Mediation & consent" && (
        <div className="space-y-6">
          <Panel title="Continue voluntary mediation">
            <p className="mb-3 text-sm">
              CONTINUE_MEDIATION is separate from accepting terms and
              authorizing money movement.
            </p>
            {assessment && (
              <>
                <label className="flex gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={mediation}
                    onChange={(e) => setMediation(e.target.checked)}
                  />
                  I reviewed assessment {assessment.runId} and case v
                  {c.caseVersion}.
                </label>
                <label className="vp-label mt-3">
                  Decision
                  <select
                    className="vp-input"
                    value={mediationDecision}
                    onChange={(e) =>
                      setMediationDecision(
                        e.target.value as typeof mediationDecision,
                      )
                    }
                  >
                    <option>APPROVED</option>
                    <option>REJECTED</option>
                  </select>
                </label>
                <button
                  className="vp-button mt-3"
                  disabled={
                    action.busy ||
                    !mediation ||
                    !!stale ||
                    !bindings ||
                    c.control !== "RUNNING"
                  }
                  onClick={() =>
                    void action.run(async () => {
                      await disputesService.mediationConsent(
                        caseId,
                        c.caseVersion,
                        assessment.runId,
                        bindings!.mediationParamsHash,
                        mediationDecision,
                      );
                      setMediation(false);
                      await refresh();
                    })
                  }
                >
                  Record mediation decision
                </button>
              </>
            )}
            {!bindings && (
              <p className="mt-3 text-sm text-amber-800">
                Consent/proposal drafting unavailable until backend supplies
                authoritative mediation and source-manifest bindings.
              </p>
            )}
          </Panel>
          <Panel title="Draft a voluntary proposal">
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(async () => {
                  if (!bindings)
                    throw new Error("Authoritative source digest unavailable");
                  const amountMinor = Number(amount);
                  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0)
                    throw new Error(
                      "Amount must be nonnegative integer minor units",
                    );
                  await disputesService.propose(caseId, c.caseVersion, {
                    terms,
                    money: { amountMinor, currency: "USD" },
                    route,
                    sourceDigest: bindings.sourceDigest,
                    expiresInMinutes: 60,
                  });
                  setChecked(false);
                  await refresh();
                }, "Proposal created. Both parties must review the exact terms.");
              }}
            >
              <label className="vp-label">
                Exact terms
                <textarea
                  className="vp-input"
                  required
                  minLength={10}
                  maxLength={5000}
                  rows={3}
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="vp-label">
                  Refund amount (USD minor units; 2000 = $20)
                  <input
                    className="vp-input"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <label className="vp-label">
                  Settlement route
                  <select
                    className="vp-input"
                    value={route}
                    onChange={(e) =>
                      setRoute(e.target.value as SettlementRoute)
                    }
                  >
                    {c.capabilities.supportedSettlementRoutes?.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                className="vp-button"
                disabled={
                  action.busy ||
                  !bindings ||
                  !c.capabilities.canProposeTerms ||
                  c.control !== "RUNNING"
                }
              >
                Create proposal
              </button>
            </form>
          </Panel>
          <Panel title="Exact terms & bilateral consent">
            {p ? (
              <div className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2">
                  <Badge>{p.status}</Badge>
                  <Badge>Proposal v{p.proposalVersion}</Badge>
                </div>
                <p className="whitespace-pre-wrap">{p.terms}</p>
                <p className="text-xl font-semibold">
                  {formatMoney(p.money.amountMinor, p.money.currency)}
                </p>
                <p>
                  {p.route} · Expires {formatDate(p.expiresAt)} UTC
                </p>
                <p className="break-all text-xs text-slate-500">
                  Terms binding: {p.paramsHash} · Case v{p.caseVersion}
                </p>
                <ul className="space-y-2">
                  {d.pendingConsents?.map((x) => (
                    <li key={x.party + x.intent}>
                      {x.party} · {x.intent} · <strong>{x.status}</strong>
                    </li>
                  ))}
                </ul>
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                  />
                  I reviewed these exact terms, amount, route, expiry and
                  current case version.
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="vp-button"
                    disabled={
                      action.busy ||
                      !checked ||
                      p.caseVersion !== c.caseVersion ||
                      !c.capabilities.canGrantConsent
                    }
                    onClick={() =>
                      void action.run(
                        () => consent("ACCEPT_PROPOSAL_TERMS", "APPROVED"),
                        "Terms acceptance recorded.",
                      )
                    }
                  >
                    Accept proposal terms
                  </button>
                  <button
                    className="vp-secondary"
                    disabled={action.busy || !checked}
                    onClick={() =>
                      void action.run(
                        () => consent("ACCEPT_PROPOSAL_TERMS", "REJECTED"),
                        "Terms rejected; no agreement assumed.",
                      )
                    }
                  >
                    Reject proposal terms
                  </button>
                </div>
                {party === "SELLER" && checked && (
                  <MfaStepUp
                    purpose="MERCHANT_EXECUTION"
                    targetId={p.actionRequestId}
                    onVerified={(id) =>
                      consent("AUTHORIZE_FINANCIAL_EXECUTION", "APPROVED", id)
                    }
                  />
                )}
                <p className="text-xs text-slate-600">
                  AUTHORIZE_FINANCIAL_EXECUTION is a separate Seller decision
                  requiring scoped MFA. Accepting terms does not move funds.
                </p>
                {party === "SELLER" && (
                  <button
                    className="vp-button"
                    disabled={
                      action.busy ||
                      !c.capabilities.canExecuteSettlement ||
                      d.providerOperation.status === "UNKNOWN" ||
                      d.pendingConsents.some((x) => x.status !== "APPROVED")
                    }
                    onClick={() =>
                      void action.run(async () => {
                        executionKey.current ||= crypto.randomUUID();
                        await disputesService.execute(
                          p.actionRequestId,
                          c.caseVersion,
                          p.paramsHash,
                          executionKey.current,
                        );
                        await refresh();
                      }, "Execution submitted. Check provider operation status.")
                    }
                  >
                    Submit authorized settlement
                  </button>
                )}
                {!c.capabilities.canExecuteSettlement && (
                  <p className="text-amber-800">
                    Financial execution unavailable for this case. No refund has
                    been executed.
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">
                No current proposal. New shared evidence invalidates previous
                terms and consents.
              </p>
            )}
          </Panel>
          <OfficialHandoff
            key={`${c.caseVersion}:${c.accessRevision}`}
            detail={d}
          />
          <Panel title="Settlement operation">
            {d.providerOperation.operationId ? (
              <OperationTracker operationId={d.providerOperation.operationId} />
            ) : (
              <p className="text-sm text-slate-500">
                No settlement operation has been submitted.
              </p>
            )}
          </Panel>
        </div>
      )}
      {tab === "Timeline" && (
        <Panel title="Case activity">
          <ol className="space-y-4">
            {d.activityTimeline?.map((e) => (
              <li
                key={e.eventId}
                className="border-l-2 border-blue-200 pl-4 text-sm"
              >
                <p className="font-medium">{e.summary}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {e.actorParty} · Case v{e.caseVersion} · {formatDate(e.at)}{" "}
                  UTC
                </p>
              </li>
            ))}
          </ol>
          {!d.activityTimeline?.length && (
            <p className="text-sm">No recorded shared activity yet.</p>
          )}
        </Panel>
      )}
    </div>
  );
}
