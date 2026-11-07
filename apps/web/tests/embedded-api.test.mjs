import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
let code = ts.transpileModule(
  fs.readFileSync(
    new URL("../mock-api/embedded-handler.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
code = code.replace(
  /from ['"]\.\/server\.mjs['"]/,
  `from '${new URL("../mock-api/server.mjs", import.meta.url).href}'`,
);
const { handleEmbeddedMock } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
const origin = "http://localhost:3000";
function request(
  path,
  method = "GET",
  { body, cookie, csrf, version, originValue = origin } = {},
) {
  return handleEmbeddedMock(
    new Request(origin + path, {
      method,
      headers: {
        Origin: originValue,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(version ? { "If-Match": String(version) } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}
async function login() {
  const response = await request("/api/v1/auth/login", "POST", {
    body: { email: "customer@velapal.demo", password: "demo12345" },
  });
  assert.equal(response.status, 200);
  const session = (await response.json()).data;
  return {
    cookie: response.headers.get("set-cookie").split(";")[0],
    csrf: session.csrfToken,
    response,
  };
}
test("embedded API preserves cookie sessions, CSRF, logout and disallowed-origin rejection", async () => {
  const bad = await request("/api/v1/auth/login", "POST", {
    originValue: "https://untrusted.example",
    body: { email: "customer@velapal.demo", password: "demo12345" },
  });
  assert.equal(bad.status, 403);
  assert.equal((await bad.json()).error.code, "INVALID_ORIGIN");
  const s = await login();
  assert.match(s.response.headers.get("set-cookie"), /HttpOnly/);
  assert.equal(s.response.headers.get("cache-control"), "no-store");
  const session = await request("/api/v1/auth/session", "GET", s);
  assert.equal(session.status, 200);
  assert.equal((await session.json()).data.csrfToken, s.csrf);
  assert.equal(
    (await request("/api/v1/auth/logout", "POST", { cookie: s.cookie })).status,
    403,
  );
  const logout = await request("/api/v1/auth/logout", "POST", s);
  assert.equal(logout.status, 204);
  assert.equal(await logout.text(), "");
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  assert.equal((await request("/api/v1/auth/session", "GET", s)).status, 401);
});
test("embedded upload intent, bytes, finalize and source metadata share one in-memory handler on port 3000", async () => {
  const s = await login();
  const response = await request(
    "/api/v1/disputes/case_vp_0421/sources/upload-intents",
    "POST",
    {
      ...s,
      body: { originalName: "demo.jpg", mime: "image/jpeg", byteCount: 4 },
    },
  );
  assert.equal(response.status, 201);
  const intent = (await response.json()).data;
  assert.equal(new URL(intent.uploadHandle.url).origin, origin);
  const upload = await handleEmbeddedMock(
    new Request(intent.uploadHandle.url, {
      method: "PUT",
      body: new Uint8Array([1, 2, 3, 4]),
    }),
  );
  assert.equal(upload.status, 204);
  const finalized = await request(
    `/api/v1/disputes/case_vp_0421/sources/${intent.sourceId}/finalize`,
    "POST",
    {
      ...s,
      version: intent.sourceVersion,
      body: { uploadId: intent.uploadId },
    },
  );
  assert.equal(finalized.status, 202);
  const source = await request(
    `/api/v1/disputes/case_vp_0421/sources/${intent.sourceId}`,
    "GET",
    s,
  );
  assert.equal(source.status, 200);
  assert.equal((await source.json()).data.audience, "PRIVATE");
});
