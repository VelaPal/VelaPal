"use client";

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  FileText,
  HelpCircle,
  Info,
  Scale,
  ShieldAlert,
  Sparkles,
  Store,
  User,
} from "lucide-react";
import type {
  AssessmentCitation,
  LatestAssessment,
  SourceRef,
} from "@/services/contracts/types";
import { Badge } from "@/components/ui/workflow";

function formatSourceId(id: string): string {
  if (id.startsWith("snap_") || id.startsWith("src_") || id.length <= 14) {
    return id;
  }
  return `${id.slice(0, 4)}…${id.slice(-4)}`;
}

function Citations({
  refs,
  onSource,
}: {
  refs: SourceRef[];
  onSource?: (id: string) => void;
}) {
  if (!refs || refs.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100">
      <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1 mr-1">
        <FileText className="w-3 h-3 text-slate-400" />
        Cited Evidence:
      </span>
      {refs.map((r, i) => (
        <button
          key={`${r.sourceId}-${r.version}-${i}`}
          type="button"
          title={`Source ID: ${r.sourceId}\nVersion: ${r.version}\nLocator: ${r.locator}\nClick to view source evidence`}
          onClick={(e) => {
            e.preventDefault();
            if (onSource) {
              onSource(r.sourceId);
            }
          }}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100/90 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200/80 hover:border-blue-300 transition-colors cursor-pointer group shadow-2xs"
        >
          <span className="font-mono text-slate-600 group-hover:text-blue-700">
            {formatSourceId(r.sourceId)}
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-slate-500 group-hover:text-blue-600">
            v{r.version}
          </span>
          {r.locator && (
            <>
              <span className="text-slate-300">·</span>
              <span className="font-mono text-slate-600 group-hover:text-blue-800 bg-white/80 px-1 py-0.2 rounded border border-slate-200/60">
                {r.locator}
              </span>
            </>
          )}
          <ExternalLink className="w-2.5 h-2.5 text-slate-400 group-hover:text-blue-500 ml-0.5" />
        </button>
      ))}
    </div>
  );
}

function parseBackendRecord(rawText: string) {
  const match = rawText.match(
    /^(Backend\s+(?:transaction|payment)\s+record):\s*(.+?)(?:\.\s*([^.]+verification[^.]*|\.|$))/i,
  );
  if (!match) return null;

  const header = match[1];
  const body = match[2];
  const disclaimer =
    match[3] ||
    rawText.slice(rawText.indexOf(body) + body.length).replace(/^[.;\s]+/, "");

  const parts = body
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const tags: { label: string; value: string; highlight?: boolean }[] = [];

  for (const part of parts) {
    if (part.includes("=")) {
      const [k, v] = part.split("=").map((s) => s.trim());
      if (k === "amountMinor" || k === "refundableRemainingMinor") {
        const num = Number(v);
        tags.push({
          label: k === "amountMinor" ? "Amount" : "Refundable",
          value: isNaN(num) ? v : `$${(num / 100).toFixed(2)}`,
          highlight: k === "amountMinor",
        });
      } else if (k === "paymentStatus") {
        tags.push({ label: "Status", value: v, highlight: true });
      } else if (k === "orderId") {
        tags.push({ label: "Order ID", value: v });
      } else if (k === "sku") {
        tags.push({ label: "SKU", value: v });
      } else if (k === "variantId") {
        tags.push({ label: "Variant", value: v });
      } else if (k === "currency") {
        // Skip redundant USD display
      } else {
        tags.push({ label: k, value: v });
      }
    } else {
      if (
        ["PAID", "COMPLETED", "REFUNDED", "PENDING", "FAILED"].includes(
          part.toUpperCase(),
        )
      ) {
        tags.push({
          label: "Status",
          value: part.toUpperCase(),
          highlight: true,
        });
      } else {
        tags.push({ label: "Record", value: part });
      }
    }
  }

  return {
    header,
    tags,
    disclaimer: disclaimer?.trim() || null,
  };
}

function FormattedAssessmentText({ text }: { text: string }) {
  const parsed = parseBackendRecord(text);

  if (parsed) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <Database className="w-3.5 h-3.5 text-slate-500" />
          <span>{parsed.header}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {parsed.tags.map((t, idx) => (
            <span
              key={idx}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium border ${
                t.label === "Status" &&
                (t.value === "PAID" || t.value === "COMPLETED")
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : t.highlight
                    ? "bg-blue-50 text-blue-800 border-blue-200 font-semibold"
                    : "bg-slate-100 text-slate-700 border-slate-200"
              }`}
            >
              <span className="text-slate-400 font-normal">{t.label}:</span>
              <span className="font-mono">{t.value}</span>
            </span>
          ))}
        </div>
        {parsed.disclaimer && (
          <p className="text-xs text-slate-500 italic">{parsed.disclaimer}</p>
        )}
      </div>
    );
  }

  return (
    <p className="text-sm text-slate-800 leading-relaxed break-words">{text}</p>
  );
}

function QuotedEvidence({
  title,
  items,
  type = "supporting",
  onSource,
}: {
  title: string;
  items: AssessmentCitation[];
  type?: "supporting" | "contrary";
  onSource?: (id: string) => void;
}) {
  const isSupporting = type === "supporting";

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        {isSupporting ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
        )}
        <h4 className="text-xs font-semibold text-slate-800 tracking-wide uppercase">
          {title}
        </h4>
        <span className="text-xs font-mono text-slate-400">
          ({items?.length ?? 0})
        </span>
      </div>

      {items?.length ? (
        <ul className="space-y-2.5">
          {items.map((item, index) => (
            <li
              key={`${item.sourceId}-${item.version}-${index}`}
              className={`rounded-lg border p-3.5 bg-white shadow-2xs transition hover:shadow-xs ${
                isSupporting
                  ? "border-emerald-200/80 border-l-4 border-l-emerald-500"
                  : "border-rose-200/80 border-l-4 border-l-rose-500"
              }`}
            >
              <blockquote className="text-sm text-slate-800 italic leading-relaxed">
                “{item.quote}”
              </blockquote>
              <Citations refs={[item]} onSource={onSource} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500 italic pl-5">
          No cited evidence in this category.
        </p>
      )}
    </div>
  );
}

export default function Assessment({
  assessment: a,
  onSource,
}: {
  assessment: LatestAssessment;
  onSource?: (id: string) => void;
}) {
  return (
    <div className="space-y-5 text-sm">
      {/* 1. Top metadata header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
              a.status === "COMPLETED"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : a.status === "RUNNING" || a.status === "QUEUED"
                  ? "bg-blue-50 text-blue-700 border-blue-200"
                  : a.status === "NEEDS_INFO"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-slate-100 text-slate-700 border-slate-200"
            }`}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {a.status}
          </span>
          <Badge>
            {a.modelMode === "live" ? "Live AI (Gemini)" : "Simulated AI"}
          </Badge>
          <Badge>Input v{a.inputVersion}</Badge>
          <Badge>{a.category?.replaceAll("_", " ")}</Badge>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
          <span>
            Run{" "}
            {a.runId.length > 16
              ? `${a.runId.slice(0, 6)}…${a.runId.slice(-4)}`
              : a.runId}
          </span>
          {a.modelVersion && (
            <>
              <span>·</span>
              <span>{a.modelVersion}</span>
            </>
          )}
        </div>
      </div>

      {/* 2. Advisory Recommendation & Next Action */}
      <section className="relative overflow-hidden rounded-xl border border-blue-200/90 bg-gradient-to-br from-blue-50/70 via-white to-indigo-50/40 p-5 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-3">
          <div className="flex items-center gap-2">
            <div className="grid place-items-center size-8 rounded-lg bg-blue-600 text-white shadow-2xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 leading-tight">
                Advisory Recommendation
              </h3>
              <p className="text-[11px] text-slate-500">
                AI evaluation synthesized from shared case evidence
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 border border-blue-200">
            Next: {a.nextStep?.replaceAll("_", " ") || "Review"}
          </span>
        </div>

        <p className="text-sm font-medium text-slate-800 leading-relaxed pl-1">
          {a.recommendation ||
            a.nextStep?.replaceAll("_", " ") ||
            "No specific recommendation provided."}
        </p>

        {a.requiresHumanApproval && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200/80 bg-amber-50/80 p-3 text-xs text-amber-900">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="leading-normal">
              <strong>Human approval required:</strong> This case requires manual
              review before financial settlement or formal mediation execution.
              VelaPal AI operates strictly as an advisory assistant and does not
              issue binding determinations of fault.
            </p>
          </div>
        )}
      </section>

      {/* 3. Uncertainty & Evidence Ambiguities */}
      {a.uncertainty && (
        <div className="rounded-xl border border-amber-200/90 bg-amber-50/60 p-4 text-sm text-amber-950 flex items-start gap-3 shadow-2xs">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="font-semibold text-amber-900 text-xs uppercase tracking-wider">
              Identified Ambiguities & Uncertainty
            </h4>
            <p className="leading-relaxed text-amber-900/90 text-sm">
              {a.uncertainty}
            </p>
          </div>
        </div>
      )}

      {/* 4. Qualitative Evidence Alignment */}
      {a.partyAssessment && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-indigo-600 shrink-0" />
              <div>
                <h3 className="font-semibold text-slate-900">
                  Evidence Alignment Analysis
                </h3>
                <p className="text-[11px] text-slate-500">
                  Qualitative evaluation of customer vs. seller account support
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                  a.partyAssessment.indication === "CUSTOMER_SUPPORTED"
                    ? "bg-blue-50 text-blue-700 border-blue-200"
                    : a.partyAssessment.indication === "SELLER_SUPPORTED"
                      ? "bg-purple-50 text-purple-700 border-purple-200"
                      : "bg-amber-50 text-amber-800 border-amber-200"
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {a.partyAssessment.indication === "CUSTOMER_SUPPORTED"
                  ? "Customer account better supported"
                  : a.partyAssessment.indication === "SELLER_SUPPORTED"
                    ? "Seller account better supported"
                    : "Inconclusive indication"}
              </span>

              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                Confidence:{" "}
                <strong className="font-semibold">
                  {a.partyAssessment.confidence}
                </strong>
              </span>
            </div>
          </div>

          <div className="rounded-lg bg-slate-50/80 p-3.5 border border-slate-200/60">
            <h4 className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-1">
              Assessment Rationale
            </h4>
            <p className="text-sm text-slate-800 leading-relaxed">
              {a.partyAssessment.rationale}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 pt-1">
            <QuotedEvidence
              title="Supporting Evidence"
              items={a.partyAssessment.supportingEvidence}
              type="supporting"
              onSource={onSource}
            />
            <QuotedEvidence
              title="Contrary Evidence"
              items={a.partyAssessment.contraryEvidence}
              type="contrary"
              onSource={onSource}
            />
          </div>

          <p className="text-[11px] text-slate-500 italic pt-1 border-t border-slate-100">
            Note: This is a qualitative evidence signal, not a probability
            calculation, legal finding of guilt, or binding dispute judgment.
          </p>
        </section>
      )}

      {/* 5. Findings & Conflicting Claims */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-slate-600" />
          <h3 className="font-semibold text-slate-900">
            Findings & Conflicting Claims
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            ({a.findings?.length ?? 0})
          </span>
        </div>

        {a.findings?.length ? (
          <div className="grid gap-3">
            {a.findings.map((f, i) => {
              const kind = f.kind?.toUpperCase() ?? "OBSERVATION";
              const isConflict = kind === "CONFLICT";
              const isGap = kind === "GAP";

              return (
                <div
                  key={f.findingId || i}
                  className={`rounded-xl border p-4 bg-white shadow-2xs space-y-2.5 transition ${
                    isConflict
                      ? "border-rose-200 hover:border-rose-300"
                      : isGap
                        ? "border-amber-200 hover:border-amber-300"
                        : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        isConflict
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : isGap
                            ? "bg-amber-50 text-amber-800 border-amber-200"
                            : "bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      {isConflict && (
                        <AlertCircle className="w-3 h-3 text-rose-500" />
                      )}
                      {isGap && (
                        <HelpCircle className="w-3 h-3 text-amber-600" />
                      )}
                      {!isConflict && !isGap && (
                        <Info className="w-3 h-3 text-slate-500" />
                      )}
                      {kind}
                    </span>
                    {f.findingId && (
                      <span className="font-mono text-[11px] text-slate-400">
                        {f.findingId}
                      </span>
                    )}
                  </div>

                  <FormattedAssessmentText text={f.text} />
                  <Citations refs={f.sourceRefs ?? []} onSource={onSource} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            No conflicting findings identified.
          </p>
        )}
      </section>

      {/* 6. Verified Facts */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <h3 className="font-semibold text-slate-900">Verified Facts</h3>
          <span className="text-xs text-slate-400 font-mono">
            ({a.verifiedFacts?.length ?? 0})
          </span>
        </div>

        {a.verifiedFacts?.length ? (
          <div className="grid gap-3">
            {a.verifiedFacts.map((f, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2 hover:border-slate-300 transition"
              >
                <FormattedAssessmentText text={f.text} />
                <Citations refs={f.sourceRefs ?? []} onSource={onSource} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            No verified facts returned.
          </p>
        )}
      </section>

      {/* 7. Party Claims & Statements */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <User className="w-4 h-4 text-blue-600" />
          <h3 className="font-semibold text-slate-900">
            Party Claims & Statements
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            ({a.claims?.length ?? 0})
          </span>
        </div>

        {a.claims?.length ? (
          <div className="grid gap-3">
            {a.claims.map((c, i) => {
              const isCustomer = c.party === "CUSTOMER";
              const cleanedText = c.text
                ? c.text.replace(/^(CUSTOMER|SELLER):\s*/i, "").trim()
                : "No statement provided.";

              return (
                <div
                  key={i}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-2.5 hover:border-slate-300 transition"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-semibold border ${
                        isCustomer
                          ? "bg-blue-50 text-blue-700 border-blue-200"
                          : "bg-purple-50 text-purple-700 border-purple-200"
                      }`}
                    >
                      {isCustomer ? (
                        <User className="w-3.5 h-3.5 text-blue-500" />
                      ) : (
                        <Store className="w-3.5 h-3.5 text-purple-500" />
                      )}
                      {c.party} STATEMENT
                    </span>
                  </div>

                  <p className="text-sm text-slate-800 leading-relaxed italic">
                    “{cleanedText}”
                  </p>

                  <Citations refs={c.sourceRefs ?? []} onSource={onSource} />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500 italic rounded-lg border border-slate-100 bg-slate-50/50 p-3">
            No party claims on record.
          </p>
        )}
      </section>

      {/* 8. Missing Evidence Checklist */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-amber-600" />
          <h3 className="font-semibold text-slate-900">
            Missing Evidence & Outstanding Items
          </h3>
          <span className="text-xs text-slate-400 font-mono">
            ({a.missingEvidence?.length ?? 0})
          </span>
        </div>

        {a.missingEvidence?.length ? (
          <ul className="space-y-2">
            {a.missingEvidence.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-sm text-slate-800 bg-white border border-slate-200/80 rounded-lg p-3 shadow-2xs"
              >
                <span className="grid place-items-center size-5 rounded-full bg-amber-100 text-amber-800 font-bold text-xs shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span className="leading-normal">{item}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 italic">
            No further evidence requested by this run.
          </p>
        )}
      </section>

      {/* 9. Policy References & Governance Footer */}
      <footer className="pt-3 border-t border-slate-200 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Policy references:</span>
            {a.policyReferences?.length ? (
              a.policyReferences.map((p, idx) => (
                <span
                  key={idx}
                  className="font-mono text-[11px] bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded"
                >
                  {p}
                </span>
              ))
            ) : (
              <span className="italic text-slate-400">None specified</span>
            )}
          </div>

          {a.counters && (
            <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
              <span title="Generative API calls">
                Calls: {a.counters.generativeCalls}
              </span>
              <span>·</span>
              <span title="Retrieved Chunks">
                Chunks: {a.counters.retrievedChunks}
              </span>
              <span>·</span>
              <span title="Run Latency">{a.counters.elapsedMs}ms</span>
            </div>
          )}
        </div>
      </footer>
    </div>
  );
}
