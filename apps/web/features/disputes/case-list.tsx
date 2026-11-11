"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { useCases } from "./hooks";
import { useSession } from "@/features/auth/session";
import { transactionsService } from "@/services/contracts/transactions.service";
import { formatMoney } from "@/lib/format";
import type { DisputeCategory } from "@/services/contracts/types";
import { Badge, ErrorNotice } from "@/components/ui/workflow";
import { ArrowRight, Plus, Scale, ShieldCheck, Search } from "lucide-react";
import StatCard from "@/components/ui/stat-card";
export const categories: DisputeCategory[] = [
  "ITEM_NOT_AS_DESCRIBED",
  "ITEM_NOT_RECEIVED",
  "PAYMENT_NOT_CONFIRMED",
  "FULFILMENT_OR_RETURN_ISSUE",
  "BILLING_OR_RENEWAL_CONCERN",
  "CONTESTED_CLAIM",
];
const statusLabels: Record<string, string> = {
  AWAITING_EVIDENCE: "Waiting for evidence",
  MEDIATING: "In mediation",
  AWAITING_CONSENT: "Awaiting your approval",
  EXECUTION_PENDING: "Action pending",
  EXECUTION_UNKNOWN: "Action needs reconciliation",
  EXTERNAL_PENDING: "Waiting for provider",
  RESOLVED: "Resolved",
  CLOSED_NO_AGREEMENT: "Closed without agreement",
  RUNNING: "Case active",
  WAITING_ADMIN: "Needs human review",
  PAUSED: "Case paused",
  MANUAL: "Human-led review",
};
export default function CaseList() {
  const { session } = useSession();
  const cases = useCases();
  const transactions = useSWR(
    session?.activeWorkspace.type !== "ADMIN"
      ? [session?.activeWorkspace.id, "intake-transactions"]
      : null,
    () => transactionsService.list(),
  );
  const [filter, setFilter] = useState("All cases");
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (session?.activeWorkspace.type) {
      setFilter(
        session.activeWorkspace.type === "SELLER"
          ? "Incoming disputes"
          : "All cases",
      );
    }
  }, [session?.activeWorkspace.type]);
  const all = cases.data?.items ?? [];
  const filtered = all.filter(
    (c) =>
      filter === "All cases" ||
      (filter === "Incoming disputes" && c.initiatorParty === "CUSTOMER") ||
      (filter === "Your reports" &&
        c.initiatorParty === session?.activeWorkspace.type) ||
      (filter === "Seller reports" && c.initiatorParty === "SELLER") ||
      (filter === "Closed" &&
        ["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(c.stage)),
  );
  const visible = filtered.filter((c) =>
    [
      c.id,
      c.transactionId,
      c.orderId,
      c.category?.replaceAll("_", " ") ?? "",
      transactions.data?.items?.find((t) => t.id === c.transactionId)
        ?.merchantName,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  );
  if (session?.activeWorkspace.type === "ADMIN")
    return (
      <Link className="vp-link" href="/workspace/admin">
        Open Admin dispute queue
      </Link>
    );
  return (
    <div className="space-y-6">
      <header className="vp-page-heading">
        <div>
          <p className="vp-eyebrow">
            {session?.activeWorkspace.type} / DISPUTES
          </p>
          <h1>Let’s find a fair way forward.</h1>
          <p className="mt-2 text-sm text-slate-600">
            A fair next step, backed by evidence.{" "}
            {session?.activeWorkspace.type === "SELLER"
              ? "Respond to incoming cases or open a Seller report."
              : "Track a concern and work toward a voluntary agreement."}
          </p>
        </div>
        <Link className="vp-button" href="/workspace/cases/new">
          <Plus size={16} />
          {session?.activeWorkspace.type === "SELLER"
            ? "Create Seller report"
            : "Create dispute"}
        </Link>
      </header>
      <ErrorNotice error={cases.error} />
      {cases.isLoading && <p role="status">Loading cases…</p>}
      {cases.data && (
        <div className="vp-metrics-grid vp-case-metrics">
          <StatCard
            label="Open cases"
            value={String(
              all.filter(
                (c) => !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(c.stage),
              ).length,
            ).padStart(2, "0")}
            description="Follow every step"
            icon={Scale}
          />
          <StatCard
            label="Waiting on evidence"
            value={String(
              all.filter((c) => c.stage === "AWAITING_EVIDENCE").length,
            ).padStart(2, "0")}
            description="Each side has a voice"
            icon={ShieldCheck}
          />
          <StatCard
            label="In mediation"
            value={String(
              all.filter((c) => c.stage === "MEDIATING").length,
            ).padStart(2, "0")}
            description="Review a way forward"
            icon={Scale}
          />
        </div>
      )}
      <section className="vp-case-list">
        <div className="vp-case-toolbar">
          <nav aria-label="Dispute filters" className="vp-case-tabs">
            {[
              "All cases",
              session?.activeWorkspace.type === "SELLER"
                ? "Incoming disputes"
                : "Your reports",
              "Seller reports",
              "Closed",
            ].map((tab) => (
              <button
                type="button"
                key={tab}
                aria-pressed={filter === tab}
                onClick={() => setFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </nav>
          <label className="vp-case-search">
            <Search size={16} />
            <input
              aria-label="Search case or transaction"
              placeholder="Search case or transaction"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        {visible.map((c) => (
          <Link
            key={c.id}
            href={`/workspace/cases/${c.id}`}
            className="vp-case-list-row"
          >
            <span className="vp-case-row-icon">
              <Scale size={20} />
            </span>
            <div>
              <p className="vp-case-list-kicker">
                {c.id} · {c.initiatorParty} REPORT
              </p>
            <h2>
              {c.category?.replaceAll("_", " ").toLowerCase() ||
                "Unknown category"}
            </h2>
              <p className="vp-case-list-meta">
                {c.transactionId ?? c.orderId}
                {transactions.data?.items
                  ?.filter((t) => t.id === c.transactionId)
                  ?.map((t) => (
                    <span key={t.id}>
                      {" "}
                      · {t.merchantName} ·{" "}
                      {formatMoney(t.amountMinor, t.currency)} USD
                    </span>
                  ))}
              </p>
            </div>
            <div className="vp-case-list-status">
              <Badge>
                {statusLabels[
                  c.control === "WAITING_ADMIN" ? c.control : c.stage
                ] ?? c.stage}
              </Badge>
              <span className="vp-case-list-meta">
                {statusLabels[
                  c.control === "WAITING_ADMIN" ? c.stage : c.control
                ] ?? c.control}
              </span>
            </div>
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ))}
        {cases.data && visible.length === 0 && (
          <p className="vp-empty-note">No cases match this view.</p>
        )}
        <p className="vp-table-footer">
          <ShieldCheck size={12} />
          Internal case management. Official PayPal cases and financial results
          are tracked separately.
        </p>
      </section>
      <div className="vp-case-principles">
        {[
          [
            "Equal opportunity to respond.",
            "Customer and Seller can share evidence, clarify a claim, and ask for human review.",
          ],
          [
            "Evidence before conclusions.",
            "Transaction records, party claims, and unresolved questions stay visibly separate.",
          ],
          [
            "Approval with a clear scope.",
            "People authorize consequential actions. Provider results confirm the outcome.",
          ],
        ].map(([title, copy], i) => (
          <div key={title}>
            <span>0{i + 1}</span>
            <h2>{title}</h2>
            <p>{copy}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
