"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Package,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { ErrorNotice } from "@/components/ui/workflow";
import { useSession } from "@/features/auth/session";
import { formatMoney, formatDate } from "@/lib/format";
import { transactionsService } from "@/services/contracts/transactions.service";
import type { PaymentStatus, Transaction } from "@/services/contracts/types";
import { WorkspaceHeading } from "./shared";

type StatusTab = "ALL" | "PAID" | "PENDING" | "REFUNDED";

function StatusPill({ status }: { status: PaymentStatus }) {
  switch (status) {
    case "PAID":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          Paid
        </span>
      );
    case "APPROVAL_PENDING":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-200">
          <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
          Approval Pending
        </span>
      );
    case "UNCONFIRMED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
          <span className="size-1.5 rounded-full bg-blue-500" />
          Unconfirmed
        </span>
      );
    case "PARTIALLY_REFUNDED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
          <span className="size-1.5 rounded-full bg-indigo-500" />
          Partially Refunded
        </span>
      );
    case "REFUNDED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          <span className="size-1.5 rounded-full bg-slate-500" />
          Refunded
        </span>
      );
    case "FAILED":
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
          <span className="size-1.5 rounded-full bg-rose-500" />
          Failed
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
          {status}
        </span>
      );
  }
}

export function SellerOrders() {
  const { session } = useSession();
  const role = session?.activeWorkspace.type;

  const result = useSWR("seller-orders", transactionsService.list);
  const rows = result.data?.items ?? [];

  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<StatusTab>("ALL");

  const headingConfig = useMemo(() => {
    if (role === "CUSTOMER") {
      return {
        eyebrow: "PURCHASES & ORDERS",
        title: "Orders",
        copy: "Track your checkout transactions, approval states, and PayPal records.",
      };
    }
    if (role === "ADMIN") {
      return {
        eyebrow: "GLOBAL COMMERCE",
        title: "All Orders",
        copy: "Platform-wide transaction records, provider captures, and settlement history.",
      };
    }
    return {
      eyebrow: "COMMERCE & SETTLEMENTS",
      title: "Orders",
      copy: "Manage customer checkouts, capture status, and PayPal fulfillment records.",
    };
  }, [role]);

  // Summary Metrics calculated cleanly from actual business data
  const metrics = useMemo(() => {
    const totalVolume = rows.reduce((sum, r) => sum + r.amountMinor, 0);
    const paidRows = rows.filter((r) => r.paymentStatus === "PAID");
    const paidVolume = paidRows.reduce((sum, r) => sum + r.amountMinor, 0);
    const pendingRows = rows.filter(
      (r) =>
        r.paymentStatus === "APPROVAL_PENDING" ||
        r.paymentStatus === "UNCONFIRMED",
    );
    const pendingVolume = pendingRows.reduce(
      (sum, r) => sum + r.amountMinor,
      0,
    );
    const refundedRows = rows.filter(
      (r) =>
        r.paymentStatus === "REFUNDED" ||
        r.paymentStatus === "PARTIALLY_REFUNDED",
    );
    const refundedVolume = refundedRows.reduce(
      (sum, r) => sum + (r.amountMinor - r.refundableRemainingMinor),
      0,
    );

    return {
      totalVolume,
      totalCount: rows.length,
      paidVolume,
      paidCount: paidRows.length,
      pendingVolume,
      pendingCount: pendingRows.length,
      refundedVolume: refundedVolume > 0 ? refundedVolume : 0,
      refundedCount: refundedRows.length,
    };
  }, [rows]);

  // Filtered rows
  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // Status filter
      if (activeTab === "PAID" && row.paymentStatus !== "PAID") return false;
      if (
        activeTab === "PENDING" &&
        row.paymentStatus !== "APPROVAL_PENDING" &&
        row.paymentStatus !== "UNCONFIRMED"
      )
        return false;
      if (
        activeTab === "REFUNDED" &&
        row.paymentStatus !== "REFUNDED" &&
        row.paymentStatus !== "PARTIALLY_REFUNDED"
      )
        return false;

      // Search filter
      if (!search.trim()) return true;
      const q = search.toLowerCase().trim();
      return (
        row.orderId.toLowerCase().includes(q) ||
        row.id.toLowerCase().includes(q) ||
        row.customerId.toLowerCase().includes(q) ||
        (row.paypalOrderId && row.paypalOrderId.toLowerCase().includes(q)) ||
        (row.paypalCaptureId && row.paypalCaptureId.toLowerCase().includes(q))
      );
    });
  }, [rows, activeTab, search]);

  return (
    <div className="space-y-6 max-w-7xl">
      <WorkspaceHeading
        eyebrow={headingConfig.eyebrow}
        title={headingConfig.title}
        copy={headingConfig.copy}
      />

      {result.error && <ErrorNotice error={result.error} />}

      {/* Metrics Ribbon */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Total Order Volume
            </span>
            <div className="grid place-items-center size-7 rounded-md bg-blue-50 text-blue-600">
              <DollarSign className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {formatMoney(metrics.totalVolume, "USD")}
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            {metrics.totalCount} orders placed
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Paid & Settled
            </span>
            <div className="grid place-items-center size-7 rounded-md bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {formatMoney(metrics.paidVolume, "USD")}
          </div>
          <p className="text-[11px] text-emerald-700 font-medium">
            {metrics.paidCount} confirmed captures
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Pending Capture
            </span>
            <div className="grid place-items-center size-7 rounded-md bg-amber-50 text-amber-600">
              <Clock className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {formatMoney(metrics.pendingVolume, "USD")}
          </div>
          <p className="text-[11px] text-amber-700 font-medium">
            {metrics.pendingCount} awaiting confirmation
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">
              Refunds / Reversals
            </span>
            <div className="grid place-items-center size-7 rounded-md bg-slate-100 text-slate-600">
              <RotateCw className="size-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tracking-tight">
            {formatMoney(metrics.refundedVolume, "USD")}
          </div>
          <p className="text-[11px] text-slate-500 font-mono">
            {metrics.refundedCount} transactions refunded
          </p>
        </div>
      </div>

      {/* Toolbar: Search + Filter Tabs + Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by Order ID, PayPal ID, customer..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 shadow-2xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Status Tabs & Refresh */}
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100/80 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("ALL")}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                activeTab === "ALL"
                  ? "bg-white text-slate-900 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              All ({rows.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("PAID")}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                activeTab === "PAID"
                  ? "bg-white text-emerald-800 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Paid ({metrics.paidCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("PENDING")}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                activeTab === "PENDING"
                  ? "bg-white text-amber-800 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pending ({metrics.pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("REFUNDED")}
              className={`px-3 py-1.5 rounded-md transition cursor-pointer ${
                activeTab === "REFUNDED"
                  ? "bg-white text-indigo-800 shadow-2xs font-semibold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Refunded ({metrics.refundedCount})
            </button>
          </div>

          <button
            type="button"
            title="Refresh orders"
            disabled={result.isValidating}
            onClick={() => void result.mutate()}
            className="grid place-items-center size-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition disabled:opacity-50 cursor-pointer shadow-2xs shrink-0"
          >
            <RotateCw
              className={`size-3.5 ${result.isValidating ? "animate-spin text-blue-600" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Main Orders Table */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-2xs overflow-hidden">
        {!result.data && !result.error ? (
          /* Loading Skeleton */
          <div className="p-6 space-y-4">
            <div className="h-4 w-48 bg-slate-100 rounded animate-pulse" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-12 w-full bg-slate-50 rounded-lg animate-pulse"
                />
              ))}
            </div>
          </div>
        ) : rows.length === 0 ? (
          /* Empty Workspace State */
          <div className="p-12 text-center space-y-3">
            <div className="grid place-items-center size-12 rounded-full bg-slate-100 text-slate-400 mx-auto">
              <Package className="size-6" />
            </div>
            <h3 className="font-semibold text-slate-800 text-base">
              No orders recorded yet
            </h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">
              Transactions created through PayPal Sandbox or your product catalog
              will automatically appear here.
            </p>
            <div className="pt-2">
              <Link href="/workspace/products" className="vp-button">
                Manage Products
              </Link>
            </div>
          </div>
        ) : filteredRows.length === 0 ? (
          /* Empty Filter State */
          <div className="p-10 text-center space-y-2.5">
            <div className="grid place-items-center size-10 rounded-full bg-slate-100 text-slate-400 mx-auto">
              <Search className="size-5" />
            </div>
            <h4 className="font-semibold text-slate-800 text-sm">
              No orders match your filter
            </h4>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              No transactions match &ldquo;{search}&rdquo; with the current
              status filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setActiveTab("ALL");
              }}
              className="vp-secondary !text-xs !py-1 !min-h-8"
            >
              Clear filters
            </button>
          </div>
        ) : (
          /* Populated Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Payment Status</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4">Channel & Reference</th>
                  <th className="py-3 px-4 text-right">Verified (UTC)</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row: Transaction) => (
                  <tr
                    key={row.id}
                    className="hover:bg-blue-50/25 transition-colors group"
                  >
                    {/* Order ID */}
                    <td className="py-3.5 px-4">
                      <Link
                        href={`/workspace/transactions/${encodeURIComponent(row.id)}`}
                        className="font-mono font-semibold text-slate-900 group-hover:text-blue-600 inline-flex items-center gap-1.5 transition-colors"
                      >
                        {row.orderId}
                        <ArrowUpRight className="size-3 text-slate-400 group-hover:text-blue-600 transition-colors opacity-70 group-hover:opacity-100" />
                      </Link>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {row.id}
                      </div>
                    </td>

                    {/* Customer */}
                    <td className="py-3.5 px-4">
                      <span
                        className="font-mono text-xs text-slate-700 bg-slate-100/70 px-1.5 py-0.5 rounded border border-slate-200/50"
                        title={row.customerId}
                      >
                        {row.customerId.length > 14
                          ? `${row.customerId.slice(0, 6)}…${row.customerId.slice(-4)}`
                          : row.customerId}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <StatusPill status={row.paymentStatus} />
                    </td>

                    {/* Amount */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="font-mono font-semibold text-slate-900 tabular-nums">
                        {formatMoney(row.amountMinor, row.currency)}
                      </div>
                      {row.refundableRemainingMinor < row.amountMinor && (
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                          Rem:{" "}
                          {formatMoney(
                            row.refundableRemainingMinor,
                            row.currency,
                          )}
                        </div>
                      )}
                    </td>

                    {/* Channel & Reference */}
                    <td className="py-3.5 px-4">
                      {row.paypalOrderId ? (
                        <div className="space-y-0.5">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 text-slate-700 border border-slate-200"
                            title={`PayPal Order: ${row.paypalOrderId}`}
                          >
                            PayPal: {row.paypalOrderId}
                          </span>
                          {row.paypalCaptureId && (
                            <div
                              className="text-[10px] text-slate-400 font-mono pl-1"
                              title={`Capture: ${row.paypalCaptureId}`}
                            >
                              Cap: {row.paypalCaptureId.slice(0, 14)}…
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">
                          Direct Express
                        </span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 text-right">
                      <time className="text-xs text-slate-600 tabular-nums whitespace-nowrap">
                        {formatDate(row.verifiedAt)}
                      </time>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <Link
                        href={`/workspace/transactions/${encodeURIComponent(row.id)}`}
                        className="inline-flex items-center justify-center size-8 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="View transaction details"
                      >
                        <ArrowRight className="size-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer */}
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-slate-50/50 border-t border-slate-200 text-xs text-slate-500">
            <span>
              Showing <strong>{filteredRows.length}</strong> of{" "}
              <strong>{rows.length}</strong> orders
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              Transaction records from the VelaPal API
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
