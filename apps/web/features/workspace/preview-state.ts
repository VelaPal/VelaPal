/** Fictional P1 frontend state, separate from authorized API transaction/case records. */
export type PreviewProduct = {
  id: string;
  name: string;
  variant: string;
  sku: string;
  type: "physical" | "digital" | "subscription";
  amountMinor: number;
  status: "Published" | "Archived";
};
export type WorkspacePreview = {
  version: 1;
  defaultLimitMinor: number;
  remindersEnabled: boolean;
  subscription: {
    status: "Active" | "Cancelled";
    billingAt: string;
    accessUntil: string;
    reminder: "pending" | "kept" | "snoozed";
    snoozedUntil: string | null;
  };
  notificationsRead: boolean;
  otherSessionRevoked: boolean;
  business: {
    name: string;
    website: string;
    category: string;
    country: string;
    status: "Pending" | "Approved" | "Rejected";
    reviewNote: string;
  };
  products: PreviewProduct[];
  fulfilment: Record<
    string,
    { status: "Shipped" | "Delivered"; tracking: string }
  >;
  history: { action: string; target: string; at: string }[];
};
export function initialWorkspacePreview(): WorkspacePreview {
  return {
    version: 1,
    defaultLimitMinor: 7500,
    remindersEnabled: true,
    subscription: {
      status: "Active",
      billingAt: "2026-11-03T00:00:00Z",
      accessUntil: "2026-11-03T00:00:00Z",
      reminder: "pending",
      snoozedUntil: null,
    },
    notificationsRead: false,
    otherSessionRevoked: false,
    business: {
      name: "Vela Market",
      website: "https://example.test",
      category: "Physical & digital goods",
      country: "Indonesia",
      status: "Approved",
      reviewNote: "Seeded VelaPal business approval; no PayPal authorization.",
    },
    products: [
      {
        id: "pd256",
        name: "Pocket Drive",
        variant: "256 GB · Midnight",
        sku: "PD-256-M",
        type: "physical",
        amountMinor: 5900,
        status: "Published",
      },
      {
        id: "pd128",
        name: "Pocket Drive",
        variant: "128 GB · Midnight",
        sku: "PD-128-M",
        type: "physical",
        amountMinor: 3900,
        status: "Published",
      },
      {
        id: "guide",
        name: "The Creator’s Field Guide",
        variant: "Digital edition · PDF",
        sku: "GUIDE-001",
        type: "digital",
        amountMinor: 2400,
        status: "Published",
      },
      {
        id: "cloud",
        name: "Vela Cloud Plus",
        variant: "Monthly membership",
        sku: "CLOUD-PLUS",
        type: "subscription",
        amountMinor: 1200,
        status: "Published",
      },
    ],
    fulfilment: {},
    history: [],
  };
}
export type WorkspacePreviewAction =
  | { kind: "limit"; amountMinor: number }
  | { kind: "reminders"; enabled: boolean }
  | { kind: "keep" }
  | { kind: "snooze" }
  | { kind: "cancel"; consent: boolean; reason: string }
  | { kind: "read-notifications" }
  | { kind: "revoke-sample" }
  | { kind: "profile"; name: string; website: string }
  | {
      kind: "application";
      name: string;
      website: string;
      category: string;
      country: string;
    }
  | { kind: "application-state"; status: "Pending" | "Approved" | "Rejected" }
  | { kind: "product"; product: PreviewProduct }
  | { kind: "archive"; id: string }
  | {
      kind: "fulfilment";
      paymentStatus: string;
      orderId: string;
      status: "Shipped" | "Delivered";
      tracking: string;
      consent: boolean;
    };
export function moneyFromDollars(value: string) {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()))
    throw new Error(
      "Use a nonnegative USD amount with at most two decimal places.",
    );
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount)) throw new Error("Amount is too large.");
  return amount;
}
export function applyWorkspacePreview(
  state: WorkspacePreview,
  role: string,
  action: WorkspacePreviewAction,
  at: string,
): WorkspacePreview {
  if (!["CUSTOMER", "SELLER"].includes(role))
    throw new Error("A personal or Seller workspace is required.");
  const customer = ["limit", "keep", "snooze", "cancel"];
  const seller = ["profile", "product", "archive", "fulfilment"];
  if (
    (customer.includes(action.kind) && role !== "CUSTOMER") ||
    (seller.includes(action.kind) && role !== "SELLER")
  )
    throw new Error("This workspace cannot perform that action.");
  const next = structuredClone(state);
  let target = "workspace";
  switch (action.kind) {
    case "limit":
      if (!Number.isSafeInteger(action.amountMinor) || action.amountMinor < 0)
        throw new Error("Use integer minor units.");
      next.defaultLimitMinor = action.amountMinor;
      break;
    case "reminders":
      next.remindersEnabled = action.enabled;
      break;
    case "keep":
      if (next.subscription.status !== "Active")
        throw new Error("This plan is cancelled.");
      next.subscription.reminder = "kept";
      target = "Vela Cloud Plus";
      break;
    case "snooze":
      if (
        next.subscription.status !== "Active" ||
        next.subscription.reminder !== "pending"
      )
        throw new Error("This reminder has already been handled.");
      next.subscription.reminder = "snoozed";
      next.subscription.snoozedUntil = new Date(
        new Date(at).getTime() + 86400000,
      ).toISOString();
      target = "Vela Cloud Plus";
      break;
    case "cancel":
      if (!action.consent || action.reason.trim().length < 10)
        throw new Error("Review renewal/access effects and provide a reason.");
      if (next.subscription.status !== "Active")
        throw new Error("This plan is already cancelled.");
      next.subscription.status = "Cancelled";
      target = "Vela Cloud Plus";
      break;
    case "read-notifications":
      next.notificationsRead = true;
      break;
    case "revoke-sample":
      next.otherSessionRevoked = true;
      break;
    case "profile":
    case "application":
      if (action.name.trim().length < 2 || !/^https?:\/\//.test(action.website))
        throw new Error("Enter a business name and valid http(s) website.");
      try {
        new URL(action.website);
      } catch {
        throw new Error("Enter a valid website.");
      }
      next.business.name = action.name.trim();
      next.business.website = action.website;
      if (action.kind === "application") {
        next.business.category = action.category;
        next.business.country = action.country;
        next.business.status = "Pending";
        next.business.reviewNote =
          "Awaiting review. This preview grants no workspace access.";
      }
      break;
    case "application-state":
      next.business.status = action.status;
      next.business.reviewNote =
        action.status === "Rejected"
          ? "Please clarify the business website and product information before resubmitting."
          : "Demo review state only. No membership or PayPal capability is granted.";
      break;
    case "product": {
      const p = action.product;
      if (
        !p.name.trim() ||
        !p.variant.trim() ||
        !p.sku.trim() ||
        !["physical", "digital", "subscription"].includes(p.type) ||
        !["Published", "Archived"].includes(p.status) ||
        !Number.isSafeInteger(p.amountMinor) ||
        p.amountMinor < 0
      )
        throw new Error(
          "Complete the product details with a valid nonnegative USD price.",
        );
      if (
        next.products.some(
          (x) => x.id !== p.id && x.sku.toLowerCase() === p.sku.toLowerCase(),
        )
      )
        throw new Error("This SKU already exists.");
      const i = next.products.findIndex((x) => x.id === p.id);
      if (i >= 0) next.products[i] = { ...p };
      else next.products.push({ ...p });
      target = p.id;
      break;
    }
    case "archive": {
      const p = next.products.find((p) => p.id === action.id);
      if (!p) throw new Error("Product not found.");
      p.status = p.status === "Published" ? "Archived" : "Published";
      target = p.id;
      break;
    }
    case "fulfilment":
      if (!["PAID", "PARTIALLY_REFUNDED"].includes(action.paymentStatus))
        throw new Error("Do not fulfil an unconfirmed or refunded payment.");
      if (
        !action.consent ||
        !action.orderId ||
        (action.status === "Shipped" && !action.tracking.trim())
      )
        throw new Error("Review the order and supply tracking for a shipment.");
      next.fulfilment[action.orderId] = {
        status: action.status,
        tracking: action.tracking.trim(),
      };
      target = action.orderId;
      break;
  }
  next.history.unshift({ action: action.kind, target, at });
  return next;
}
