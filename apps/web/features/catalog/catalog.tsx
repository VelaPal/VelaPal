"use client";
import { useEffect, useState } from "react";
import useSWR from "swr";
import { transactionsService } from "@/services/contracts/transactions.service";
import { useSession } from "@/features/auth/session";
import { Panel, Badge, ErrorNotice, useAction } from "@/components/ui/workflow";
import { formatMoney, formatDate } from "@/lib/format";
import CheckoutPreview from "./checkout-preview";
import { useWorkspacePreview } from "@/features/workspace/use-workspace-preview";
import { moneyFromDollars } from "@/features/workspace/preview-state";
import { AdminSearch } from "@/features/admin/admin-ui";
import { workspaceService } from "@/services/contracts/workspace.service";
type Quote = Awaited<ReturnType<typeof transactionsService.quote>>;
export default function Catalog() {
  const { session } = useSession();
  const action = useAction();
  const preview = useWorkspacePreview();
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [limit, setLimit] = useState(
    ((preview.enabled ? preview.state.defaultLimitMinor : 7500) / 100).toFixed(
      2,
    ),
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const catalog = useSWR(
    session?.activeWorkspace.type === "CUSTOMER"
      ? [session.activeWorkspace.id, "catalog"]
      : null,
    () => transactionsService.catalog(),
  );
  const preferences = useSWR(
    session?.activeWorkspace.type === "CUSTOMER" && !preview.enabled
      ? [session.activeWorkspace.id, "workspace-preferences"]
      : null,
    workspaceService.preferences,
  );
  useEffect(() => {
    if (preferences.data) setLimit((preferences.data.defaultLimitMinor / 100).toFixed(2));
  }, [preferences.data]);
  if (session?.activeWorkspace.type !== "CUSTOMER")
    return (
      <p role="alert">Catalog checkout is available in Customer workspaces.</p>
    );
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Catalog & checkout</h1>
      <AdminSearch
        label="Search authorized products"
        value={query}
        onChange={setQuery}
      />
      <ErrorNotice error={catalog.error} />
      {catalog.isLoading && <p role="status">Loading catalog…</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {catalog.data?.items
          ?.filter((p) =>
            `${p.name} ${p.id}`.toLowerCase().includes(query.toLowerCase()),
          )
          ?.map((p) => (
            <Panel key={p.id} title={p.name}>
              <p className="mb-4 text-sm text-slate-500">
                Merchant {p.merchantId}
              </p>
              <div className="flex flex-wrap gap-3">
                {p.variants?.map((v) => (
                  <button
                    className={
                      selection === `${p.id}:${v.id}`
                        ? "vp-button"
                        : "vp-secondary"
                    }
                    key={v.id}
                    onClick={() => {
                      setSelection(`${p.id}:${v.id}`);
                      setQuote(null);
                    }}
                  >
                    {v.id} · {formatMoney(v.amountMinor, p.currency)}
                  </button>
                ))}
              </div>
            </Panel>
          ))}
      </div>
      {catalog.data?.items?.length === 0 && <p>No catalog items available.</p>}
      <Panel title="Purchase quote">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void action.run(async () => {
              const [productId, variantId] = selection.split(":");
              const q = Number(quantity),
                l = moneyFromDollars(limit);
              if (
                !Number.isSafeInteger(q) ||
                q < 1 ||
                !Number.isSafeInteger(l) ||
                l < 0
              )
                throw new Error(
                  "Use positive integer quantities and nonnegative integer minor units",
                );
              setQuote(
                await transactionsService.quote({
                  productId,
                  variantId,
                  quantity: q,
                  spendingLimitMinor: l,
                }),
              );
            }, "Quote received from the API.");
          }}
        >
          <p className="text-sm">
            Selected: {selection || "Choose a product variant above"}
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="vp-label">
              Quantity
              <input
                className="vp-input"
                type="number"
                min={1}
                step={1}
                required
                value={quantity}
                onChange={(e) => {
                  setQuantity(e.target.value);
                  setQuote(null);
                }}
              />
            </label>
            <label className="vp-label">
              Spending limit · USD
              <input
                className="vp-input"
                inputMode="decimal"
                required
                value={limit}
                onChange={(e) => {
                  setLimit(e.target.value);
                  setQuote(null);
                }}
              />
            </label>
          </div>
          <button className="vp-button" disabled={!selection || action.busy}>
            Get quote
          </button>
        </form>
        {quote && (
          <div className="mt-5 space-y-3 border-t border-slate-200 pt-5">
            <Badge>{quote.ruleResult}</Badge>
            <p className="text-2xl font-semibold">
              {formatMoney(quote.amountMinor, quote.currency)}
            </p>
            <p className="text-sm">
              Expires {formatDate(quote.expiresAt)} UTC · Quote v
              {quote.quoteVersion}
            </p>
            <CheckoutPreview
              key={quote.quoteId}
              quote={quote}
              selection={selection}
            />
            <p className="text-sm text-amber-800">
              Checkout submission is unavailable: the frozen contract describes
              the endpoint but does not define its request DTO or buyer approval
              response. No payment will be initiated here until Express
              publishes that handoff.
            </p>
          </div>
        )}
        <div className="mt-4">{action.feedback}</div>
      </Panel>
    </div>
  );
}
