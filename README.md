# VelaPal V6.1

VelaPal is a dispute mediation and e-commerce protection platform. This directory contains the web app, Express API, shared contract package, and local infrastructure configuration.

> **Progress verified on November 7, 2026.** Runtime checks describe the services available during this review and may change when processes stop or data is updated.

## Project layout

| Path | Contents | Current state |
| --- | --- | --- |
| `apps/web` | Next.js 16.4.3 frontend, port `3000` | The current `.env.local` selects API mode and points to Express at `localhost:4000`. `.env.example` still defaults to mock mode for a fresh checkout. Frontend DTOs use `id`, with adapters for legacy ID aliases. |
| `apps/api` | Express, TypeScript, Prisma API, port `4000` | API routes and durable outbox worker are implemented; `/health` responded successfully during verification. |
| `apps/ai` | Planned FastAPI/LangGraph service, port `8000` | **Not present in this checkout.** |
| `packages/contracts` | Shared TypeScript DTOs and V6.1.1 contract document | Contract and shared types are present in the workspace. |
| `docker-compose.yml` | PostgreSQL, MinIO, and Qdrant | All three containers were running during verification. |

This checkout currently has no root Git repository or root npm workspace configuration. `apps/web` has its own Git metadata.

## Verified progress

| Area | Verified status |
| --- | --- |
| Local infrastructure | `docker compose ps` showed PostgreSQL on `5433`, MinIO on `9002`/`9003`, and Qdrant on `6333`, all running. |
| Database | A read-only Prisma query connected successfully. It found 3 users, 3 workspaces, and 1 product at verification time. The Prisma schema and seed script are present. |
| Express API | `http://localhost:4000/health` returned `ok: true`. Auth, commerce, dispute, admin, and internal route modules are present. |
| Frontend | `http://localhost:3000/` returned HTTP 200. In API mode, `GET /api/v1/me/workspaces` through the frontend returned Express's `401 UNAUTHENTICATED` response because no session cookie was supplied; this confirms the rewrite reaches Express. Frontend `typecheck` passed after the ID/loading-state refactor. Authenticated browser data flow is not yet verified. |
| PayPal | The adapter and `smoke:paypal` script exist. Sandbox credentials in `.env.example` are placeholders; a live PayPal smoke run was not performed during this verification. |
| AI and indexing | `apps/ai` is absent. The API worker is written to call the AI service at `localhost:8000`, so AI callbacks and Qdrant indexing through the AI service are not verified. Qdrant being up only verifies the container. |
| Full dispute-to-refund flow | Not verified. The frontend documentation says mock financial execution returns `501` and does not claim a successful refund. |

The API code includes checkout and PayPal adapter paths, but their presence alone does not prove a successful sandbox capture/refund or a complete end-to-end workflow.

## Run locally

### 1. Start infrastructure

From this directory:

```powershell
docker compose up -d
docker compose ps
```

### 2. Configure and start the API

```powershell
cd apps/api
Copy-Item .env.example .env
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run prisma:push
npm.cmd run seed
npm.cmd run dev
```

The API listens on `http://localhost:4000`. After starting the API and frontend in API mode, open `http://localhost:3000/login` and use one of these Express seed accounts:

| Role | Email | Password | MFA |
| --- | --- | --- | --- |
| Customer | `customer@velapal.demo` | `correct-horse-battery-staple` | Not required |
| Seller | `seller@velapal.demo` | `correct-horse-battery-staple` | Not required |
| Admin | `admin@velapal.demo` | `correct-horse-battery-staple` | Enter `123456` when prompted |

These are backend seed credentials, distinct from the mock-only accounts documented in [apps/web/README.md](apps/web/README.md). To create them in a fresh database, run `npm.cmd run seed` from `apps/api`. The seed uses upserts without overwriting existing users, so rerunning it does not reset a password that was changed earlier. PayPal credentials are optional for local mock/simulation behavior and must be replaced with valid sandbox credentials to test PayPal against the sandbox.

The table describes login MFA only. Seller login does not require MFA, but approving `AUTHORIZE_FINANCIAL_EXECUTION` requires a separate, action-scoped `MERCHANT_EXECUTION` MFA verification. Enter the demo code `123456` in the frontend prompt; the frontend then sends the returned `stepUpId` token, which Express validates against the Seller and the specific action request. The execution endpoint requires that verified Seller authorization consent.

### Where the API `.env` values come from

After copying `.env.example`, open `apps/api/.env` in your editor. Database and MinIO values come from `docker-compose.yml`. PayPal Client ID/Secret and the optional Webhook ID come from the PayPal Developer Dashboard.

| Variable | How to get or set it |
| --- | --- |
| `DATABASE_URL` | For the included Compose setup, use `postgresql://postgres:password123@localhost:5433/velapal_v6?schema=public`. The username, password, and database come from the `postgres` service; `5433` is its host port mapping. If you change those Compose values, update this URL to match. |
| `S3_ENDPOINT` | Use `http://localhost:9002`: Compose maps host port `9002` to MinIO's container port `9000`. The MinIO console is at `http://localhost:9003`; its local username and password are in the Compose file. |
| `S3_REGION` | Keep `us-east-1` for local MinIO. It is the S3 signing region used by the AWS SDK; MinIO does not require an AWS account or AWS region. Use the region configured by your provider when switching to a hosted S3-compatible service. |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | For local development, copy the MinIO credentials from `docker-compose.yml`. For another S3-compatible service, use the access key and secret key issued by that provider. |
| `S3_BUCKET` | Keep `velapal-private` locally. Create a bucket with this name in the MinIO console if it is absent; Compose does not initialize it. For another S3-compatible service, use an existing bucket name. |
| `PAYPAL_BASE_URL` | Keep `https://api-m.sandbox.paypal.com` for sandbox testing. This is PayPal's sandbox API URL, not a value from your account. |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | In the [PayPal Developer Dashboard](https://developer.paypal.com/dashboard/), open **Apps & Credentials**, select the **Sandbox** environment, then select or create a REST API app. Copy that app's Client ID and Secret into `.env`. Use sandbox credentials here; never put the Secret in frontend variables or commit it. PayPal's [REST API getting started guide](https://developer.paypal.com/api/get-started/) has the current steps. |
| `PAYPAL_WEBHOOK_ID` | Optional unless you are testing webhook signature verification. In the same sandbox app, add a webhook and copy its Webhook ID. PayPal must be able to reach the webhook URL; `localhost` alone is not publicly reachable, so local delivery needs a secure tunnel or a deployed HTTPS endpoint. See PayPal's [webhook guide](https://developer.paypal.com/api/rest/webhooks/rest/). |
| `PAYPAL_MERCHANT_ID` | The current API source does not read this variable, so it is not needed to run the present code. The example value is a local demo identifier, not an ID to retrieve from PayPal. |
| `PORT`, `WEB_ORIGIN`, `API_INTERNAL_BASE_URL` | Keep the local defaults: API port `4000`, frontend origin `http://localhost:3000`, and API internal origin `http://localhost:4000`. Change them only if you change the corresponding local ports or origins. |
| `AI_SERVICE_URL`, `WORKER_TO_AI_SECRET`, `AI_TO_EXPRESS_SECRET` | `localhost:8000` is the planned AI service address, and the example tokens are local placeholders. The AI service is not present yet. When it is added, configure matching directional secrets on both services and replace placeholders for shared or deployed environments. |
| `MANIFEST_HMAC_SECRET` | The example is a development placeholder. For a shared environment, generate a unique random secret and configure the same value wherever manifests are signed or verified. |

### Frontend environment

`apps/web/.env.local` currently selects Express API mode. Its `.env.example` defaults to embedded mock mode for a new local checkout:

| Variable | Local value and use |
| --- | --- |
| `NEXT_PUBLIC_API_MODE` | The current `apps/web/.env.local` is `api`, so `/api/v1` requests are sent to Express. A fresh checkout using `.env.example` starts in `mock` mode. |
| `NEXT_PUBLIC_API_BASE_URL` | Present in `.env.example` as `/api/v1`, but the current browser API client hardcodes this prefix and does not read the variable. |
| `API_UPSTREAM` | Current local value is `http://localhost:4000`, the Express API. In mock mode it is not used; do not point API mode back at the frontend port. |
| `MOCK_ALLOWED_ORIGINS` | Local mock origin allowlist for `localhost`, `127.0.0.1`, and `::1` on port `3000`. |

Save `.env` and restart the API after changing it. To check PayPal credentials, run `npm.cmd run smoke:paypal` from `apps/api`. With valid sandbox credentials the script obtains an OAuth token and creates a sandbox order; it does not capture the order. With the example placeholder credentials, it uses the adapter's simulation path, so that run does not verify PayPal connectivity.

### 3. Start the frontend

In another terminal:

```powershell
cd apps/web
npm.cmd ci
npm.cmd run dev
```

Open `http://localhost:3000`. The current `.env.local` uses API mode and sends same-origin `/api/v1` requests to Express at `http://localhost:4000`. The unauthenticated proxy check returned `401`, as expected for a protected route without a session; sign in with an API seed account to use authenticated routes. The mock accounts in [apps/web/README.md](apps/web/README.md) apply only in mock mode.

For a fresh checkout, copy `apps/web/.env.example` to `.env.local` if needed. That example defaults to mock mode. To enable Express mode, set these values and restart the frontend:

```dotenv
NEXT_PUBLIC_API_MODE=api
API_UPSTREAM=http://localhost:4000
```

The API-mode rewrite is verified, but the authenticated frontend-to-Express workflow has not yet been verified end to end. Frontend services normalize entity IDs to `id` at the API boundary while accepting legacy `caseId`/`workspaceId` response aliases. Related foreign keys such as a case's `transactionId` and the workspace-switch request's `workspaceId` retain their relationship/request meaning.

## Remaining integration work

- Add and implement the Python AI service in `apps/ai`.
- Connect the outbox worker to the AI service and verify the directional service-token flows.
- Verify real source scanning/indexing and revocation behavior with Qdrant through the AI service.
- Verify the browser against Express in API mode, including auth, case flows, and evidence handling.
- Run a complete sandbox dispute-to-refund workflow and confirm each provider result before marking it complete.

## Contract and implementation notes

- The V6.1.1 API contract is in [packages/contracts/velapal-v6.1-api-contract.md](packages/contracts/velapal-v6.1-api-contract.md).
- API and frontend environment files are local configuration. Do not commit real credentials or secrets.
- The frontend's mock mode uses synthetic in-memory data. See [apps/web/README.md](apps/web/README.md) for mock limitations and implemented UI flows.
