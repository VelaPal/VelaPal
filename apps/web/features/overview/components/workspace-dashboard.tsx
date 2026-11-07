"use client";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  HardDrive,
  Scale,
  ShieldCheck,
  Store,
  Wallet,
  Clock3,
  CheckCircle2,
  Sailboat,
} from "lucide-react";
import useSWR from "swr";
import { useSession } from "@/features/auth/session";
import { transactionsService } from "@/services/contracts/transactions.service";
import { disputesService } from "@/services/contracts/disputes.service";
import { AdminQueue } from "@/features/admin/admin-workspace";
import StatCard from "@/components/ui/stat-card";
import RecentTransactions from "@/features/transactions/components/recent-transactions";
import OperationTracker from "@/features/disputes/operation";
import { Panel, ErrorNotice } from "@/components/ui/workflow";
import { formatMoney } from "@/lib/format";
import type { Transaction, DisputeCase } from "@/services/contracts/types";
function SpendingOverview({ transactions }: { transactions: Transaction[] }) {
  const paid = transactions.filter((t) => t.paymentStatus === "PAID");
  const total = paid.reduce((sum, t) => sum + t.amountMinor, 0);
  const dated = paid
    .filter((t) => t.verifiedAt)
    .sort((a, b) => a.verifiedAt!.localeCompare(b.verifiedAt!));
  const maximum = Math.max(...dated.map((t) => t.amountMinor), 100);
  const points = dated.map((t, i) => ({
    x: dated.length === 1 ? 720 : (i / (dated.length - 1)) * 720,
    y: 110 - (t.amountMinor / maximum) * 100,
    t,
  }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  return (
    <section className="vp-panel vp-spending-panel">
      <div className="vp-section-heading">
        <h2>Spending overview</h2>
        <span className="vp-period-chip">Verified records</span>
      </div>
      <div className="vp-chart-heading">
        <div>
          <strong>{formatMoney(total)}</strong>
          <span>from verified VelaPal transactions</span>
        </div>
        <span className="vp-chart-legend">
          <i />
          Paid purchases
        </span>
      </div>
      <div className="vp-spending-chart">
        <div className="vp-chart-scale">
          {[maximum, (maximum * 2) / 3, maximum / 3, 0].map((v, i) => (
            <span key={i}>{formatMoney(Math.round(v))}</span>
          ))}
        </div>
        <div className="vp-chart-canvas">
          <div className="vp-chart-gridlines">
            <i />
            <i />
            <i />
            <i />
          </div>
          <svg
            role="img"
            aria-label={`Verified paid transaction values, total ${formatMoney(total)}`}
            viewBox="-8 -4 736 125"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="vp-spending-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0871e8" stopOpacity=".16" />
                <stop offset="100%" stopColor="#0871e8" stopOpacity="0" />
              </linearGradient>
            </defs>
            {points.length > 1 && (
              <>
                <path
                  d={`${line} L720,115 L0,115 Z`}
                  fill="url(#vp-spending-fill)"
                />
                <path
                  d={line}
                  fill="none"
                  stroke="#0871e8"
                  strokeWidth="2.5"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            )}
            {points.map((p) => (
              <circle
                key={p.t.id}
                cx={p.x}
                cy={p.y}
                r={3.5}
                fill="#0871e8"
                stroke="#fff"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
              >
                <title>
                  {p.t.id}: {formatMoney(p.t.amountMinor)}
                </title>
              </circle>
            ))}
          </svg>
          <div className="vp-chart-dates">
            {dated.length ? (
              dated.map((t) => (
                <span key={t.id}>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "2-digit",
                    timeZone: "UTC",
                  }).format(new Date(t.verifiedAt!))}
                </span>
              ))
            ) : (
              <span>No verified payment dates supplied</span>
            )}
          </div>
        </div>
      </div>
      <p className="vp-chart-footnote">
        <CheckCircle2 size={11} aria-hidden="true" />
        Based on returned records. Pending payments and refunds are shown
        separately.
      </p>
    </section>
  );
}
function CaseAttention({
  cases,
  transactions,
  seller = false,
}: {
  cases: DisputeCase[];
  transactions: Transaction[];
  seller?: boolean;
}) {
  const current =
    cases.find((c) => c.control === "WAITING_ADMIN") ??
    cases.find((c) => !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(c.stage));
  const pending = transactions.find((t) =>
    ["UNCONFIRMED", "UNKNOWN"].includes(t.paymentStatus),
  );
  return (
    <section className="vp-panel vp-attention-panel">
      <div className="vp-section-heading">
        <div>
          <h2>Needs your attention</h2>
          {seller && <p>Small, clear steps to keep things moving.</p>}
        </div>
        <span className="vp-count-badge">
          {Number(!!current) + Number(!!pending)}
        </span>
      </div>
      {current && seller ? (
        <Link
          className="vp-seller-attention-row"
          href={`/workspace/cases/${current.id}`}
        >
          <Scale size={17} aria-hidden="true" />
          <div>
            <strong>
              {current.category.replaceAll("_", " ").toLowerCase()}
            </strong>
            <p>
              Review shared evidence, respond to the claim, and follow the next
              checkpoint.
            </p>
          </div>
          <span>
            Review case
            <ArrowRight size={14} />
          </span>
        </Link>
      ) : current ? (
        <div className="vp-attention-case">
          <div className="vp-attention-kicker">
            <span>
              <Scale size={13} />
              DISPUTES
            </span>
            <small>
              {current.control === "WAITING_ADMIN"
                ? "Needs human review"
                : current.stage === "AWAITING_CONSENT"
                  ? "Your decision needed"
                  : "In progress"}
            </small>
          </div>
          <h3>
            {seller
              ? "A clear response starts here."
              : "Let’s find a way forward."}
          </h3>
          <p>Review the shared evidence and the next step for both parties.</p>
          <div className="vp-attention-product">
            <span className="vp-product-mark">
              <HardDrive size={17} />
            </span>
            <div>
              <strong>
                {current.category.replaceAll("_", " ").toLowerCase()}
              </strong>
              <small>{current.id}</small>
            </div>
          </div>
          <Link
            className="vp-button"
            href={`/workspace/cases/${current.id}`}
          >
            {seller ? "Review case" : "Review my case"}
            <ArrowRight size={15} />
          </Link>
          <p className="vp-attention-source">
            <ShieldCheck size={10} />
            Recommendations backed by shared evidence
          </p>
        </div>
      ) : (
        <p className="vp-empty-note">No open cases need your attention.</p>
      )}
      {pending && seller ? (
        <Link
          className="vp-seller-attention-row vp-seller-payment-row"
          href={`/workspace/transactions/${pending.id}`}
        >
          <Clock3 size={17} aria-hidden="true" />
          <div>
            <strong>Payment not confirmed</strong>
            <p>
              {formatMoney(pending.amountMinor, pending.currency)} · Wait for a
              verified provider outcome.
            </p>
          </div>
          <span>
            Review payment
            <ArrowRight size={14} />
          </span>
        </Link>
      ) : (
        pending && (
          <div className="vp-pending-summary">
            <span className="vp-mini-label">
              <Clock3 size={13} />
              PAYMENT FOLLOW-UP
            </span>
            <div>
              <strong>Payment not confirmed</strong>
              <b>{formatMoney(pending.amountMinor, pending.currency)}</b>
            </div>
            <p>
              Wait for a verified provider outcome before treating this payment
              as complete.
            </p>
            <Link
              className="vp-secondary"
              href={`/workspace/transactions/${pending.id}`}
            >
              Review payment
              <ArrowRight size={14} />
            </Link>
          </div>
        )
      )}
    </section>
  );
}
export default function WorkspaceDashboard() {
  const { session } = useSession();
  const role = session?.activeWorkspace.type;
  const data = useSWR(
    session && role !== "ADMIN"
      ? [session.activeWorkspace.id, "dashboard"]
      : null,
    async () => {
      const [transactions, cases] = await Promise.all([
        transactionsService.list(),
        disputesService.list(),
      ]);
      return { transactions: transactions.items, cases: cases.items };
    },
  );
  if (role === "ADMIN") return <AdminQueue overview />;
  const d = data.data;
  const dashboardTransactions = d?.transactions ?? [];
  const dashboardCases = d?.cases ?? [];
  const seller = role === "SELLER";
  return (
    <div className="vp-dashboard">
      <header className="vp-page-heading">
        <div>
          <p className="vp-eyebrow">
            {seller
              ? session?.activeWorkspace.name.toUpperCase()
              : "YOUR PERSONAL WORKSPACE"}
          </p>
          <h1>
            {seller ? "A good day to move things forward." : "Your overview"}
          </h1>
          <p>
            {seller
              ? "Your business, with the next step already in view."
              : "A clearer view of your money. A little less to worry about."}
          </p>
        </div>
      </header>
      <section className="vp-assistant-banner">
        <div className="vp-banner-copy">
          <p className="vp-banner-kicker">
            <Sailboat size={14} />
            {seller ? "YOUR SELLER WORKSPACE" : "YOUR VELA ASSISTANT"}
          </p>
          <h2>
            {seller
              ? "Thoughtful service starts here."
              : "Less admin. More peace of mind."}
          </h2>
          <p>
            {seller
              ? "Keep orders moving and give every customer a clear answer."
              : "From your next purchase to your next step. Just ask."}
          </p>
          {seller ? (
            <Link
              className="vp-secondary vp-banner-orders"
              href="/workspace/transactions"
            >
              Review orders
              <ArrowRight size={15} />
            </Link>
          ) : (
            <>
              <Link className="vp-banner-prompt" href="/workspace/assistant">
                <Sailboat size={15} />
                <span>What would you like to take care of?</span>
                <span className="vp-banner-prompt-arrow">
                  <ArrowRight size={18} />
                </span>
              </Link>
              <div className="vp-banner-suggestions">
                <Link href="/workspace/catalog">
                  Find a purchase
                  <ArrowUpRight size={11} />
                </Link>
                <Link href="/workspace/subscriptions">
                  Review my subscriptions
                  <ArrowUpRight size={11} />
                </Link>
                <Link href="/workspace/cases">
                  Help with an order
                  <ArrowUpRight size={11} />
                </Link>
              </div>
            </>
          )}
        </div>
        <div className="vp-banner-assurance">
          <span>
            {seller ? <Store size={29} /> : <ShieldCheck size={29} />}
          </span>
          <strong>
            {seller ? session?.activeWorkspace.name : "Always your call."}
          </strong>
          <p>
            {seller ? (
              "One business. A shared view."
            ) : (
              <>
                Vela helps with the next step.
                <br />
                You approve what happens.
              </>
            )}
          </p>
          {!seller && <small>● You’re in control</small>}
        </div>
      </section>
      <ErrorNotice error={data.error} />
      {data.isLoading && (
        <p role="status" className="vp-empty-note">
          Loading overview…
        </p>
      )}
      {d && (
        <div className="vp-metrics-grid">
          <StatCard
            label={seller ? "Gross payments" : "Paid purchase value"}
            value={formatMoney(
              dashboardTransactions
                .filter((t) => t.paymentStatus === "PAID")
                .reduce((sum, t) => sum + t.amountMinor, 0),
            )}
            description="Verified purchases"
            icon={Wallet}
            href="/workspace/transactions"
          />
          <StatCard
            label="Unconfirmed"
            value={String(
              dashboardTransactions.filter((t) =>
                ["UNCONFIRMED", "UNKNOWN"].includes(t.paymentStatus),
              ).length,
            ).padStart(2, "0")}
            description="Awaiting confirmation"
            icon={Clock3}
            href="/workspace/transactions"
          />
          <StatCard
            label={seller ? "Open disputes" : "Open cases"}
            value={String(
              dashboardCases.filter(
                (c) => !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(c.stage),
              ).length,
            ).padStart(2, "0")}
            description="Shared cases and next steps"
            icon={Scale}
            href="/workspace/cases"
            accent
          />
          <StatCard
            label="Awaiting consent"
            value={String(
              dashboardCases.filter(
                (c) => c.stage === "AWAITING_CONSENT",
              ).length,
            ).padStart(2, "0")}
            description="Exact terms to review"
            icon={CheckCircle2}
            href="/workspace/cases"
          />
        </div>
      )}
      {d && (
        <div className={seller ? "vp-seller-overview" : "vp-overview-grid"}>
          {!seller && (
            <div className="vp-overview-spending">
              <SpendingOverview transactions={dashboardTransactions} />
            </div>
          )}
          <div className="vp-overview-attention">
            <CaseAttention
              cases={dashboardCases}
              transactions={dashboardTransactions}
              seller={seller}
            />
            <div className="vp-quiet-note">
              <ShieldCheck size={19} />
              <div>
                <strong>Your money, in your hands.</strong>
                <p>
                  Vela never pays, cancels, or sends a case response without
                  your approval.
                </p>
              </div>
            </div>
            <section className="vp-panel vp-case-activity">
              <div className="vp-section-heading">
                <h2>{seller ? "Business snapshot" : "Case activity"}</h2>
              </div>
              {seller ? (
                <dl>
                  <div>
                    <dt>Authorized orders</dt>
                    <dd>{dashboardTransactions?.length ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Paid orders</dt>
                    <dd>
                      {
                        dashboardTransactions.filter(
                          (t) => t.paymentStatus === "PAID",
                        )
                          .length
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Open disputes</dt>
                    <dd>
                      {
                        dashboardCases.filter(
                          (c) =>
                            !["RESOLVED", "CLOSED_NO_AGREEMENT"].includes(
                              c.stage,
                            ),
                        ).length
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Currency</dt>
                    <dd>USD</dd>
                  </div>
                </dl>
              ) : (
                <ul>
                  {dashboardCases?.slice(0, 3)?.map((c) => (
                    <li key={c.id}>
                      <span>
                        <Scale size={13} />
                      </span>
                      <div>
                        <Link href={`/workspace/cases/${c.id}`}>
                          {c.control === "WAITING_ADMIN"
                            ? "Needs human review"
                            : c.stage.replaceAll("_", " ").toLowerCase()}
                        </Link>
                        <p>{c.id}</p>
                        <small>
                          Case v{c.caseVersion} ·{" "}
                          {c.initiatorParty.toLowerCase()} report
                        </small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
          <div className="vp-overview-transactions">
            <RecentTransactions />
          </div>
        </div>
      )}
      {process.env.NEXT_PUBLIC_API_MODE !== "api" && (
        <details className="vp-operation-demo">
          <summary>
            Operation reconciliation fixture · synthetic UNKNOWN result
          </summary>
          <Panel title="Operation reconciliation fixture">
            <p className="mb-4 text-sm text-slate-600">
              Independent synthetic UNKNOWN-operation example. No settlement was
              executed on the cases above.
            </p>
            <OperationTracker operationId="op_ref_01JBYZ" />
          </Panel>
        </details>
      )}
    </div>
  );
}
