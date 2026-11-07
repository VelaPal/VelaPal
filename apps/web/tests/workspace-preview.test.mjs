import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(
  new URL("../features/workspace/preview-state.ts", import.meta.url),
  "utf8",
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { initialWorkspacePreview, applyWorkspacePreview, moneyFromDollars } =
  await import(
    `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
  );
const at = "2026-11-06T10:00:00Z";
test("USD input becomes exact integer minor units and rejects unsafe or fractional cents", () => {
  for (const [s, n] of [
    ["75", 7500],
    ["0", 0],
    ["1.01", 101],
    ["12.5", 1250],
  ])
    assert.equal(moneyFromDollars(s), n);
  for (const s of ["-1", "1.234", "NaN", "1e3", "9007199254740992"])
    assert.throws(() => moneyFromDollars(s));
});
test("Subscription choice, one snooze and cancellation never shift billing/access or imply a refund", () => {
  const state = initialWorkspacePreview();
  const snoozed = applyWorkspacePreview(
    state,
    "CUSTOMER",
    { kind: "snooze" },
    at,
  );
  assert.equal(snoozed.subscription.snoozedUntil, "2026-11-07T10:00:00.000Z");
  assert.equal(snoozed.subscription.billingAt, state.subscription.billingAt);
  assert.throws(() =>
    applyWorkspacePreview(snoozed, "CUSTOMER", { kind: "snooze" }, at),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "CUSTOMER",
      { kind: "cancel", consent: false, reason: "No longer needed" },
      at,
    ),
  );
  const cancelled = applyWorkspacePreview(
    state,
    "CUSTOMER",
    { kind: "cancel", consent: true, reason: "No longer need this plan" },
    at,
  );
  assert.equal(cancelled.subscription.status, "Cancelled");
  assert.equal(
    cancelled.subscription.accessUntil,
    state.subscription.accessUntil,
  );
  assert.equal(cancelled.subscription.billingAt, state.subscription.billingAt);
  assert.ok(!("refund" in cancelled));
  assert.equal(state.subscription.status, "Active");
});
test("Workspace role boundaries and product SKU/price rules are enforced in local previews", () => {
  const state = initialWorkspacePreview();
  assert.throws(() =>
    applyWorkspacePreview(state, "ADMIN", { kind: "read-notifications" }, at),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "SELLER",
      { kind: "cancel", consent: true, reason: "No longer needed" },
      at,
    ),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "CUSTOMER",
      { kind: "archive", id: "pd256" },
      at,
    ),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "SELLER",
      { kind: "product", product: { ...state.products[0], id: "new" } },
      at,
    ),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "SELLER",
      { kind: "product", product: { ...state.products[0], amountMinor: -1 } },
      at,
    ),
  );
  const archived = applyWorkspacePreview(
    state,
    "SELLER",
    { kind: "archive", id: "pd256" },
    at,
  );
  assert.equal(archived.products[0].status, "Archived");
  assert.equal(state.products[0].status, "Published");
  assert.ok(!("transactions" in archived));
});
test("Merchant resubmission is pending and creates no grants; fulfilment requires explicit review", () => {
  const state = initialWorkspacePreview();
  const rejected = applyWorkspacePreview(
    state,
    "CUSTOMER",
    { kind: "application-state", status: "Rejected" },
    at,
  );
  const next = applyWorkspacePreview(
    rejected,
    "CUSTOMER",
    {
      kind: "application",
      name: "Example Store",
      website: "https://example.test",
      category: "Services",
      country: "Indonesia",
    },
    at,
  );
  assert.equal(next.business.status, "Pending");
  assert.ok(!("memberships" in next));
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "SELLER",
      {
        kind: "fulfilment",
        paymentStatus: "PAID",
        orderId: "tx_authorized",
        status: "Shipped",
        tracking: "",
        consent: true,
      },
      at,
    ),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "SELLER",
      {
        kind: "fulfilment",
        paymentStatus: "PAID",
        orderId: "tx_authorized",
        status: "Shipped",
        tracking: "TRACK-TEST",
        consent: false,
      },
      at,
    ),
  );
  assert.throws(() =>
    applyWorkspacePreview(
      state,
      "SELLER",
      {
        kind: "fulfilment",
        paymentStatus: "UNCONFIRMED",
        orderId: "tx_authorized",
        status: "Shipped",
        tracking: "TRACK-TEST",
        consent: true,
      },
      at,
    ),
  );
  const shipped = applyWorkspacePreview(
    state,
    "SELLER",
    {
      kind: "fulfilment",
      paymentStatus: "PAID",
      orderId: "tx_authorized",
      status: "Shipped",
      tracking: "TRACK-TEST",
      consent: true,
    },
    at,
  );
  assert.equal(shipped.fulfilment.tx_authorized.status, "Shipped");
  assert.ok(!("paymentStatus" in shipped.fulfilment.tx_authorized));
});
