"use client";
import { useState } from "react";
import { AdminDialog, AdminNotice } from "@/features/admin/admin-ui";
import { formatMoney, formatDate } from "@/lib/format";
export type CheckoutQuote = {
  quoteId: string;
  amountMinor: number;
  currency: "USD";
  quoteVersion: number;
  expiresAt: string;
  ruleResult: string;
};
export default function CheckoutPreview({
  quote,
  selection,
}: {
  quote: CheckoutQuote;
  selection: string;
}) {
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState(false);
  const [step, setStep] = useState<
    "REVIEW" | "APPROVAL_PENDING" | "UNAVAILABLE" | "CANCELLED"
  >("REVIEW");
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="vp-secondary"
        disabled={quote.ruleResult !== "READY"}
        onClick={() => {
          setOpen(true);
          setConsent(false);
          setStep("REVIEW");
          setError("");
        }}
      >
        Review checkout preview
      </button>
      {open && (
        <AdminDialog
          title="Review this purchase"
          onClose={() => setOpen(false)}
        >
          <dl className="vp-admin-review">
            {[
              ["Selected item", selection],
              ["Total", formatMoney(quote.amountMinor, quote.currency)],
              ["Quote", `${quote.quoteId} · v${quote.quoteVersion}`],
              ["Expires", `${formatDate(quote.expiresAt)} UTC`],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
          <AdminNotice>
            Frontend review only. No checkout DTO or PayPal approval handoff is
            defined in the frozen contract. No payment or immutable server
            agreement is created here.
          </AdminNotice>
          {step === "REVIEW" ? (
            <>
              <label className="vp-consent-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I reviewed this exact item, quote, amount and currency. Preview
                the next approval step.
              </label>
              <div className="vp-intake-actions">
                <button className="vp-secondary" onClick={() => setOpen(false)}>
                  Go back
                </button>
                <button
                  className="vp-button"
                  disabled={!consent}
                  onClick={() => {
                    if (Date.parse(quote.expiresAt) <= Date.now()) {
                      setError(
                        "This quote expired. Request a fresh quote and review again.",
                      );
                      return;
                    }
                    setStep("APPROVAL_PENDING");
                  }}
                >
                  Preview provider approval
                </button>
              </div>
            </>
          ) : (
            <>
              <p role="status" className="vp-admin-dialog-copy">
                {step === "APPROVAL_PENDING"
                  ? "Provider approval required · preview only. No PayPal page was opened."
                  : step === "CANCELLED"
                    ? "Approval preview cancelled. Nothing was charged."
                    : "Provider handoff unavailable. No capture was requested and no payment is verified."}
              </p>
              {step === "APPROVAL_PENDING" && (
                <div className="vp-settings-actions">
                  <button
                    className="vp-secondary"
                    onClick={() => setStep("CANCELLED")}
                  >
                    Cancel approval preview
                  </button>
                  <button
                    className="vp-button"
                    onClick={() => setStep("UNAVAILABLE")}
                  >
                    Check provider availability
                  </button>
                </div>
              )}
            </>
          )}
          {error && (
            <p className="vp-field-error" role="alert">
              {error}
            </p>
          )}
        </AdminDialog>
      )}
    </>
  );
}
