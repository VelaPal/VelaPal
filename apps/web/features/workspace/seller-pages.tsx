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
import { SellerOrders } from "./orders";

export { SellerOrders };

export function SellerProducts() {
  return <ApiSellerProducts />;
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
