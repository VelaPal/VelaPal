# VelaPal FE Mock API — Contract-aligned V6.1.1

Prepared for **Deff (FE)** to hand off to **Yunggi (BE)** and **Ibnu (AI)**. The attached Yunggi **Master API & Internal Service Contract 6.1.1 — Frozen (2026-11-05)** is included unchanged in `packages/contracts/`. This repo is a **starter/mock layer for integration into the existing Next.js UI**, not the original VelaPal frontend and not an Express/PayPal/Gemini implementation.

## Contents

```text
apps/
  web/
    .env.local.example
    next.config.example.mjs
    src/services/
      api-client.ts           # credentials, CSRF, If-Match, idempotency, error shape
      types.ts                # frozen enums, DTOs
      auth.service.ts         # login, session, MFA, workspace
      transactions.service.ts # catalog, quotes, transaction, checkout contract
      disputes.service.ts     # two-sided case, sources, assessment, consent
      agent.service.ts        # personal/private runs
      admin.service.ts        # queue, intervention, audit
      operations.service.ts   # status + reconciliation of same operation
  mock-api/server.mjs         # synthetic local API (Node built-ins)
packages/contracts/          # frozen source markdown (unchanged)
docs/ENDPOINT_MATRIX.md      # exact mock coverage and gaps
docs/BE_HANDOFF.md           # handoff rules and smoke-test checklist
tests/contract.test.mjs      # executable assertions
```

## Run mock API (Node.js 20+; zero runtime dependencies)

```bash
cd apps/mock-api
npm start
# http://localhost:4010/health
```

In another terminal:

```bash
cd apps/mock-api
npm test
```

For Next.js: copy `apps/web/src/services` into the existing FE `src/services` (or adapt import paths), and add a same-origin rewrite as shown in `apps/web/next.config.example.mjs`. Use `.env.local`:

```env
NEXT_PUBLIC_API_BASE_URL=/api/v1
```

After Yunggi's Express BE is available, point the Next rewrite to `http://localhost:4000/api/v1/:path*` and run the handoff tests again. **The FE service imports and method calls remain unchanged** if BE honors the frozen contract.

## Demo accounts (mock only)

| Workspace | Email | Password | Additional step |
|---|---|---|---|
| Customer | `customer@velapal.demo` | `demo12345` | — |
| Seller | `seller@velapal.demo` | `demo12345` | — |
| Admin | `admin@velapal.demo` | `demo12345` | Login MFA mock code: `123456` |

No real passwords or sessions. Data is **in-memory and wiped on restart**. The `case_vp_0421` fixture corresponds to the documented disputed 256GB/128GB product scenario, but the API is synthetic. Returned PayPal-looking example identifiers are **sample values from the supplied contract** and do not prove a PayPal capture occurred. Every JSON response carries `X-Mock-Mode: synthetic_fixture`.

**Scope notes:** Checkout/capture, refund execution, admin financial approval, webhook handling, real AI and real file scanning are deliberately not executed. The mock can return an `UNKNOWN` financial operation but cannot assert a real result. Public registration/recovery, subscriptions and expanded seller dashboard endpoints are not frozen in this P0 contract. See the endpoint matrix.
