"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowRight,
  Cloud,
  FileText,
  HardDrive,
  Plus,
  Users,
  Wallet,
  ChartNoAxesCombined,
} from "lucide-react";
import { useSession } from "@/features/auth/session";
import { transactionsService } from "@/services/contracts/transactions.service";
import { useCases } from "@/features/disputes/hooks";
import { Panel, ErrorNotice, useAction } from "@/components/ui/workflow";
import StatCard from "@/components/ui/stat-card";
import {
  AdminDialog,
  AdminBadge,
  AdminNotice,
  AdminTable,
  AdminSearch,
  ExportButton,
  exportCsv,
} from "@/features/admin/admin-ui";
import { formatMoney } from "@/lib/format";
import type { Transaction } from "@/services/contracts/types";
import { moneyFromDollars, type PreviewProduct } from "./preview-state";
import { useWorkspacePreview } from "./use-workspace-preview";
import {
  WorkspaceHeading,
  PreviewDisclosure,
  UnavailablePreview,
  PartySecurity,
} from "./shared";
function useMerchantTransactions() {
  const { session } = useSession();
  return useSWR(
    session?.activeWorkspace.type === "SELLER"
      ? [session.activeWorkspace.id, "seller-payments"]
      : null,
    () => transactionsService.list(),
  );
}
export function SellerProducts() {
  const { state, enabled, role, commit } = useWorkspacePreview();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const [edit, setEdit] = useState<PreviewProduct | null>(null);
  const [price, setPrice] = useState("");
  const [archive, setArchive] = useState<PreviewProduct | null>(null);
  const action = useAction();
  const rows = state.products.filter(
    (p) =>
      (status === "All" || p.status === status) &&
      `${p.name} ${p.variant} ${p.sku}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (role !== "SELLER")
    return <p role="alert">A Seller workspace is required.</p>;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow={state.business.name.toUpperCase()}
        title="Products & services"
        copy="Keep your catalogue clear. Existing purchase agreements never change."
        action={
          <button
            className="vp-button"
            disabled={!enabled}
            onClick={() => {
              setEdit({
                id: crypto.randomUUID(),
                name: "",
                variant: "",
                sku: "",
                type: "physical",
                amountMinor: 0,
                status: "Published",
              });
              setPrice("");
            }}
          >
            <Plus size={15} />
            Add product
          </button>
        }
      />
      {!enabled ? (
        <UnavailablePreview />
      ) : (
        <>
          <PreviewDisclosure />
          <div className="vp-admin-filters">
            <AdminSearch
              label="Search products or SKU…"
              value={query}
              onChange={setQuery}
            />
            <select
              className="vp-input"
              aria-label="Product status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {["All", "Published", "Archived"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="vp-seller-products">
            {rows.map((p) => (
              <article className="vp-panel" key={p.id}>
                <header>
                  <span className={`vp-seller-product-icon is-${p.type}`}>
                    {p.type === "physical" ? (
                      <HardDrive size={25} />
                    ) : p.type === "digital" ? (
                      <FileText size={25} />
                    ) : (
                      <Cloud size={25} />
                    )}
                  </span>
                  <AdminBadge>{p.status}</AdminBadge>
                </header>
                <h2>{p.name}</h2>
                <p>{p.variant}</p>
                <strong>
                  {formatMoney(p.amountMinor)}
                  <small>{p.type === "subscription" ? "/ month" : "USD"}</small>
                </strong>
                <footer>
                  <button
                    className="vp-link"
                    onClick={() => {
                      setEdit({ ...p });
                      setPrice((p.amountMinor / 100).toFixed(2));
                    }}
                  >
                    Edit details
                    <ArrowRight size={13} />
                  </button>
                  <button className="vp-link" onClick={() => setArchive(p)}>
                    {p.status === "Published" ? "Archive" : "Publish"}
                  </button>
                </footer>
              </article>
            ))}
          </div>
          {rows.length === 0 && (
            <p className="vp-panel vp-empty-note">
              No products match this view.
            </p>
          )}
          <AdminNotice>
            Catalogue preview changes affect future demo records only. They
            never rewrite an approved API purchase snapshot or the API
            catalogue.
          </AdminNotice>
          {action.feedback}
          {edit && (
            <AdminDialog
              title={
                state.products.some((p) => p.id === edit.id)
                  ? "Edit product details"
                  : "Add a product"
              }
              onClose={() => setEdit(null)}
            >
              <form
                className="vp-auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(async () => {
                    commit({
                      kind: "product",
                      product: {
                        ...edit,
                        amountMinor: moneyFromDollars(price),
                      },
                    });
                    setEdit(null);
                  }, "Product saved in the local catalogue preview.");
                }}
              >
                {[
                  ["name", "Product name"],
                  ["variant", "Variant or plan"],
                  ["sku", "SKU"],
                ].map(([key, label]) => (
                  <label className="vp-label" key={key}>
                    {label}
                    <input
                      className="vp-input"
                      required
                      maxLength={120}
                      value={edit[key as "name" | "variant" | "sku"]}
                      onChange={(e) =>
                        setEdit({ ...edit, [key]: e.target.value })
                      }
                    />
                  </label>
                ))}
                <label className="vp-label">
                  Price · USD
                  <input
                    className="vp-input"
                    inputMode="decimal"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                  />
                </label>
                <label className="vp-label">
                  Type
                  <select
                    className="vp-input"
                    value={edit.type}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        type: e.target.value as PreviewProduct["type"],
                      })
                    }
                  >
                    {["physical", "digital", "subscription"].map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="vp-intake-actions">
                  <button
                    type="button"
                    className="vp-secondary"
                    onClick={() => setEdit(null)}
                  >
                    Cancel
                  </button>
                  <button className="vp-button" disabled={action.busy}>
                    Save product
                  </button>
                </div>
                {action.feedback}
              </form>
            </AdminDialog>
          )}
          {archive && (
            <AdminDialog
              title={
                archive.status === "Published"
                  ? "Archive product"
                  : "Publish product"
              }
              onClose={() => setArchive(null)}
            >
              <p className="vp-admin-dialog-copy">
                {archive.name} · {archive.sku}. This changes the local catalogue
                preview. Existing purchase agreements remain unchanged.
              </p>
              <div className="vp-intake-actions">
                <button
                  className="vp-secondary"
                  onClick={() => setArchive(null)}
                >
                  Go back
                </button>
                <button
                  className="vp-button"
                  onClick={() =>
                    void action.run(async () => {
                      commit({ kind: "archive", id: archive.id });
                      setArchive(null);
                    }, "Product status updated in preview.")
                  }
                >
                  Confirm{" "}
                  {archive.status === "Published" ? "archive" : "publication"}
                </button>
              </div>
            </AdminDialog>
          )}
        </>
      )}
    </div>
  );
}
function OrderPreview({
  transaction,
  onClose,
}: {
  transaction: Transaction;
  onClose: () => void;
}) {
  const { state, enabled, commit } = useWorkspacePreview();
  const [status, setStatus] = useState<"Shipped" | "Delivered">(
    state.fulfilment[transaction.id]?.status ?? "Shipped",
  );
  const [tracking, setTracking] = useState(
    state.fulfilment[transaction.id]?.tracking ?? "",
  );
  const [reviewed, setReviewed] = useState(false);
  const action = useAction();
  return (
    <AdminDialog title={`Order · ${transaction.orderId}`} onClose={onClose}>
      <dl className="vp-admin-review">
        {[
          ["Transaction", transaction.id],
          ["Merchant", transaction.merchantName],
          [
            "Payment",
            `${formatMoney(transaction.amountMinor)} · ${transaction.paymentStatus}`,
          ],
          [
            "Fulfilment",
            state.fulfilment[transaction.id]
              ? `${state.fulfilment[transaction.id].status} · preview`
              : "Not supplied by API",
          ],
        ].map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <AdminNotice>
        Shipping does not change payment or dispute status. The saved agreement
        remains unchanged.
      </AdminNotice>
      {!["PAID", "PARTIALLY_REFUNDED"].includes(transaction.paymentStatus) && (
        <AdminNotice>
          Do not fulfil this order on an unconfirmed or refunded payment. Check
          the authorized payment record before shipping or granting content
          access.
        </AdminNotice>
      )}
      <Link
        className="vp-link"
        href={`/workspace/transactions/${transaction.id}`}
      >
        View authorized record and agreement
        <ArrowRight size={14} />
      </Link>
      {enabled &&
        ["PAID", "PARTIALLY_REFUNDED"].includes(transaction.paymentStatus) && (
          <form
            className="vp-auth-form vp-order-preview-form"
            onSubmit={(e) => {
              e.preventDefault();
              void action.run(
                async () =>
                  commit({
                    kind: "fulfilment",
                    paymentStatus: transaction.paymentStatus,
                    orderId: transaction.id,
                    status,
                    tracking,
                    consent: reviewed,
                  }),
                "Local fulfilment preview saved. API payment status is unchanged.",
              );
            }}
          >
            <p className="vp-eyebrow">FULFILMENT PREVIEW</p>
            <label className="vp-label">
              Fulfilment status
              <select
                className="vp-input"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
              >
                <option>Shipped</option>
                <option>Delivered</option>
              </select>
            </label>
            <label className="vp-label">
              Tracking reference
              <input
                className="vp-input"
                required={status === "Shipped"}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
              />
            </label>
            <label className="vp-consent-label">
              <input
                type="checkbox"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              I reviewed this order. Save fulfilment as a local preview only.
            </label>
            <button className="vp-button" disabled={!reviewed || action.busy}>
              Save fulfilment preview
            </button>
            {action.feedback}
          </form>
        )}
    </AdminDialog>
  );
}
export function SellerOrders() {
  const { role, state } = useWorkspacePreview();
  const data = useMerchantTransactions();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("All");
  const [selected, setSelected] = useState<Transaction | null>(null);
  const rows = (data.data?.items ?? []).filter(
    (t) =>
      (filter === "All" ||
        state.fulfilment[t.id]?.status === filter ||
        (filter === "Not supplied" && !state.fulfilment[t.id])) &&
      `${t.id} ${t.orderId} ${t.merchantName}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  if (role !== "SELLER")
    return <p role="alert">A Seller workspace is required.</p>;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="VELA MARKET"
        title="Orders"
        copy="Follow every order from payment to delivery."
      />
      <div className="vp-admin-filters">
        <AdminSearch label="Search orders…" value={query} onChange={setQuery} />
        <select
          className="vp-input"
          aria-label="Order status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          {["All", "Not supplied", "Shipped", "Delivered"].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <ErrorNotice error={data.error} />
      {data.isLoading && <p role="status">Loading authorized orders...</p>}
      <AdminTable
        headers={[
          "Order / reference",
          "Payment state",
          "Amount",
          "Fulfilment",
          "Next step",
        ]}
      >
        {rows.map((t) => (
          <tr key={t.id}>
            <td>
              <strong>{t.orderId}</strong>
              <small>
                {t.id} · {t.merchantName}
              </small>
            </td>
            <td>
              <AdminBadge>{t.paymentStatus}</AdminBadge>
            </td>
            <td>{formatMoney(t.amountMinor, t.currency)}</td>
            <td>
              {state.fulfilment[t.id]
                ? `${state.fulfilment[t.id].status} · preview`
                : "Not supplied by API"}
            </td>
            <td>
              <button className="vp-link" onClick={() => setSelected(t)}>
                Open order
                <ArrowRight size={13} />
              </button>
            </td>
          </tr>
        ))}
        {data.data && rows.length === 0 && (
          <tr>
            <td colSpan={5} className="vp-empty-note">
              No orders match this view.
            </td>
          </tr>
        )}
      </AdminTable>
      <AdminNotice>
        Payment records come from your authorized API scope. Fulfilment changes
        are a separate local preview; shipment never proves payment.
      </AdminNotice>
      {selected && (
        <OrderPreview
          key={selected.id}
          transaction={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
export function SellerPayments({ insights = false }: { insights?: boolean }) {
  const { role } = useWorkspacePreview();
  const data = useMerchantTransactions();
  const all = data.data?.items ?? [];
  const paid = all.filter((t) => t.paymentStatus === "PAID");
  const refunded = all.filter((t) => t.paymentStatus === "REFUNDED");
  const gross = paid.reduce((a, t) => a + t.amountMinor, 0);
  const buyers = new Set(paid.map((t) => t.customerId)).size;
  if (role !== "SELLER")
    return <p role="alert">A Seller workspace is required.</p>;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="VELA MARKET"
        title={insights ? "Customer insights" : "Payments"}
        copy={
          insights
            ? "Useful patterns from this merchant’s records, without exposing personal profiles."
            : "Payment records and fulfilment stay separate."
        }
        action={
          <ExportButton
            label={insights ? "Export report" : "Export CSV"}
            onClick={() =>
              insights
                ? exportCsv(
                    "velapal-merchant-report.csv",
                    ["Metric", "Value"],
                    [
                      ["Paying customers", buyers],
                      ["Gross paid USD", (gross / 100).toFixed(2)],
                      ["Refunded transactions", refunded.length],
                    ],
                  )
                : exportCsv(
                    "velapal-merchant-payments.csv",
                    [
                      "Transaction",
                      "Order",
                      "State",
                      "Amount USD",
                      "Verification UTC",
                    ],
                    all.map((t) => [
                      t.id,
                      t.orderId,
                      t.paymentStatus,
                      (t.amountMinor / 100).toFixed(2),
                      t.verifiedAt ?? "Not supplied",
                    ]),
                  )
            }
          />
        }
      />
      <ErrorNotice error={data.error} />
      {data.isLoading && (
        <p role="status">Loading authorized payment records...</p>
      )}
      <div className="vp-metrics-grid vp-case-metrics">
        <StatCard
          label={insights ? "Paying customers" : "Gross paid"}
          value={
            data.data
              ? insights
                ? String(buyers).padStart(2, "0")
                : formatMoney(gross)
              : "—"
          }
          description={
            insights
              ? "Distinct buyers in authorized records"
              : "Before fees · API paid records"
          }
          icon={insights ? Users : Wallet}
        />
        <StatCard
          label={insights ? "Average paid order" : "Recorded refunds"}
          value={
            data.data
              ? insights
                ? formatMoney(paid.length ? Math.round(gross / paid.length) : 0)
                : formatMoney(refunded.reduce((a, t) => a + t.amountMinor, 0))
              : "—"
          }
          description={
            insights
              ? "Gross paid / paid transactions"
              : "Recorded refunded transactions"
          }
          icon={ChartNoAxesCombined}
        />
        <StatCard
          label={insights ? "Refunded transactions" : "Settlement"}
          value={insights ? String(refunded.length) : "Not supplied"}
          description={
            insights
              ? "Count, not a fraud score"
              : "Not a PayPal balance or payout report"
          }
          icon={Wallet}
        />
      </div>
      {insights ? (
        <>
          <Panel title="Sales in the current dataset">
            <p className="vp-section-description">
              Paid amounts by merchant. Product-type breakdown is unavailable
              until product references are supplied by the API.
            </p>
            <div className="vp-merchant-funnel">
              <div>
                <span>Paid</span>
                <div>
                  <i style={{ width: paid.length ? "100%" : "0%" }} />
                </div>
                <strong>{formatMoney(gross)}</strong>
              </div>
            </div>
          </Panel>
          <AdminNotice>
            Only this merchant’s aggregate data is shown. Cross-merchant
            customer profiling is outside this scope.
          </AdminNotice>
        </>
      ) : (
        <AdminTable
          headers={["Transaction", "Order", "State", "Amount", "Detail"]}
        >
          {all.map((t) => (
            <tr key={t.id}>
              <td>
                <strong>{t.id}</strong>
                <small>{t.verifiedAt ?? "Not verified"}</small>
              </td>
              <td>{t.orderId}</td>
              <td>
                <AdminBadge>{t.paymentStatus}</AdminBadge>
              </td>
              <td>{formatMoney(t.amountMinor, t.currency)}</td>
              <td>
                <Link
                  className="vp-link"
                  href={`/workspace/transactions/${t.id}`}
                >
                  View record
                  <ArrowRight size={13} />
                </Link>
              </td>
            </tr>
          ))}
          {data.data && all.length === 0 && (
            <tr>
              <td colSpan={5} className="vp-empty-note">
                No authorized payment records.
              </td>
            </tr>
          )}
        </AdminTable>
      )}
    </div>
  );
}
export function SellerAssistant() {
  const { role, enabled } = useWorkspacePreview();
  const data = useMerchantTransactions();
  const cases = useCases();
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState("");
  if (role !== "SELLER")
    return <p role="alert">A Seller workspace is required.</p>;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="VELA MARKET"
        title="A little help for your business."
        copy="Prepare a next step from the information you are allowed to see."
      />
      {enabled ? (
        <>
          <PreviewDisclosure />
          <Panel title="What needs your attention?">
            <p className="vp-section-description">
              Summarize orders or prepare a customer-friendly response. Review
              every draft before sharing.
            </p>
            <div className="vp-settings-actions">
              {[
                "Summarize pending orders",
                "Help me respond to the dispute",
                "Review subscriptions",
              ].map((p) => (
                <button
                  className="vp-secondary"
                  key={p}
                  onClick={() => setPrompt(p)}
                >
                  {p}
                </button>
              ))}
            </div>
            <form
              className="vp-auth-form vp-seller-assistant-form"
              onSubmit={(e) => {
                e.preventDefault();
                const unconfirmed =
                  data.data?.items?.filter(
                    (t) => t.paymentStatus === "UNCONFIRMED",
                  ).length ?? 0;
                setDraft(
                  `Scripted preparation preview. ${data.data?.items?.length ?? 0} authorized payment records; ${unconfirmed} unconfirmed payment(s); ${cases.data?.items?.length ?? 0} shared case(s). Review the relevant order and ask for clarification before assuming fault. No response has been sent. Your request: ${prompt.trim()}`,
                );
              }}
            >
              <label className="vp-label">
                Ask about your business
                <textarea
                  className="vp-input"
                  required
                  minLength={3}
                  maxLength={2000}
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                />
              </label>
              <button
                className="vp-button"
                disabled={!data.data || !!data.error}
              >
                Prepare a draft
              </button>
            </form>
            <ErrorNotice error={data.error} />
            {draft && (
              <div className="vp-seller-draft" role="status">
                {draft}
              </div>
            )}
          </Panel>
        </>
      ) : (
        <UnavailablePreview />
      )}
      <Panel title="Private Seller preparation">
        <p className="vp-section-description">
          Open an authorized case to use the existing private agent service with
          its evidence context. Nothing is shared without your review.
        </p>
        <Link className="vp-button" href="/workspace/cases">
          Choose a case
          <ArrowRight size={14} />
        </Link>
      </Panel>
    </div>
  );
}
export function SellerSettings() {
  const { state, role, enabled, commit } = useWorkspacePreview();
  const [name, setName] = useState(state.business.name);
  const [website, setWebsite] = useState(state.business.website);
  const [connect, setConnect] = useState(false);
  const action = useAction();
  if (role !== "SELLER")
    return <p role="alert">A Seller workspace is required.</p>;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="SELLER SETTINGS"
        title="Your business details"
        copy="Keep your customer-facing identity accurate."
      />
      {enabled ? (
        <>
          <PreviewDisclosure />
          <Panel title="Business profile">
            <form
              className="vp-auth-form vp-business-form"
              onSubmit={(e) => {
                e.preventDefault();
                void action.run(
                  async () => commit({ kind: "profile", name, website }),
                  "Business profile saved in local preview.",
                );
              }}
            >
              <label className="vp-label">
                Business display name
                <input
                  className="vp-input"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label className="vp-label">
                Website
                <input
                  className="vp-input"
                  type="url"
                  required
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                />
              </label>
              <button className="vp-button">Save business profile</button>
            </form>
            {action.feedback}
            <Link className="vp-link" href="/workspace/merchant-application">
              Review merchant application
              <ArrowRight size={14} />
            </Link>
          </Panel>
          <Panel title="PayPal for your business">
            <p className="vp-section-description">
              Authorize supported payment capabilities separately from VelaPal
              login.
            </p>
            <AdminBadge>Not connected</AdminBadge>
            <div className="mt-5">
              <button className="vp-secondary" onClick={() => setConnect(true)}>
                Preview authorization flow
                <ArrowRight size={14} />
              </button>
            </div>
          </Panel>
          {connect && (
            <AdminDialog
              title="Connect through PayPal"
              onClose={() => setConnect(false)}
            >
              <ol className="vp-admin-trace">
                <li>Server creates an official partner onboarding link.</li>
                <li>You review scopes and sign in on PayPal.</li>
                <li>VelaPal verifies merchant ID and granted capabilities.</li>
              </ol>
              <AdminNotice>
                No account is linked here. Partner access and merchant consent
                must be available before enabling payments.
              </AdminNotice>
              <button
                className="vp-secondary"
                onClick={() => setConnect(false)}
              >
                Understood
              </button>
            </AdminDialog>
          )}
        </>
      ) : (
        <UnavailablePreview />
      )}
      <PartySecurity />
    </div>
  );
}
