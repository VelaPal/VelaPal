"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useSession } from "@/features/auth/session";
import { useCases } from "./hooks";
import { categories } from "./case-list";
import { transactionsService } from "@/services/contracts/transactions.service";
import { disputesService } from "@/services/contracts/disputes.service";
import type { DisputeCategory } from "@/services/contracts/types";
import { ErrorNotice, useAction } from "@/components/ui/workflow";
const labels: Record<DisputeCategory, string> = {
  ITEM_NOT_AS_DESCRIBED: "Item not as described",
  ITEM_NOT_RECEIVED: "Item not received",
  PAYMENT_NOT_CONFIRMED: "Payment not confirmed",
  FULFILMENT_OR_RETURN_ISSUE: "Fulfilment or return issue",
  BILLING_OR_RENEWAL_CONCERN: "Billing or renewal concern",
  CONTESTED_CLAIM: "Contested claim",
};
export default function CreateCase({
  initialTransaction = "",
}: {
  initialTransaction?: string;
}) {
  const { session } = useSession();
  const router = useRouter();
  const cases = useCases();
  const action = useAction();
  const transactions = useSWR(
    [session?.activeWorkspace.id, "intake-transactions"],
    () => transactionsService.list(),
  );
  const [transactionId, setTransaction] = useState(initialTransaction);
  const [category, setCategory] = useState<DisputeCategory>(
    "ITEM_NOT_AS_DESCRIBED",
  );
  const [statement, setStatement] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const key = useRef<{ body: string; key: string } | null>(null);
  if (session?.activeWorkspace.type === "ADMIN")
    return <Link href="/workspace/admin">Open Admin dispute queue</Link>;
  return (
    <div className="vp-create-case">
      <Link className="vp-back-link" href="/workspace/cases">
        <ArrowLeft size={14} />
        All disputes
      </Link>
      <header className="vp-page-heading">
        <div>
          <p className="vp-eyebrow">CREATE DISPUTE</p>
          <h1>Start with what happened.</h1>
          <p>
            Your opening statement starts a shared case. It does not establish
            fault or open an official PayPal dispute.
          </p>
        </div>
      </header>
      <div className="vp-intake-grid">
        <form
          className="vp-intake-form vp-panel"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reviewed || statement.trim().length < 20) return;
            void action.run(async () => {
              const body = {
                transactionId,
                orderId: null,
                category,
                statement: statement.trim(),
                audience: "CASE_SHARED" as const,
              };
              const serialized = JSON.stringify(body);
              if (key.current?.body !== serialized)
                key.current = { body: serialized, key: crypto.randomUUID() };
              const r = await disputesService.create(body, key.current.key);
              await cases.mutate();
              router.push(`/workspace/cases/${r.id}`);
            }, "");
          }}
        >
          <ErrorNotice error={transactions.error} />
          <label className="vp-label">
            Transaction or order
            <select
              className="vp-input"
              required
              value={transactionId}
              onChange={(e) => setTransaction(e.target.value)}
            >
              <option value="">Choose an authorized transaction</option>
              {transactions.data?.items?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {t.merchantName} · $
                  {(t.amountMinor / 100).toFixed(2)}
                </option>
              ))}
            </select>
          </label>
          <label className="vp-label">
            Reason for this report
            <select
              className="vp-input"
              value={category}
              onChange={(e) => setCategory(e.target.value as DisputeCategory)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {labels[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="vp-label">
            Your account of events
            <textarea
              className="vp-input"
              rows={6}
              required
              minLength={20}
              maxLength={5000}
              placeholder="Describe what you agreed to, what happened, and what you would like clarified."
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
            />
          </label>
          <p className="vp-form-note">
            At least 20 characters. Add private supporting evidence after
            opening the case.
          </p>
          <label className="vp-consent-label">
            <input
              type="checkbox"
              required
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
            />
            <span>
              I have reviewed this statement and agree to share it with the
              other party and authorized case reviewers.
            </span>
          </label>
          <div className="vp-intake-actions">
            <Link className="vp-secondary" href="/workspace/cases">
              Go back
            </Link>
            <button
              className="vp-button"
              disabled={
                action.busy ||
                !transactions.data ||
                !transactionId ||
                statement.trim().length < 20 ||
                !reviewed
              }
            >
              {action.busy ? "Submitting..." : "Submit dispute"}
              <ArrowRight size={14} />
            </button>
          </div>
          {action.feedback}
        </form>
        <aside>
          <section className="vp-panel vp-intake-next">
            <h2>What happens next</h2>
            <ol>
              <li>
                <strong>Intake starts automatically</strong>
                <p>Vela checks the linked record and classifies the issue.</p>
              </li>
              <li>
                <strong>Both parties are invited to respond</strong>
                <p>Statements remain claims until supported by evidence.</p>
              </li>
              <li>
                <strong>Mediation or human review</strong>
                <p>
                  Routine cases continue. Material conflicts go to a supervisor.
                </p>
              </li>
            </ol>
          </section>
          {process.env.NEXT_PUBLIC_API_MODE !== "api" && (
            <p className="vp-form-note">
              Demo: a scripted workflow runs locally. Files, AI requests, and
              payment-provider actions are not sent to external providers.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
