import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
// Execute the actual frontend client with a controlled Fetch boundary.
const source = fs.readFileSync(
  new URL("../services/contracts/api-client.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const client = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
test("client sends cookie credentials, exact CSRF, If-Match and idempotency headers", async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, ...options };
    return Response.json({
      data: { accepted: true },
      meta: {
        traceId: "tr_test",
        version: 6,
        timestamp: new Date().toISOString(),
      },
    });
  };
  try {
    client.setCsrfToken("csrf_test");
    const response = await client.apiRequest("/disputes", {
      method: "POST",
      body: { statement: "Test" },
      ifMatch: 6,
      idempotencyKey: "stable-key",
    });
    assert.equal(response.data.accepted, true);
    assert.equal(request.url, "/api/v1/disputes");
    assert.equal(request.credentials, "include");
    assert.equal(request.headers.get("X-CSRF-Token"), "csrf_test");
    assert.equal(request.headers.get("If-Match"), '"6"');
    assert.equal(request.headers.get("Idempotency-Key"), "stable-key");
    assert.deepEqual(JSON.parse(request.body), { statement: "Test" });
  } finally {
    globalThis.fetch = original;
  }
});
test("client preserves structured HTTP failures and rejects internal service paths", async () => {
  const original = globalThis.fetch;
  try {
    for (const status of [401, 403, 409, 422, 429, 503]) {
      globalThis.fetch = async () =>
        Response.json(
          {
            error: {
              code: "TEST_ERROR",
              message: "Contract failure",
              traceId: "tr_failure",
              retryable: status === 503,
              currentVersion: 9,
              fieldErrors: { statement: "Invalid" },
            },
          },
          { status },
        );
      await assert.rejects(
        client.apiData("/disputes"),
        (e) =>
          e instanceof client.ApiError &&
          e.status === status &&
          e.currentVersion === 9 &&
          e.traceId === "tr_failure",
      );
    }
    await assert.rejects(
      client.apiData("/internal/v1/case-runs"),
      (e) => e.code === "INVALID_PUBLIC_PATH",
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("workspace change aborts in-flight requests; empty 204 and malformed envelopes handled", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (_url, options) =>
      new Promise((_resolve, reject) =>
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Cancelled", "AbortError")),
        ),
      );
    const pending = client.apiData("/transactions");
    client.cancelWorkspaceRequests();
    await assert.rejects(pending, (e) => e.name === "AbortError");
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(
      await client.apiData("/auth/logout", { method: "POST" }),
      undefined,
    );
    globalThis.fetch = async () => Response.json({ items: [] });
    await assert.rejects(
      client.apiData("/transactions"),
      (e) => e.code === "INVALID_ENVELOPE",
    );
    client.clearCsrfToken();
    await assert.rejects(
      client.apiData("/disputes", { method: "POST", body: {} }),
      (e) => e.code === "CSRF_NOT_INITIALIZED",
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("a response cancelled during JSON parsing cannot populate the next workspace", async () => {
  const original = globalThis.fetch;
  let finish;
  try {
    globalThis.fetch = async () => ({
      status: 200,
      ok: true,
      text: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    const pending = client.apiData("/auth/session");
    await new Promise((resolve) => setImmediate(resolve));
    client.cancelWorkspaceRequests();
    finish(JSON.stringify({
      data: { oldWorkspace: true },
      meta: {
        traceId: "tr_old",
        version: 1,
        timestamp: new Date().toISOString(),
      },
    }));
    await assert.rejects(pending, (e) => e.name === "AbortError");
  } finally {
    globalThis.fetch = original;
  }
});
