import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL("../features/auth/registration-preview.ts", import.meta.url),
  "utf8",
);
const compiled = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
  })
  .outputText.replace(
    'from "zod"',
    `from "${pathToFileURL(require.resolve("zod")).href}"`,
  );
const registration = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
);
const valid = {
  party: "CUSTOMER",
  name: " Alex Morgan ",
  email: "alex@example.test",
  password: "fictional-password-123",
  confirmPassword: "fictional-password-123",
  terms: true,
  businessName: "",
  businessCategory: "Digital content",
  country: "Indonesia",
  website: "",
};
test("registration rejects public Admin, missing consent, password mismatch and incomplete seller", () => {
  for (const input of [
    { ...valid, party: "ADMIN" },
    { ...valid, terms: false },
    { ...valid, password: "short" },
    { ...valid, confirmPassword: "different" },
    { ...valid, party: "SELLER" },
    { ...valid, email: "invalid" },
  ])
    assert.equal(
      registration.registrationSchema.safeParse(input).success,
      false,
    );
  assert.equal(
    registration.registrationSchema.safeParse({
      ...valid,
      party: "SELLER",
      businessName: "Fictional store",
    }).success,
    true,
  );
});
test("registration preview discards passwords and retains verification only in tab storage", async () => {
  const previous = globalThis.sessionStorage;
  const values = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
  };
  try {
    const preview = registration.createRegistrationPreview(valid);
    assert.equal(preview.name, "Alex Morgan");
    assert.equal(preview.verified, false);
    const stored = [...values.values()].join("");
    assert.ok(!stored.includes(valid.password));
    assert.ok(!stored.includes("password"));
    assert.equal(
      (await registration.readRegistrationPreview()).email,
      valid.email,
    );
    registration.verifyRegistrationPreview(preview);
    assert.equal((await registration.readRegistrationPreview()).verified, true);
    values.set("velapal:registration-preview", "invalid json");
    assert.equal(await registration.readRegistrationPreview(), null);
  } finally {
    if (previous === undefined) delete globalThis.sessionStorage;
    else globalThis.sessionStorage = previous;
  }
});
