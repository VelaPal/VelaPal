"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  Cloud,
  FileText,
  Repeat2,
  ShieldCheck,
} from "lucide-react";
import { useSession } from "@/features/auth/session";
import { Panel, useAction } from "@/components/ui/workflow";
import {
  AdminDialog,
  AdminBadge,
  AdminNotice,
} from "@/features/admin/admin-ui";
import { useWorkspacePreview } from "./use-workspace-preview";
import { moneyFromDollars } from "./preview-state";
import {
  WorkspaceHeading,
  PreviewDisclosure,
  UnavailablePreview,
  PartySecurity,
} from "./shared";
import {
  ApiSubscriptions,
  ApiDigitalLibrary,
  ApiNotifications,
  ApiCustomerSettings,
  ApiMerchantApplication,
} from "./customer-api-pages";
export function Subscriptions() {
  const { state, enabled, role, commit } = useWorkspacePreview();
  const [history, setHistory] = useState(true);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState("I no longer need this plan.");
  const [consent, setConsent] = useState(false);
  const action = useAction();
  const sub = state.subscription;
  const seller = role === "SELLER";
  if (role !== "CUSTOMER" && role !== "SELLER")
    return <p role="alert">Choose a personal or Seller workspace.</p>;
  if (!enabled) return <ApiSubscriptions seller={seller} />;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow={seller ? "VELA MARKET" : "MAKE ROOM FOR WHAT YOU USE"}
        title={seller ? "Subscriptions" : "Subscriptions, on your terms."}
        copy={
          seller
            ? "A clear view of the plans your customers have approved."
            : "See what’s coming up. Decide what stays."
        }
        action={
          !seller && (
            <Link className="vp-secondary" href="/workspace/assistant">
              Review with Vela
              <ArrowRight size={14} />
            </Link>
          )
        }
      />
      {!enabled ? (
        <UnavailablePreview />
      ) : (
        <>
          <PreviewDisclosure />
          {!seller && (
            <div className="vp-subscription-summary vp-panel">
              <div>
                <span>Monthly commitment</span>
                <strong>
                  {sub.status === "Active" ? "$12.00" : "$0.00"}
                  <small>USD / month</small>
                </strong>
              </div>
              <div>
                <span>Active plans</span>
                <strong>{sub.status === "Active" ? "01" : "00"}</strong>
              </div>
              <div>
                <span>Next renewal</span>
                <strong className="vp-summary-date">
                  {sub.status === "Active"
                    ? "Nov 03, 2026 · fixture"
                    : "No future renewal"}
                </strong>
              </div>
              <Repeat2 size={40} />
            </div>
          )}
          <div className={seller ? "" : "vp-subscription-layout"}>
            <div className="space-y-5">
              <section className="vp-subscription-card">
                <header>
                  <span className="vp-cloud-mark">
                    <Cloud size={26} />
                  </span>
                  <div>
                    <h2>Vela Cloud Plus</h2>
                    <p>
                      {seller
                        ? "Demo customer · Monthly membership"
                        : "Vela Market · 100 GB storage"}
                    </p>
                  </div>
                  <AdminBadge>{sub.status}</AdminBadge>
                  <strong>
                    $12.00<small>/ month</small>
                  </strong>
                </header>
                <dl>
                  <div>
                    <dt>{seller ? "Customer reminder" : "Next payment"}</dt>
                    <dd>
                      {seller
                        ? sub.reminder
                        : sub.status === "Active"
                          ? "$12.00 USD"
                          : "None after cancellation"}
                    </dd>
                  </div>
                  <div>
                    <dt>Billing date · fixture</dt>
                    <dd>November 3, 2026</dd>
                  </div>
                  <div>
                    <dt>Access available through · fixture</dt>
                    <dd>November 3, 2026</dd>
                  </div>
                </dl>
                <footer>
                  <span>
                    <ShieldCheck size={13} />
                    {seller
                      ? "Customer choices govern their plan."
                      : "You approve any change before it happens."}
                  </span>
                  {!seller && (
                    <button
                      className="vp-link"
                      disabled={sub.status === "Cancelled"}
                      onClick={() => {
                        setConsent(false);
                        setCancel(true);
                      }}
                    >
                      Cancel subscription
                      <ArrowUpRight size={13} />
                    </button>
                  )}
                </footer>
              </section>
              {!seller && sub.status === "Active" && (
                <section className="vp-renewal-card">
                  <Bell size={24} />
                  <div>
                    <h3>A heads-up before your next bill.</h3>
                    <p>
                      Vela Cloud Plus · November 3, 2026 · $12.00 USD. This is a
                      sample billing date.
                    </p>
                    {sub.reminder === "pending" ? (
                      <div className="vp-settings-actions">
                        <button
                          className="vp-secondary"
                          onClick={() =>
                            void action.run(
                              async () => commit({ kind: "keep" }),
                              "Your choice for this sample cycle was recorded.",
                            )
                          }
                        >
                          <Check size={13} />
                          Keep for this cycle
                        </button>
                        <button
                          className="vp-link"
                          onClick={() =>
                            void action.run(
                              async () => commit({ kind: "snooze" }),
                              "Reminder snoozed for 24 hours. Billing date unchanged.",
                            )
                          }
                        >
                          Remind me tomorrow
                        </button>
                      </div>
                    ) : (
                      <p role="status">
                        {sub.reminder === "kept"
                          ? "You chose to keep this sample cycle."
                          : `Reminder snoozed until ${new Date(sub.snoozedUntil!).toLocaleString()}. Billing date unchanged.`}
                      </p>
                    )}
                  </div>
                </section>
              )}
              {seller ? (
                <>
                  <AdminNotice>
                    User cancellation is available in the personal workspace. A
                    snoozed reminder does not change billing.
                  </AdminNotice>
                  <Link className="vp-link" href="/workspace/products">
                    Manage catalogue plans
                    <ArrowRight size={14} />
                  </Link>
                </>
              ) : (
                <section className="vp-panel">
                  <div className="vp-section-heading">
                    <h2>Billing history</h2>
                    <button
                      className="vp-link"
                      aria-expanded={history}
                      onClick={() => setHistory((v) => !v)}
                    >
                      {history ? "Hide history" : "Show history"}
                    </button>
                  </div>
                  {history && (
                    <div className="vp-billing-row">
                      <Cloud size={20} />
                      <div>
                        <strong>Vela Cloud Plus</strong>
                        <small>
                          Monthly membership · Oct 03, 2026 · fixture
                        </small>
                      </div>
                      <AdminBadge>Paid</AdminBadge>
                      <strong>$12.00</strong>
                    </div>
                  )}
                </section>
              )}
              {action.feedback}
            </div>
            {!seller && (
              <aside>
                <section className="vp-panel vp-renewal-aside">
                  <p className="vp-eyebrow">A CLEARER KIND OF CONTROL</p>
                  <h2>Reminders aren’t cancellations.</h2>
                  <p>
                    Snoozing changes when Vela reminds you. It doesn’t move a
                    bill or stop a payment.
                  </p>
                  <ul>
                    <li>Keep records your choice for this cycle.</li>
                    <li>Snooze delays the reminder by 24 hours.</li>
                    <li>Cancel stops future renewals after confirmation.</li>
                  </ul>
                </section>
                <p className="vp-form-note">
                  Only plans from your connected merchant appear here. This is
                  not a list of every subscription in your PayPal account.
                </p>
              </aside>
            )}
          </div>
          {cancel && (
            <AdminDialog
              title="Make room for something else?"
              onClose={() => setCancel(false)}
            >
              <strong>Vela Cloud Plus · $12.00 USD / month</strong>
              <p className="vp-admin-dialog-copy">
                Future renewals stop after cancellation is confirmed. You keep
                sample access through November 3, 2026. Previous charges are not
                automatically refunded.
              </p>
              <form
                className="vp-auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(async () => {
                    commit({ kind: "cancel", reason, consent });
                    setCancel(false);
                  }, "Demo cancellation confirmed. No real subscription was cancelled.");
                }}
              >
                <label className="vp-label">
                  Why are you cancelling?
                  <textarea
                    className="vp-input"
                    minLength={10}
                    required
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <label className="vp-consent-label">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                  />
                  I understand the effect on renewal and access, and want to
                  cancel this plan.
                </label>
                <p className="vp-form-note">
                  This changes demo data only. No real subscription is
                  cancelled.
                </p>
                <div className="vp-intake-actions">
                  <button
                    className="vp-secondary"
                    type="button"
                    onClick={() => setCancel(false)}
                  >
                    Keep my plan
                  </button>
                  <button
                    className="vp-button"
                    disabled={
                      !consent || reason.trim().length < 10 || action.busy
                    }
                  >
                    Confirm demo cancellation
                  </button>
                </div>
              </form>
            </AdminDialog>
          )}
        </>
      )}
    </div>
  );
}
export function DigitalLibrary() {
  const { enabled, role } = useWorkspacePreview();
  const [dialog, setDialog] = useState<"guide" | "agreement" | null>(null);
  if (role !== "CUSTOMER")
    return <p role="alert">A personal workspace is required.</p>;
  if (!enabled) return <ApiDigitalLibrary />;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="THE THINGS YOU’VE UNLOCKED"
        title="Your little library of possibilities."
        copy="Purchased content, ready when inspiration finds you."
      />
      {!enabled ? (
        <UnavailablePreview />
      ) : (
        <>
          <PreviewDisclosure />
          <AdminNotice>
            Sample entitlement linked to a fictional paid purchase. No
            additional payment required. Live access must be verified by the
            backend.
          </AdminNotice>
          <div className="vp-library-layout">
            <section className="vp-library-item">
              <div className="vp-book-stage">
                <div className="vp-book-cover">
                  <small>
                    VELA EDITIONS
                    <br />
                    VOL. 001
                  </small>
                  <strong>
                    The
                    <br />
                    Creator’s
                    <br />
                    Field
                    <br />
                    Guide
                  </strong>
                  <span>Make room for better ideas.</span>
                </div>
              </div>
              <div className="vp-library-description">
                <AdminBadge>Ready to open</AdminBadge>
                <h2>The Creator’s Field Guide</h2>
                <p>
                  Practical ideas for a calmer, more intentional creative
                  process.
                </p>
                <small>
                  <FileText size={13} />
                  Digital edition · PDF
                  <br />
                  Purchased Oct 17 · fixture
                </small>
                <button
                  className="vp-button"
                  onClick={() => setDialog("guide")}
                >
                  Open your guide
                  <ArrowUpRight size={15} />
                </button>
                <button
                  className="vp-link"
                  onClick={() => setDialog("agreement")}
                >
                  View purchase agreement
                  <ArrowRight size={14} />
                </button>
              </div>
            </section>
            <aside className="vp-library-aside">
              <p className="vp-eyebrow">01 / YOUR COLLECTION</p>
              <BookOpen size={36} />
              <h2>
                Good ideas deserve
                <br />a place to stay.
              </h2>
              <p>
                Your purchased content lives here. Each item keeps its original
                agreement and payment record close by.
              </p>
              <small>
                <ShieldCheck size={15} />
                Private access. Yours to open.
              </small>
            </aside>
          </div>
          {dialog && (
            <AdminDialog
              title={
                dialog === "guide"
                  ? "The Creator’s Field Guide"
                  : "Sample purchase agreement"
              }
              onClose={() => setDialog(null)}
            >
              {dialog === "guide" ? (
                <div className="vp-guide-excerpt">
                  <p className="vp-eyebrow">01 / MAKE A LITTLE SPACE</p>
                  <h3>Good work starts with a little room.</h3>
                  <p>
                    Before adding another tool to your process, take something
                    away. Close the tab you don’t need. Keep one place for the
                    thought you want to follow.
                  </p>
                  <blockquote>
                    Make room for the work that feels like yours.
                  </blockquote>
                  <p>
                    A useful creative system doesn’t do the work for you. It
                    keeps the next step close enough to take.
                  </p>
                  <p className="vp-form-note">
                    Sample content for the VelaPal design prototype. This is not
                    the full product.
                  </p>
                  <div className="vp-settings-actions">
                    <button
                      className="vp-secondary"
                      onClick={() => setDialog(null)}
                    >
                      Back to library
                    </button>
                    <button
                      className="vp-button"
                      onClick={() => {
                        const blob = new Blob(
                          [
                            "VelaPal design prototype — demo excerpt\n\nGood work starts with a little room.\n\nMake room for the work that feels like yours.\n\nSample content only.",
                          ],
                          { type: "text/plain;charset=utf-8" },
                        );
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = "velapal-demo-guide-excerpt.txt";
                        a.click();
                        setTimeout(() => URL.revokeObjectURL(url), 1000);
                      }}
                    >
                      Download demo excerpt
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <dl className="vp-admin-review">
                    {[
                      ["Purchase", "The Creator’s Field Guide"],
                      ["Edition", "Digital edition · PDF"],
                      ["Amount", "$24.00 USD"],
                      ["Payment", "Paid · fictional fixture"],
                      ["Access", "Sample excerpt only"],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  <AdminNotice>
                    This is an illustrative agreement, separate from your API
                    purchase snapshots.
                  </AdminNotice>
                </>
              )}
            </AdminDialog>
          )}
        </>
      )}
    </div>
  );
}
export function Notifications() {
  const { enabled, state, role, commit } = useWorkspacePreview();
  const action = useAction();
  if (role !== "CUSTOMER" && role !== "SELLER")
    return <p role="alert">Choose a personal or Seller workspace.</p>;
  if (!enabled) return <ApiNotifications role={role} />;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="YOUR UPDATES"
        title="A few things to keep in view."
        copy="Relevant next steps, without the noise."
        action={
          <button
            className="vp-secondary"
            disabled={!enabled || state.notificationsRead}
            onClick={() =>
              void action.run(
                async () => commit({ kind: "read-notifications" }),
                "All sample notifications marked as read.",
              )
            }
          >
            Mark all as read
          </button>
        }
      />
      {!enabled ? (
        <UnavailablePreview />
      ) : (
        <>
          <PreviewDisclosure />
          {!state.remindersEnabled && (
            <AdminNotice>
              In-app reminders are off for this preview. Existing updates remain
              available.
            </AdminNotice>
          )}
          <div className="vp-notification-list">
            {[
              {
                title: "A proposal is ready for review",
                copy: "Pocket Drive · Shared case status · sample update",
                href: "/workspace/cases",
                cta: "Open resolution center",
                icon: ShieldCheck,
              },
              {
                title: "Vela Cloud Plus renewal",
                copy: "$12.00 USD · Nov 03, 2026 · Demo billing date",
                href: "/workspace/subscriptions",
                cta:
                  role === "SELLER" ? "Review subscription" : "Manage my plan",
                icon: Bell,
              },
            ].map((n) => (
              <section className="vp-panel" key={n.title}>
                <n.icon size={22} />
                <div>
                  {!state.notificationsRead && (
                    <span className="vp-eyebrow">New</span>
                  )}
                  <h2>{n.title}</h2>
                  <p>{n.copy}</p>
                  <Link className="vp-link" href={n.href}>
                    {n.cta}
                    <ArrowRight size={14} />
                  </Link>
                </div>
              </section>
            ))}
          </div>
          {action.feedback}
        </>
      )}
    </div>
  );
}
export function CustomerSettings() {
  const { state, enabled, role, commit } = useWorkspacePreview();
  const { session } = useSession();
  const [limit, setLimit] = useState(
    (state.defaultLimitMinor / 100).toFixed(2),
  );
  const [connection, setConnection] = useState(false);
  const action = useAction();
  if (role !== "CUSTOMER")
    return <p role="alert">A personal workspace is required.</p>;
  if (!enabled) return <ApiCustomerSettings />;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="YOUR WORKSPACE, YOUR WAY"
        title="A few things, just for you."
        copy="Manage your preferences, safeguards, and connected merchant."
      />
      {!enabled ? (
        <UnavailablePreview />
      ) : (
        <>
          <PreviewDisclosure />
          <div className="vp-settings-grid">
            <Panel title="Profile">
              <p className="vp-section-description">
                Your current VelaPal identity.
              </p>
              <div className="vp-settings-profile">
                <span className="vp-avatar">
                  {session?.user.name.charAt(0)}
                </span>
                <div>
                  <h3>{session?.user.name}</h3>
                  <p>{session?.user.email}</p>
                </div>
                <AdminBadge>Demo account</AdminBadge>
              </div>
              <Link className="vp-link" href="/workspace/merchant-application">
                Apply as a merchant
                <ArrowRight size={14} />
              </Link>
            </Panel>
            <Panel title="Purchase guardrail">
              <p className="vp-section-description">
                A starting limit for each purchase. Vela can’t raise it for you.
              </p>
              <form
                className="vp-auth-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.run(
                    async () =>
                      commit({
                        kind: "limit",
                        amountMinor: moneyFromDollars(limit),
                      }),
                    "Default purchase limit saved for this preview.",
                  );
                }}
              >
                <label className="vp-label">
                  Default purchase limit · USD
                  <input
                    className="vp-input"
                    inputMode="decimal"
                    required
                    value={limit}
                    onChange={(e) => setLimit(e.target.value)}
                  />
                </label>
                <button className="vp-button">Save limit</button>
              </form>
              <p className="vp-form-note">
                A quote above this limit is held until you explicitly change
                your decision.
              </p>
            </Panel>
            <Panel title="Notifications">
              <p className="vp-section-description">
                A useful heads-up, without the noise.
              </p>
              <div className="vp-setting-switch">
                <div>
                  <strong>In-app reminders</strong>
                  <p>Renewals, case updates, and transaction recaps.</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-label="In-app reminders"
                  aria-checked={state.remindersEnabled}
                  onClick={() =>
                    commit({
                      kind: "reminders",
                      enabled: !state.remindersEnabled,
                    })
                  }
                >
                  <span />
                </button>
              </div>
              <p className="vp-form-note">
                Email and WhatsApp delivery aren’t connected.
              </p>
            </Panel>
            <Panel title="Connection">
              <h3>PayPal Sandbox</h3>
              <p className="vp-section-description">
                Vela Market · USD · Prototype connection
              </p>
              <p className="vp-form-note">
                Explore the planned experience with sample data. No live PayPal
                account is connected.
              </p>
              <button
                className="vp-secondary"
                onClick={() => setConnection(true)}
              >
                View connection details
              </button>
            </Panel>
          </div>
          {action.feedback}
          {connection && (
            <AdminDialog
              title="Connection details"
              onClose={() => setConnection(false)}
            >
              <AdminNotice>
                No live PayPal account is connected. Merchant authorization,
                ownership and supported capabilities must be verified by the
                backend.
              </AdminNotice>
              <button
                className="vp-secondary"
                onClick={() => setConnection(false)}
              >
                Understood
              </button>
            </AdminDialog>
          )}
        </>
      )}
      <PartySecurity />
    </div>
  );
}
export function MerchantApplication() {
  const { enabled, state, commit, role } = useWorkspacePreview();
  const [name, setName] = useState(state.business.name);
  const [website, setWebsite] = useState(state.business.website);
  const [category, setCategory] = useState(state.business.category);
  const [country, setCountry] = useState(state.business.country);
  const [reviewed, setReviewed] = useState(false);
  const action = useAction();
  if (role !== "CUSTOMER" && role !== "SELLER")
    return (
      <p role="alert">Use Merchant verification in the Admin workspace.</p>
    );
  if (!enabled) return <ApiMerchantApplication />;
  return (
    <div className="vp-feature-page">
      <WorkspaceHeading
        eyebrow="MERCHANT APPLICATION"
        title="A place for your business."
        copy="VelaPal business approval and PayPal authorization are separate steps."
      />
      {!enabled ? (
        <UnavailablePreview />
      ) : (
        <>
          <PreviewDisclosure />
          <Panel title="Application status">
            <AdminBadge>{state.business.status}</AdminBadge>
            <p className="vp-admin-description">{state.business.reviewNote}</p>
            <p className="vp-form-note">
              This preview never creates a membership or grants Seller
              permissions.
            </p>
          </Panel>
          <Panel
            title={
              state.business.status === "Rejected"
                ? "Review and resubmit"
                : "Business information"
            }
          >
            <form
              className="vp-auth-form vp-business-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!reviewed) return;
                void action.run(
                  async () =>
                    commit({
                      kind: "application",
                      name,
                      website,
                      category,
                      country,
                    }),
                  "Demo application submitted for review. No access was granted.",
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
              <label className="vp-label">
                Category
                <select
                  className="vp-input"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {[
                    "Physical & digital goods",
                    "Digital content",
                    "Physical goods",
                    "Services",
                  ].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="vp-label">
                Country
                <select
                  className="vp-input"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                >
                  {["Indonesia", "Singapore", "United States"].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <label className="vp-consent-label">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                I reviewed the business details and understand this is a local
                application preview.
              </label>
              <button className="vp-button" disabled={!reviewed || action.busy}>
                {state.business.status === "Rejected"
                  ? "Resubmit application"
                  : "Submit application preview"}
              </button>
            </form>
            {action.feedback}
          </Panel>
          <details className="vp-panel vp-prototype-controls">
            <summary>Prototype review states</summary>
            <p>Inspect review outcomes without changing any real account.</p>
            <div className="vp-settings-actions">
              {(["Pending", "Approved", "Rejected"] as const).map((status) => (
                <button
                  className="vp-secondary"
                  key={status}
                  onClick={() => commit({ kind: "application-state", status })}
                >
                  Preview {status.toLowerCase()}
                </button>
              ))}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
