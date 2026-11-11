"use client";

import useSWR from "swr";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Panel, ErrorNotice } from "@/components/ui/workflow";
import { formatMoney, formatDate } from "@/lib/format";
import { transactionsService } from "@/services/contracts/transactions.service";
import type { Transaction } from "@/services/contracts/types";
import {
  ApiSellerProducts,
  ApiSellerAssistant,
  ApiSellerSettings,
} from "./seller-api-pages";
import { WorkspaceHeading } from "./shared";

export function SellerProducts() {
  return <ApiSellerProducts />;
}

export function SellerOrders() {
  const result = useSWR("seller-orders", transactionsService.list);
  const rows = result.data?.items ?? [];

  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="SELLER PAYMENTS"
        title="Orders"
        copy="Review transaction records returned by the API."
      />
      {result.error && <ErrorNotice error={result.error} />}
      {!result.data ? (
        <Panel title="Loading orders"><p>Fetching API transactions…</p></Panel>
      ) : rows.length === 0 ? (
        <Panel title="No orders"><p>No transactions are available in this workspace.</p></Panel>
      ) : (
        <Panel title="Transactions">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr><th>Order</th><th>Payment status</th><th>Amount</th><th>Verified</th></tr></thead>
              <tbody>
                {rows.map((row: Transaction) => (
                  <tr key={row.id}>
                    <td><Link className="vp-link" href={`/workspace/transactions/${encodeURIComponent(row.id)}`}>{row.orderId}<ArrowRight size={13} /></Link></td>
                    <td>{row.paymentStatus}</td>
                    <td>{formatMoney(row.amountMinor, row.currency)}</td>
                    <td>{formatDate(row.verifiedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}

export function SellerPayments({ insights = false }: { insights?: boolean }) {
  const result = useSWR("seller-payments", transactionsService.list);
  const rows = result.data?.items ?? [];
  const paid = rows.filter((row) => row.paymentStatus === "PAID");
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading eyebrow="PAYMENT RECORDS" title={insights ? "Payment insights" : "Payments"} copy="Totals are calculated from API transaction records." />
      {result.error && <ErrorNotice error={result.error} />}
      {!result.data ? <Panel title="Loading payments"><p>Fetching API transactions…</p></Panel> : <Panel title="Confirmed payments"><strong>{formatMoney(paid.reduce((sum, row) => sum + row.amountMinor, 0))}</strong><p>{paid.length} paid transactions</p></Panel>}
    </div>
  );
}

export function SellerAssistant() {
  return <ApiSellerAssistant />;
}

export function SellerSettings() {
  return <ApiSellerSettings />;
}
