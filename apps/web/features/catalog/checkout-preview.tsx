"use client";

import { useState } from "react";
import { AdminDialog, AdminNotice } from "@/features/admin/admin-ui";
import { useAction } from "@/components/ui/workflow";
import { transactionsService } from "@/services/contracts/transactions.service";
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
  const action = useAction();

  return (
    <>
      <button className="vp-secondary" disabled={quote.ruleResult !== "READY"} onClick={() => { setOpen(true); setConsent(false); }}>
        Review checkout
      </button>
      {open && (
        <AdminDialog title="Review this purchase" onClose={() => setOpen(false)}>
          <dl className="vp-admin-review">
            {[
              ["Selected item", selection],
              ["Total", formatMoney(quote.amountMinor, quote.currency)],
              ["Quote", `${quote.quoteId} · v${quote.quoteVersion}`],
              ["Expires", `${formatDate(quote.expiresAt)} UTC`],
            ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <AdminNotice>The API will create an order and frozen purchase snapshot, then return the PayPal approval URL. Payment remains pending until PayPal confirms approval and capture.</AdminNotice>
          <label className="vp-consent-label">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            I reviewed this item, quote, amount and currency and want to continue to PayPal.
          </label>
          {action.feedback}
          <div className="vp-intake-actions">
            <button className="vp-secondary" onClick={() => setOpen(false)}>Go back</button>
            <button
              className="vp-button"
              disabled={!consent || action.busy}
              onClick={() => void action.run(async () => {
                if (Date.parse(quote.expiresAt) <= Date.now()) throw new Error("This quote expired. Request a fresh quote and review again.");
                const order = await transactionsService.createCheckoutOrder(
                  { quoteId: quote.quoteId, quoteVersion: quote.quoteVersion, consentAccepted: true },
                  crypto.randomUUID(),
                ) as { paypalOrder?: { approveUrl?: string | null } };
                if (!order.paypalOrder?.approveUrl) throw new Error("The API did not return a PayPal approval URL.");
                window.location.assign(order.paypalOrder.approveUrl);
              }, "Opening PayPal approval.")}
            >
              {action.busy ? "Creating order…" : "Continue to PayPal"}
            </button>
          </div>
        </AdminDialog>
      )}
    </>
  );
}
