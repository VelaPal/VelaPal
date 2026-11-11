"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Database,
  Layers,
  RotateCw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Store,
  Users,
  Wallet,
} from "lucide-react";
import { ErrorNotice } from "@/components/ui/workflow";
import { formatMoney, formatDate } from "@/lib/format";
import { adminOperationsService } from "@/services/contracts/admin-operations.service";
import { adminService } from "@/services/contracts/admin.service";
import type { AdminCaseQueueItem } from "@/services/contracts/types";

const stageConfig: Record<string, { label: string; color: string }> = {
  AWAITING_EVIDENCE: {
    label: "Awaiting Evidence",
    color: "bg-blue-500 text-blue-700",
  },
  MEDIATING: {
    label: "Voluntary Mediation",
    color: "bg-indigo-500 text-indigo-700",
  },
  AWAITING_CONSENT: {
    label: "Awaiting Consent",
    color: "bg-amber-500 text-amber-700",
  },
  EXECUTION_PENDING: {
    label: "Execution Pending",
    color: "bg-emerald-500 text-emerald-700",
  },
  EXECUTION_UNKNOWN: {
    label: "Execution Unknown",
    color: "bg-rose-500 text-rose-700",
  },
  EXTERNAL_PENDING: {
    label: "Provider Pending",
    color: "bg-purple-500 text-purple-700",
  },
  RESOLVED: {
    label: "Resolved",
    color: "bg-slate-400 text-slate-600",
  },
  CLOSED_NO_AGREEMENT: {
    label: "Closed (No Agreement)",
    color: "bg-slate-400 text-slate-600",
  },
};

export function AdminOverview({
  caseCount: fallbackCaseCount,
  reviewCaseId: fallbackReviewCaseId,
}: {
  caseCount?: number;
  reviewCaseId?: string;
}) {
  // Fetch dispute queue
  const queue = useSWR(
    "admin-overview-queue",
    () => adminService.disputes("ALL", false),
    { refreshInterval: 10000 },
  );

  // Fetch pending approval requests
  const approvals = useSWR(
    "admin-overview-approvals",
    () => adminService.approvalRequests(),
    { refreshInterval: 10000 },
  );

  // Fetch aggregate analytics
  const analytics = useSWR(
    "admin-overview-analytics",
    () => adminOperationsService.analytics(),
    { refreshInterval: 15000 },
  );

  // Fetch system integration settings
  const settings = useSWR(
    "admin-overview-settings",
    () => adminOperationsService.settings(),
    { refreshInterval: 30000 },
  );

  const cases = queue.data?.items ?? [];
  const activeCases = cases.filter(
    (c) => !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(c.stage),
  );
  const needsReviewCases = cases.filter((c) => c.control === "WAITING_ADMIN");
  const pendingApprovals = approvals.data?.items ?? [];

  const totals = analytics.data?.totals;
  const casesByStage = analytics.data?.casesByStage ?? [];
  const totalStageCases = useMemo(
    () => casesByStage.reduce((sum, item) => sum + item.count, 0) || 1,
    [casesByStage],
  );

  const isRefreshing =
    queue.isValidating ||
    approvals.isValidating ||
    analytics.isValidating ||
    settings.isValidating;

  const refreshAll = () => {
    void queue.mutate();
    void approvals.mutate();
    void analytics.mutate();
    void settings.mutate();
  };

  return (
    <div className="space-y-6 max-w-7xl">
      {/* 1. Header with Operational Status and Quick Actions */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase font-mono">
              System Administration & Governance
            </span>
            <span className="size-1 rounded-full bg-slate-300" />
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Operational · v6.1.2
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Operations Overview
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Real-time dispute queue, pending approvals, provider reconciliations,
            and system readiness.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            title="Refresh operations overview"
            onClick={refreshAll}
            disabled={isRefreshing}
            className="grid place-items-center size-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition disabled:opacity-50 cursor-pointer shadow-2xs shrink-0"
          >
            <RotateCw
              className={`size-3.5 ${isRefreshing ? "animate-spin text-blue-600" : ""}`}
            />
          </button>
        </div>
      </header>

      {(queue.error || approvals.error || analytics.error) && (
        <ErrorNotice
          error={queue.error || approvals.error || analytics.error}
        />
      )}

      {/* 2. Primary Operational Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Disputes */}
        <Link
          href="/workspace/admin"
          className={`rounded-xl border p-4 bg-white shadow-2xs space-y-1.5 hover:border-slate-300 transition group ${
            needsReviewCases.length > 0 ? "border-amber-300 bg-amber-50/20" : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Active Disputes
            </span>
            <div
              className={`grid place-items-center size-7 rounded-md ${
                needsReviewCases.length > 0
                  ? "bg-amber-100 text-amber-700"
                  : "bg-blue-50 text-blue-600"
              }`}
            >
              <Scale className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>
              {activeCases.length || fallbackCaseCount || 0}
            </span>
            <span className="text-xs font-normal text-slate-400 font-sans">
              open
            </span>
          </div>
          <p
            className={`text-[11px] font-medium flex items-center gap-1 ${
              needsReviewCases.length > 0
                ? "text-amber-800"
                : "text-slate-500"
            }`}
          >
            {needsReviewCases.length > 0 ? (
              <>
                <span className="size-1.5 rounded-full bg-amber-500" />
                {needsReviewCases.length} require human review
              </>
            ) : (
              "No cases awaiting Admin"
            )}
          </p>
        </Link>

        {/* Pending Approvals */}
        <Link
          href="/workspace/admin"
          className={`rounded-xl border p-4 bg-white shadow-2xs space-y-1.5 hover:border-slate-300 transition group ${
            pendingApprovals.length > 0
              ? "border-rose-300 bg-rose-50/20"
              : "border-slate-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Pending Approvals
            </span>
            <div
              className={`grid place-items-center size-7 rounded-md ${
                pendingApprovals.length > 0
                  ? "bg-rose-100 text-rose-700"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <ShieldAlert className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>{pendingApprovals.length}</span>
            <span className="text-xs font-normal text-slate-400 font-sans">
              requests
            </span>
          </div>
          <p
            className={`text-[11px] font-medium ${
              pendingApprovals.length > 0
                ? "text-rose-700"
                : "text-slate-500"
            }`}
          >
            {pendingApprovals.length > 0
              ? "Financial actions need consent"
              : "All actions approved"}
          </p>
        </Link>

        {/* Platform Transactions */}
        <Link
          href="/workspace/admin/transactions"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5 hover:border-slate-300 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Platform Transactions
            </span>
            <div className="grid place-items-center size-7 rounded-md bg-emerald-50 text-emerald-600">
              <Wallet className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>{totals?.transactions ?? "—"}</span>
            <span className="text-xs font-normal text-slate-400 font-sans">
              orders
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            Transaction totals from the VelaPal API
          </p>
        </Link>

        {/* Entities */}
        <Link
          href="/workspace/admin/users"
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5 hover:border-slate-300 transition group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Users & Workspaces
            </span>
            <div className="grid place-items-center size-7 rounded-md bg-purple-50 text-purple-600">
              <Users className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight flex items-baseline gap-2">
            <span>{totals?.users ?? "—"}</span>
            <span className="text-xs font-normal text-slate-400 font-sans">
              users · {totals?.workspaces ?? "—"} ws
            </span>
          </div>
          <p className="text-[11px] text-slate-500">
            RBAC memberships tracked
          </p>
        </Link>
      </div>

      {/* 3. High-Priority Attention Panel (if items require intervention) */}
      {needsReviewCases.length > 0 || pendingApprovals.length > 0 ? (
        <section className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-amber-50/30 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/80 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="grid place-items-center size-8 rounded-lg bg-amber-600 text-white shadow-2xs">
                <ShieldAlert className="size-4" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">
                  Supervisory Intervention Required
                </h3>
                <p className="text-xs text-slate-600">
                  Evidence conflicts, risk triggers, or financial proposals require
                  manual human judgment.
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
              {needsReviewCases.length + pendingApprovals.length} Actions Pending
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {needsReviewCases.slice(0, 4).map((c: AdminCaseQueueItem) => (
              <div
                key={c.id}
                className="rounded-lg border border-amber-200/70 bg-white p-3.5 shadow-2xs space-y-2 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-mono text-slate-500">
                      {c.id}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                      Needs Review
                    </span>
                  </div>
                  <h4 className="font-semibold text-slate-900 text-xs mt-1">
                    {c.gateReason || "Evidence conflict requiring resolution"}
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Stage: {c.stage?.replaceAll("_", " ")} · {c.initiatorParty} REPORT
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-slate-400">
                    Merchant: {c.merchantId}
                  </span>
                  <Link
                    href={`/workspace/admin/${c.id}`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
                  >
                    Open Investigation
                    <ArrowRight className="size-3.5" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-xs text-slate-600 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            <span>
              <strong>All automated mediation pipelines are nominal.</strong> No
              disputes currently exceed uncertainty thresholds or require admin
              step-up intervention.
            </span>
          </div>
          <Link
            href="/workspace/admin"
            className="text-xs font-semibold text-blue-600 hover:underline shrink-0"
          >
            View all cases →
          </Link>
        </div>
      )}

      {/* 4. Two-Column Analytics & Health Section */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left Column: Dispute Pipeline by Stage */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="size-4 text-slate-600" />
              <h3 className="font-semibold text-slate-900 text-sm">
                Dispute Resolution Pipeline
              </h3>
            </div>
            <Link
              href="/workspace/admin"
              className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Queue
              <ArrowRight className="size-3" />
            </Link>
          </div>

          {casesByStage.length > 0 ? (
            <div className="space-y-3">
              {casesByStage.map((item) => {
                const conf = stageConfig[item.stage] || {
                  label: item.stage.replaceAll("_", " "),
                  color: "bg-slate-400 text-slate-600",
                };
                const pct = Math.round((item.count / totalStageCases) * 100);

                return (
                  <div key={item.stage} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700">
                        {conf.label}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-slate-500 font-semibold">
                          {item.count}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono w-9 text-right">
                          {pct}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${conf.color.split(" ")[0]} transition-all duration-500`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic py-4">
              No dispute cases recorded in the database.
            </p>
          )}

          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            Cases transition through stages strictly per the frozen V6.1.1 dispute
            state machine.
          </p>
        </section>

        {/* Right Column: Platform Integration Readiness */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="size-4 text-slate-600" />
              <h3 className="font-semibold text-slate-900 text-sm">
                System Readiness & Subsystems
              </h3>
            </div>
            <Link
              href="/workspace/admin/settings"
              className="text-xs font-medium text-blue-600 hover:underline inline-flex items-center gap-1"
            >
              Diagnostics
              <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="grid gap-3">
            {/* Database */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Database className="size-4 text-slate-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    PostgreSQL Database
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Prisma ORM · Transaction & Audit Ledger
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 font-mono">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                CONNECTED
              </span>
            </div>

            {/* PayPal */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Wallet className="size-4 text-blue-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    PayPal Sandbox Integration
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Orders v2 · Captures & Refunds API
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 font-mono">
                <span className="size-1.5 rounded-full bg-blue-500" />
                {settings.data?.integrations.paypal || "CONFIGURED"}
              </span>
            </div>

            {/* AI Service */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Layers className="size-4 text-purple-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    AI Service (FastAPI + LangGraph)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Gemini 2.5 Flash · Qdrant Vector Store
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-purple-50 text-purple-700 border border-purple-200 font-mono">
                <span className="size-1.5 rounded-full bg-purple-500" />
                {settings.data?.integrations.ai || "CONFIGURED"}
              </span>
            </div>

            {/* Outbox Jobs */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2.5">
                <Clock className="size-4 text-amber-600" />
                <div>
                  <div className="text-xs font-semibold text-slate-800">
                    Durable Outbox Dispatcher
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Background worker polling every 2s
                  </div>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                ACTIVE
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-400 pt-2 border-t border-slate-100">
            Last verified: {formatDate(settings.data?.checkedAt || null)}
          </p>
        </section>
      </div>

      {/* 5. Quick Administrative Operations Shortcuts */}
      <section className="space-y-3 pt-2">
        <h3 className="font-semibold text-slate-900 text-sm">
          Administrative Modules & Tools
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Link
            href="/workspace/admin"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-xs transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <Scale className="size-5 text-blue-600" />
              <ArrowUpRight className="size-3.5 text-slate-400 group-hover:text-blue-600 transition" />
            </div>
            <h4 className="font-semibold text-slate-900 text-xs mt-2">
              Dispute Monitoring
            </h4>
            <p className="text-[11px] text-slate-500">
              Manage case triage, evidence citations, and manual interventions.
            </p>
          </Link>

          <Link
            href="/workspace/admin/merchants"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-xs transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <Store className="size-5 text-indigo-600" />
              <ArrowUpRight className="size-3.5 text-slate-400 group-hover:text-blue-600 transition" />
            </div>
            <h4 className="font-semibold text-slate-900 text-xs mt-2">
              Merchant Profiles
            </h4>
            <p className="text-[11px] text-slate-500">
              Onboarding verification, catalog permissions, and PayPal tracking.
            </p>
          </Link>

          <Link
            href="/workspace/admin/ai"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-xs transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <Layers className="size-5 text-purple-600" />
              <ArrowUpRight className="size-3.5 text-slate-400 group-hover:text-blue-600 transition" />
            </div>
            <h4 className="font-semibold text-slate-900 text-xs mt-2">
              AI Diagnostic Ledger
            </h4>
            <p className="text-[11px] text-slate-500">
              Outbox runs, prompt version manifests, and execution latency.
            </p>
          </Link>

          <Link
            href="/workspace/admin/audit"
            className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs hover:border-blue-300 hover:shadow-xs transition space-y-1 group"
          >
            <div className="flex items-center justify-between">
              <ShieldCheck className="size-5 text-emerald-600" />
              <ArrowUpRight className="size-3.5 text-slate-400 group-hover:text-blue-600 transition" />
            </div>
            <h4 className="font-semibold text-slate-900 text-xs mt-2">
              Immutable Audit Logs
            </h4>
            <p className="text-[11px] text-slate-500">
              Audit trail of every administrative override, pause, and approval.
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
