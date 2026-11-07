import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const source = fs.readFileSync(
  new URL("../features/admin/admin-preview.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { createAdminPreview, applyAdminPreviewAction } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const actor = { name: "Demo Supervisor", workspaceType: "ADMIN" };
const reason = "Reviewed the fictional account records.";
test("Admin preview mutations require Admin context, reason and demo verification", () => {
  const state = createAdminPreview();
  const action = { kind: "user", id: "buyer", status: "Suspended" };
  assert.throws(() =>
    applyAdminPreviewAction(
      state,
      { ...actor, workspaceType: "CUSTOMER" },
      action,
      reason,
      "123456",
    ),
  );
  assert.throws(() =>
    applyAdminPreviewAction(state, actor, action, "short", "123456"),
  );
  assert.throws(() =>
    applyAdminPreviewAction(state, actor, action, reason, "000000"),
  );
  assert.throws(() =>
    applyAdminPreviewAction(
      state,
      actor,
      { ...action, id: "administrator" },
      reason,
      "123456",
    ),
  );
  assert.throws(() =>
    applyAdminPreviewAction(
      state,
      actor,
      { kind: "permissions", permissions: ["financial.execute"] },
      reason,
      "123456",
    ),
  );
  assert.equal(state.audit.length, 1);
  assert.equal(state.users[0].status, "Active");
});
test("Admin decisions update only local records and record exact reasons without mutating prior state", () => {
  const original = createAdminPreview();
  const suspended = applyAdminPreviewAction(
    original,
    actor,
    { kind: "user", id: "buyer", status: "Suspended" },
    reason,
    "123456",
  );
  assert.equal(suspended.users[0].status, "Suspended");
  assert.equal(original.users[0].status, "Active");
  assert.equal(suspended.audit[0].reason, reason);
  assert.equal(suspended.audit[0].target, "buyer");
  const restored = applyAdminPreviewAction(
    suspended,
    actor,
    { kind: "user", id: "buyer", status: "Active" },
    reason,
    "123456",
  );
  assert.equal(restored.users[0].status, "Active");
  const approved = applyAdminPreviewAction(
    restored,
    actor,
    { kind: "merchant", id: "studio", status: "Approved" },
    reason,
    "123456",
  );
  assert.equal(approved.merchants[1].status, "Approved");
  assert.equal(approved.merchants[1].note, reason);
  assert.ok(!("paypalConnected" in approved.merchants[1]));
  const scoped = applyAdminPreviewAction(
    approved,
    actor,
    { kind: "permissions", permissions: ["audit.read"] },
    reason,
    "123456",
  );
  assert.deepEqual(scoped.permissions, ["audit.read"]);
  assert.deepEqual(original.permissions, [
    "transactions.read",
    "disputes.read",
    "audit.read",
    "analytics.read",
  ]);
  const paused = applyAdminPreviewAction(
    scoped,
    actor,
    { kind: "ai", enabled: false },
    reason,
    "123456",
  );
  assert.equal(paused.aiEnabled, false);
  assert.equal(paused.audit.length, 6);
});
test("Internal invitation preview validates email and rejects duplicates without creating an account", () => {
  const state = createAdminPreview();
  assert.throws(() =>
    applyAdminPreviewAction(
      state,
      actor,
      { kind: "invite", email: "invalid" },
      reason,
      "123456",
    ),
  );
  const next = applyAdminPreviewAction(
    state,
    actor,
    { kind: "invite", email: "Staff@example.test" },
    reason,
    "123456",
  );
  assert.equal(next.users.length, state.users.length);
  assert.deepEqual(next.invitations, ["staff@example.test"]);
  assert.throws(() =>
    applyAdminPreviewAction(
      next,
      actor,
      { kind: "invite", email: "staff@example.test" },
      reason,
      "123456",
    ),
  );
});
