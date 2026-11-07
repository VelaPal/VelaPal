import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const code = ts.transpileModule(
  fs.readFileSync(new URL("../lib/api-upstream.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  },
).outputText;
const { resolveApiUpstream } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`
);
test("mock mode is embedded without an upstream and API mode rejects a frontend proxy loop", () => {
  assert.equal(
    resolveApiUpstream({ mode: "mock", upstream: "http://localhost:3000" }),
    null,
  );
  assert.equal(resolveApiUpstream({ mode: "mock" }), null);
  assert.throws(
    () =>
      resolveApiUpstream({ mode: "api", upstream: "http://localhost:3000" }),
    /cannot point back/,
  );
  assert.throws(
    () =>
      resolveApiUpstream({ mode: "api", upstream: "http://127.0.0.1:3000" }),
    /cannot point back/,
  );
  assert.throws(() => resolveApiUpstream({ mode: "api" }), /Set API_UPSTREAM/);
  assert.throws(() =>
    resolveApiUpstream({ mode: "api", upstream: "ftp://localhost:4000" }),
  );
  assert.equal(
    resolveApiUpstream({ mode: "api", upstream: "http://127.0.0.1:4000/" }),
    "http://127.0.0.1:4000",
  );
});
