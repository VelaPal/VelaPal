# VelaPal V6.1 - Backend API

The authoritative backend service for VelaPal V6.1, built with Express, TypeScript, and Prisma. It handles session authentication, RBAC, financial execution via PayPal Sandbox, and a Durable Outbox Worker for AI and Storage integrations.

## Tech Stack
*   **Framework:** Express + TypeScript
*   **Database ORM:** Prisma
*   **Database:** PostgreSQL (Containerized via Docker)
*   **Storage:** MinIO (S3-compatible local storage)
*   **Integrations:** PayPal REST API (Sandbox)

## Local Development Setup

### 1. Start Infrastructure
Make sure you are in the root directory (`velapal-v6.1`) and start the Docker containers (Postgres, MinIO, Qdrant):
```bash
docker compose up -d
```
*Note: Postgres runs on port `5433` and MinIO on `9002` (API) / `9003` (Console).*

The MinIO Compose service allows browser CORS from local web origins on port `3000` through MinIO's global CORS setting. The `minio-init` service creates the private `velapal-private` bucket; run `docker compose up -d minio minio-init` after changing storage configuration. The bucket remains private; the API issues signed upload and download URLs.

### 2. Environment Configuration
Navigate to the `apps/api` folder and copy the environment template:
```bash
cd apps/api
cp .env.example .env
```
Ensure the `DATABASE_URL` matches your Docker configuration (e.g., using `password123` and port `5433`), and set your `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`.

For provider-backed seller authorization and recurring subscriptions, the PayPal REST app must also be approved for Partner Referrals / multiparty features. Configure `PAYPAL_PARTNER_MERCHANT_ID`, `PAYPAL_PARTNER_ATTRIBUTION_ID`, `PAYPAL_WEBHOOK_ID`, and a public `PAYPAL_ONBOARDING_RETURN_URL`. The return URL must be registered with the PayPal app. Without these partner settings, ordinary checkout can still use the standard app credentials, while seller authorization and subscriptions stay unavailable. Configure PayPal webhooks for merchant onboarding and billing subscription lifecycle events so local records follow provider-confirmed state.

### 3. Install & Database Sync
```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts
```
*The seed script will populate 3 demo users (Customer, Seller, Admin) and mock product data.*

Customer preferences, notifications, paid digital-library entitlements, seller profiles, merchant applications, catalogue products, and provider subscriptions are stored in PostgreSQL. Digital downloads are private S3-compatible objects and are issued as short-lived signed URLs only after a paid transaction is verified.

### 4. Run the Server
```bash
npm run dev
```
The API will be available at `http://localhost:4000`.

## Available Scripts
*   `npm run dev`: Starts the Express server in watch mode using `tsx`.
*   `npm run build`: Compiles TypeScript to JavaScript in the `dist/` folder.
*   `npm run start`: Runs the compiled JavaScript for production.
*   `npm run smoke:paypal`: Runs a local capability spike to verify PayPal Sandbox credentials.
