"use client";
import type { AssessmentCitation, LatestAssessment, SourceRef } from "@/services/contracts/types";
import { Badge } from "@/components/ui/workflow";
function Citations({
  refs,
  onSource,
}: {
  refs: SourceRef[];
  onSource?: (id: string) => void;
}) {
  return (
    <span className="mt-1 flex flex-wrap gap-2">
      {(refs ?? []).map((r, i) => (
        <a
          className="vp-link !min-h-8 break-all !text-xs"
          key={i}
          href={`#source-${r.sourceId}`}
          onClick={(e) => {
            if (onSource) {
              e.preventDefault();
              onSource(r.sourceId);
            }
          }}
        >
          {r.sourceId} · v{r.version} · {r.locator}
        </a>
      ))}
    </span>
  );
}
function QuotedEvidence({
  title,
  items,
  onSource,
}: {
  title: string;
  items: AssessmentCitation[];
  onSource?: (id: string) => void;
}) {
  return (
    <div>
      <h4 className="font-medium">{title}</h4>
      {items.length ? (
        <ul className="mt-2 space-y-2">
          {items.map((item, index) => (
            <li key={`${item.sourceId}-${item.version}-${index}`} className="rounded-lg bg-white p-3">
              <blockquote>“{item.quote}”</blockquote>
              <Citations refs={[item]} onSource={onSource} />
            </li>
          ))}
        </ul>
      ) : <p className="mt-1 text-slate-500">No cited evidence in this category.</p>}
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
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap gap-2">
        <Badge>{a.status}</Badge>
        <Badge>{a.modelMode === "live" ? "Live AI" : "Simulated AI"}</Badge>
        <Badge>Input v{a.inputVersion}</Badge>
      </div>
      <p className="rounded-xl bg-amber-50 p-3 text-amber-900">
        Uncertainty: {a.uncertainty}
      </p>
      {a.partyAssessment && (
        <section className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Evidence assessment · advisory</h3>
            <Badge>
              {a.partyAssessment.indication === "CUSTOMER_SUPPORTED"
                ? "Customer account better supported"
                : a.partyAssessment.indication === "SELLER_SUPPORTED"
                  ? "Seller account better supported"
                  : "Inconclusive"}
            </Badge>
            <Badge>{a.partyAssessment.confidence} qualitative confidence</Badge>
          </div>
          <p>{a.partyAssessment.rationale}</p>
          <QuotedEvidence
            title="Evidence supporting this indication"
            items={a.partyAssessment.supportingEvidence}
            onSource={onSource}
          />
          <QuotedEvidence
            title="Contrary evidence"
            items={a.partyAssessment.contraryEvidence}
            onSource={onSource}
          />
          <p className="text-xs text-slate-600">
            This is a qualitative evidence signal, not a probability, finding of guilt, or binding decision.
          </p>
        </section>
      )}
      {[
        ["Verified facts", a.verifiedFacts],
        ["Party claims", a.claims],
        ["Findings & conflicting claims", a.findings],
      ].map(([title, items]) => (
        <div key={String(title)}>
          <h3 className="font-semibold">{String(title)}</h3>
          <ul className="mt-2 space-y-3">
            {((items as typeof a.verifiedFacts | undefined) ?? []).map((f, i) => (
              <li key={i}>
                {"party" in f && <strong>{String(f.party)}: </strong>}
                {f.text ?? "No details supplied."}
                <Citations refs={f.sourceRefs ?? []} onSource={onSource} />
              </li>
            ))}
          </ul>
          {!(items as unknown[] | undefined)?.length && (
            <p className="text-slate-500">None returned.</p>
          )}
        </div>
      ))}
      <div>
        <h3 className="font-semibold">Missing evidence</h3>
        {a.missingEvidence?.length ? (
          <ul className="mt-2 list-inside list-disc">
            {(a.missingEvidence ?? []).map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        ) : (
          <p>No further evidence requested by this run.</p>
        )}
      </div>
      <p>
        <strong>Advisory recommendation:</strong>{" "}
        {a.recommendation || a.nextStep?.replaceAll("_", " ") || "Unknown"}
      </p>
      <p>
        Policy references: {(a.policyReferences ?? []).join(", ") ||
          "None supplied"}
      </p>
      {a.requiresHumanApproval && (
        <p className="text-amber-800">
          Human review is required. AI does not determine fault.
        </p>
      )}
    </div>
  );
}
