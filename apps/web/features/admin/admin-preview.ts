/** Browser-local Admin prototype records. These are not backend DTOs or authorization. */
export type PreviewUser = {
  id: string;
  name: string;
  email: string;
  roles: string[];
  status: "Active" | "Suspended";
  verified: boolean;
};
export type PreviewMerchant = {
  id: string;
  name: string;
  owner: string;
  email: string;
  category: string;
  country: string;
  website: string;
  status: "Pending" | "Approved" | "Rejected";
  note: string;
};
export type PreviewAudit = {
  id: string;
  at: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  reason: string;
};
export type AdminPreview = {
  users: PreviewUser[];
  merchants: PreviewMerchant[];
  aiEnabled: boolean;
  permissions: string[];
  otherSessionRevoked: boolean;
  invitations: string[];
  audit: PreviewAudit[];
};
export const staffPermissions = [
  "transactions.read",
  "disputes.read",
  "audit.read",
  "analytics.read",
];
export function createAdminPreview(): AdminPreview {
  return {
    users: [
      {
        id: "buyer",
        name: "Daffa Yunus",
        email: "daffa@example.test",
        roles: ["user"],
        status: "Active",
        verified: true,
      },
      {
        id: "merchant-owner",
        name: "Maya Putri",
        email: "maya@example.test",
        roles: ["seller"],
        status: "Active",
        verified: true,
      },
      {
        id: "administrator",
        name: "Arya Pratama",
        email: "arya@example.test",
        roles: ["admin"],
        status: "Active",
        verified: true,
      },
      {
        id: "auditor",
        name: "Nadia Rahma",
        email: "nadia@example.test",
        roles: ["admin"],
        status: "Active",
        verified: true,
      },
      {
        id: "owner",
        name: "Daffa Yunus",
        email: "owner@example.test",
        roles: ["user", "seller"],
        status: "Active",
        verified: true,
      },
    ],
    merchants: [
      {
        id: "vela",
        name: "Vela Market",
        owner: "Maya Putri",
        email: "maya@example.test",
        category: "Physical & digital goods",
        country: "Indonesia",
        website: "https://example.test",
        status: "Approved",
        note: "Seeded business approval",
      },
      {
        id: "studio",
        name: "Northstar Studio",
        owner: "Raka Putra",
        email: "raka@example.test",
        category: "Digital content",
        country: "Indonesia",
        website: "https://example.test",
        status: "Pending",
        note: "Awaiting business review",
      },
      {
        id: "other",
        name: "Paper & Form",
        owner: "Sari Dewi",
        email: "sari@example.test",
        category: "Digital content",
        country: "Indonesia",
        website: "https://example.test",
        status: "Rejected",
        note: "Application needs further information",
      },
    ],
    aiEnabled: true,
    permissions: [...staffPermissions],
    otherSessionRevoked: false,
    invitations: [],
    audit: [
      {
        id: "DEMO-EVT-1001",
        at: "2026-11-04T15:15:00Z",
        actor: "System",
        role: "system",
        action: "Merchant verified",
        target: "vela",
        reason: "Seeded demonstration event",
      },
    ],
  };
}
export type PreviewAction =
  | { kind: "user"; id: string; status: "Active" | "Suspended" }
  | { kind: "merchant"; id: string; status: "Approved" | "Rejected" }
  | { kind: "ai"; enabled: boolean }
  | { kind: "permissions"; permissions: string[] }
  | { kind: "invite"; email: string }
  | { kind: "revoke-session" };
export function applyAdminPreviewAction(
  state: AdminPreview,
  actor: { name: string; workspaceType: string },
  action: PreviewAction,
  reason: string,
  code: string,
): AdminPreview {
  if (actor.workspaceType !== "ADMIN")
    throw new Error("Admin workspace access required.");
  if (reason.trim().length < 10)
    throw new Error("Enter a reason of at least 10 characters.");
  if (code !== "123456") throw new Error("Use demo authenticator code 123456.");
  const next = structuredClone(state);
  let label = "",
    target = "";
  switch (action.kind) {
    case "user": {
      const user = next.users.find((u) => u.id === action.id);
      if (!user || user.roles.includes("admin"))
        throw new Error("Staff and own privileges cannot be edited here.");
      user.status = action.status;
      label =
        action.status === "Suspended"
          ? "Account suspended"
          : "Account restored";
      target = user.id;
      break;
    }
    case "merchant": {
      const merchant = next.merchants.find((m) => m.id === action.id);
      if (!merchant) throw new Error("Business not found.");
      merchant.status = action.status;
      merchant.note = reason.trim();
      label =
        action.status === "Approved"
          ? "Merchant approved"
          : "Merchant rejected";
      target = merchant.id;
      break;
    }
    case "ai":
      next.aiEnabled = action.enabled;
      label = action.enabled ? "AI demo resumed" : "AI demo paused";
      target = "scripted-agent-monitor";
      break;
    case "permissions":
      if (action.permissions.some((p) => !staffPermissions.includes(p)))
        throw new Error("Unsupported staff permission.");
      next.permissions = [...new Set(action.permissions)];
      label = "Staff permissions updated";
      target = "auditor";
      break;
    case "invite":
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(action.email))
        throw new Error("Enter a valid fictional email.");
      if (next.invitations.includes(action.email.toLowerCase()))
        throw new Error("An invitation preview already exists for this email.");
      next.invitations.push(action.email.toLowerCase());
      label = "Internal invitation previewed";
      target = action.email.toLowerCase();
      break;
    case "revoke-session":
      next.otherSessionRevoked = true;
      label = "Sample session revoked";
      target = "sample-mobile-session";
      break;
  }
  next.audit.unshift({
    id: `DEMO-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    actor: actor.name,
    role: "admin",
    action: label,
    target,
    reason: reason.trim(),
  });
  return next;
}
export const previewTransactions = [
  {
    id: "VP-1028",
    product: "Pocket Drive",
    merchant: "Vela Market",
    status: "Paid",
    amountMinor: 5900,
  },
  {
    id: "VP-1017",
    product: "The Creator’s Field Guide",
    merchant: "Vela Market",
    status: "Paid",
    amountMinor: 2400,
  },
  {
    id: "VP-1009",
    product: "Pocket Drive",
    merchant: "Vela Market",
    status: "Paid",
    amountMinor: 3900,
  },
  {
    id: "VP-1004",
    product: "Pocket Drive",
    merchant: "Vela Market",
    status: "Refunded",
    amountMinor: 3900,
  },
  {
    id: "VP-1003",
    product: "Vela Cloud Plus",
    merchant: "Vela Market",
    status: "Paid",
    amountMinor: 1200,
  },
];
