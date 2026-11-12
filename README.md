# VelaPal V6.1

VelaPal is a commerce protection and dispute mediation platform. This repository contains a Next.js web app, an Express API, a FastAPI AI service, shared API contracts, and local infrastructure configuration.

## Repository layout

| Path | Description |
| --- | --- |
| `apps/web` | Next.js 16 frontend for customer, seller, and admin workspaces. |
| `apps/api` | Express and Prisma API for authentication, commerce, disputes, evidence, administration, and PayPal integrations. |
| `apps/ai` | FastAPI service for evidence indexing, retrieval, and bounded mediation workflows. |
| `packages/contracts` | Shared TypeScript DTOs and the VelaPal API contract. |
| `docker-compose.yml` | Local PostgreSQL, Qdrant, MinIO, and private-bucket initialization. |
| `docker-compose.ai.yml` | Optional AI service container configuration. |

## Requirements

- Node.js and npm
- Docker Compose
- Python 3.11+ to run the AI service outside Docker
- A Gemini API key for AI live model requests

## Run locally

### 1. Start infrastructure

From the repository root:

```bash
docker compose up -d
```

This starts PostgreSQL on port `5433`, Qdrant on `6333`, and MinIO on `9002` (API) and `9003` (console). The `minio-init` service creates the private `velapal-private` bucket.

### 2. Configure and start the API

```bash
cd apps/api
cp .env.example .env
npm ci
npm run prisma:generate
npm run prisma:push
npm run seed
npm run dev
```

The API listens on `http://localhost:4000`. The seed creates demo Customer, Seller, and Admin accounts:

| Role | Email | Password | Login MFA |
| --- | --- | --- | --- |
| Customer | `customer@velapal.demo` | `correct-horse-battery-staple` | None |
| Seller | `seller@velapal.demo` | `correct-horse-battery-staple` | None |
| Admin | `admin@velapal.demo` | `correct-horse-battery-staple` | `123456` |

Seller financial actions require a separate action-scoped MFA verification. These demo credentials are for local development only. The seed uses upserts and does not reset an existing user's password.

PayPal credentials are optional for local development; set valid sandbox credentials in `apps/api/.env` to use PayPal sandbox operations. Seller onboarding and provider-backed subscriptions also require an eligible PayPal multiparty app and the partner settings described in `apps/api/README.md`.

### 3. Configure and start the frontend

In another terminal:

```bash
cd apps/web
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. The frontend sends browser requests through the same-origin `/api/v1` proxy to Express at `http://localhost:4000`; change `API_UPSTREAM` in `.env.local` if the API uses another address.

### 4. (Optional) Start the AI service

The AI service handles evidence indexing and mediation workflows. For local execution, copy the template, set `GEMINI_API_KEY` in `apps/ai/.env`, and keep the service URLs and directional secrets aligned with `apps/api/.env`:

```bash
cd apps/ai
cp .env.example .env
python -m venv .venv
# Windows PowerShell: .venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r requirements.txt
python -m uvicorn velapal_ai.main:app --host 127.0.0.1 --port 8000 --workers 1
```

The AI service uses Qdrant from the root Compose stack. `GET /health` checks liveness and `GET /ready` checks Qdrant availability. Keep the service on one worker; its graph state uses a local SQLite checkpoint store.

Alternatively, configure `apps/ai/.env` and run the optional container with:

```bash
docker compose -f docker-compose.yml -f docker-compose.ai.yml --profile ai up -d --build
```

When using the AI container, set `API_INTERNAL_BASE_URL=http://host.docker.internal:4000` in `apps/api/.env` as described in `docker-compose.ai.yml`. The example AI configuration uses live Gemini mode and requires a valid API key. The AI README documents model setup, fixture mode, service boundaries, and test coverage.

## How PayPal and AI are used

### PayPal

The Express API integrates with PayPal REST APIs using server-side OAuth credentials. In checkout, VelaPal creates a PayPal order and captures it after the buyer approves it. The dispute workflow can issue a PayPal capture refund after the required party consents and Seller financial authorization are recorded. The API also includes PayPal webhook signature verification and reconciliation paths. Optional PayPal multiparty APIs support seller onboarding and recurring subscriptions when the merchant app has those capabilities enabled. Local development uses PayPal Sandbox; set credentials in `apps/api/.env`. The interactive `npm run smoke:paypal` script creates, captures, and refunds a sandbox order.

### AI

The Python FastAPI service uses LangGraph to coordinate evidence retrieval, party preparation, mediation assistance, and grounding checks. In live mode, Gemini generates structured drafts and creates 768-dimensional embeddings; Qdrant stores and retrieves authorized evidence vectors. The service returns findings with source citations and preserves uncertainty. Express remains authoritative for identity, evidence access, review decisions, consent, and financial execution: AI does not execute PayPal operations or make a binding dispute decision. Fixture mode provides deterministic local behavior without Gemini calls.

### Tools and technologies

The project also uses Next.js, React, TypeScript, Tailwind CSS, Express, Prisma, PostgreSQL, Docker Compose, MinIO (S3-compatible object storage), and Qdrant. Python dependencies include FastAPI, LangGraph, and Gemini API calls made over HTTPX.

No APIMatic, Postman/Astro, or Render integration is configured in this repository. The documented development setup runs locally with Docker Compose. If one of these sponsor tools is used for a submission or deployment, document its actual workspace, collection, service, or deployed URL here.

VelaPal-authored code and documentation are released under the [MIT License](https://opensource.org/license/mit/), an OSI-approved license. Third-party dependencies and assets, including the bundled Geist font, retain their own licenses.

## Useful commands

Run commands from the corresponding app directory:

| App | Command | Purpose |
| --- | --- | --- |
| `apps/web` | `npm run build` | Build the frontend. |
| `apps/web` | `npm run lint` | Lint frontend code. |
| `apps/web` | `npm run typecheck` | Run TypeScript checks. |
| `apps/web` | `npm test` | Run frontend API client tests. |
| `apps/api` | `npm run build` | Compile the API. |
| `apps/api` | `npm run smoke:paypal` | Run the interactive PayPal sandbox capture/refund smoke flow; valid sandbox credentials are required. |
| `apps/ai` | `python -m pytest -q` | Run AI service tests (install `requirements-dev.in` first). |

## Configuration and security

- Keep real credentials in local `.env` files. Never commit secrets.
- Replace the example service tokens and HMAC secret for any shared environment; matching directional values must be configured on both services.
- MinIO stores private objects. The API issues short-lived signed URLs after authorization checks.
- Gemini live mode makes real model requests. AI outputs and model mode do not represent PayPal transaction provenance.
- The PayPal smoke script performs a real sandbox capture and refund when approved in the browser.

## More details

- [API setup and PayPal configuration](apps/api/README.md)
- [Frontend setup](apps/web/README.md)
- [AI service setup, design, and test scope](apps/ai/README.md)
- [VelaPal API contract](packages/contracts/velapal-v6.1-api-contract.md)
- [MIT License](LICENSE)
