# VelaPal V6.1 — Master API & Internal Service Contract (Frozen Release)

Version: **6.1.1 (Review Fixes Applied & Frozen)** | Date: **November 5, 2026** | Owner: **Yunggi (BE)** | Reviewers: **Deff (FE), Ibnu (AI)**

---

## 1. Architecture, Conventions & Transport Envelopes

| Service | Workspace Path | Default Port | Core Responsibilities |
| :--- | :--- | :--- | :--- |
| **Web Client** | `apps/web` | `3000` | Next.js + Tailwind UI across Customer, Seller, and Admin workspaces |
| **Business API** | `apps/api` | `4000` | Express + TypeScript, Session/RBAC, PostgreSQL Durable Outbox, Consent Ledger, PayPal Executor |
| **AI Orchestrator** | `apps/ai` | `8000` | Python FastAPI, Single LangGraph Workflow (5 logical functions), Gemini, Qdrant, Postgres Checkpointer |
| **Shared Contracts** | `packages/contracts` | — | OpenAPI / JSON Schemas, DTOs, Enums, and coherent validation fixtures |

### 1.1 Global Prefixes, Auth & Security Headers
* **Public API Prefix:** All browser-facing routes use `/api/v1`.
* **Internal Service Prefix:** All worker-to-AI and AI-to-Express routes use `/internal/v1`.
* **Session & CSRF Protection:**
  * Authenticated browser requests use an `HttpOnly`, `Secure`, `SameSite=Lax` cookie (`__Host-velapal` in production / `velapal_session` in local dev).
  * Every state-changing browser request (`POST`, `PUT`, `PATCH`, `DELETE`) **must** include `X-CSRF-Token: <session-bound-csrf-token>` and a valid `Origin` header matching the web origin.
  * **Page Reload Recovery:** `GET /api/v1/auth/session` returns the active session, workspace, and fresh `csrfToken` so browser reloads never lose CSRF state.
  * **Webhook Exception:** `POST /api/v1/webhooks/paypal` is **exempt** from browser Session, CSRF, and `Origin` checks; it is authenticated strictly via PayPal cryptographic signature verification (`POST /v1/notifications/verify-webhook-signature`).
* **Directional Internal Service Tokens:**
  * Express Outbox Worker ➔ Python FastAPI requests must carry: `X-Worker-Service-Token: <WORKER_TO_AI_SECRET>`
  * Python FastAPI ➔ Express Backend requests must carry: `X-AI-Callback-Token: <AI_TO_EXPRESS_SECRET>`
* **Idempotency (`Idempotency-Key`):**
  * Required on `POST /api/v1/checkout/orders`, `POST /api/v1/checkout/orders/:id/capture`, `POST /api/v1/disputes`, `POST /api/v1/action-requests/:id/execute`, and `POST /api/v1/operations/:id/reconcile`.
  * **Uniqueness & Conflict Rule:** Uniqueness is enforced on `(actorId, workspaceId, route, idempotencyKey)`. The server stores `requestHash` on first creation. If a client re-sends the exact same `(actorId, workspaceId, route, idempotencyKey)` with a matching `requestHash`, the server returns the stored response/operation. If `requestHash` differs, the server rejects with `409 IDEMPOTENCY_CONFLICT`.
* **Money Representation:** All monetary values are stored and transported as **integer minor units** (`5900` = USD 59.00, `2000` = USD 20.00) alongside `"currency": "USD"`. Conversion to decimal strings (`"59.00"`) occurs strictly inside the PayPal adapter.

### 1.2 Explicit Version Counters & `If-Match` Rules (No Header/Body Duplication)
To prevent version collisions between material evidence changes, private drafts, and admin workflow controls, optimistic concurrency uses **single-source `If-Match` headers** (no duplicate `expectedVersion` fields in request bodies):

| Version Counter | When It Increments | Endpoints Using It in `If-Match` |
| :--- | :--- | :--- |
| **`caseVersion`** | **ONLY** when shared material case context changes: shared source added (`share`), shared source revoked (`revoke`), shared message posted (`audience: CASE_SHARED`), or a new `Proposal` is created. *(Admin `PAUSE`/`RESUME` or private drafts NEVER increment `caseVersion`).* | `POST /disputes/:id/messages` (when shared), `POST /disputes/:id/assessments`, `POST /disputes/:id/proposals`, `POST /action-requests/:id/execute` |
| **`privateContextVersion`** | Increments when a party adds/edits a `PRIVATE` message or private preparation draft. | `POST /disputes/:id/messages` (when `PRIVATE`) |
| **`sourceVersion`** | Increments per individual `sourceId` when finalized, shared, or revoked. | `POST /disputes/:id/sources/:sid/finalize`, `POST /disputes/:id/sources/:sid/share`, `POST /disputes/:id/sources/:sid/revoke` |
| **`controlVersion`** | Increments when `control` changes (`RUNNING` ↔ `WAITING_ADMIN` ↔ `PAUSED` ↔ `MANUAL`) via review requests or Admin interventions. | `POST /admin/disputes/:id/interventions` |
| **`proposalVersion`** | Increments if a proposal is superseded by a new proposal on the case. | `POST /action-requests/:id/consents`, `POST /admin/approval-requests/:id/decisions` |
| **`accessRevision`** | Monotonic per-case counter incremented on any source `share` or `revoke` to invalidate cached ACLs and retrieval chunks. | Checked on internal AI checkpoint commit (`POST /internal/v1/case-runs/:id/checkpoints`) |

### 1.3 Coherent Lifecycle Fixture Trace (`case_vp_0421` Version Chain)
All examples in this contract and in `packages/contracts` follow one unbroken version chain for fixture **`case_vp_0421`**:
* **`caseVersion: 1`** — Customer opens dispute on `tx_vp_1028` with initial shared statement (`accessRevision: 1`, `controlVersion: 1`).
* **`caseVersion: 2`** — Customer uploads `src_label_01` (`sourceVersion: 1`, `PRIVATE` ➔ shared to `CASE_SHARED` at `sourceVersion: 2`, `accessRevision: 2`).
* **`caseVersion: 3`** — Seller posts shared response statement and shares `src_invoice_01` (`sourceVersion: 2`, `accessRevision: 3`).
* **Assessment #1 (`inputVersion: 3`)** — AI detects invoice (256 GB) vs label (128 GB) conflict (`status: NEEDS_INFO`, `nextStep: REQUEST_PACKING_SERIAL`). `control` transitions to `WAITING_ADMIN` (`controlVersion: 2`; **`caseVersion` remains `3`**).
* **Admin Intervention** — Admin assigns self and records `ALLOW_VOLUNTARY_MEDIATION` (`control` becomes `RUNNING`, `controlVersion: 3`; **`caseVersion` remains `3`**).
* **`caseVersion: 4`** — Customer uploads & shares serial photo `src_serial_02` (`sourceVersion: 2`, `accessRevision: 4`).
* **`caseVersion: 5`** — Customer posts shared message referencing `src_serial_02`.
* **Assessment #2 (`inputVersion: 5`)** — AI completes synthesis (`status: COMPLETED`, `nextStep: PROPOSE_VOLUNTARY_SETTLEMENT`).
* **`caseVersion: 6`** — Seller creates voluntary partial refund proposal of USD 20.00 (`proposalId: prop_01JBYE`, `proposalVersion: 1`, `actionRequestId: act_01JBYX`).
* **Consents & Execution (`caseVersion: 6`)** — Customer and Seller grant consents against `caseVersion: 6`, `proposalVersion: 1`, and `paramsHash`. Seller executes `act_01JBYX` with `If-Match: "6"`.

### 1.4 Standard Response Envelopes

**Success Envelope (`200`, `201`, `202`):**
```json
{
  "data": { ... },
  "meta": {
    "traceId": "tr_01JBY7K9X2",
    "version": 6,
    "timestamp": "2026-11-05T14:00:00.000Z"
  }
}
```

**Error Envelope (`400`, `401`, `403`, `404`, `409`, `422`, `429`, `503`):**
```json
{
  "error": {
    "code": "STALE_CONSENT",
    "message": "Shared evidence changed after this consent was granted. Please review the updated terms.",
    "fieldErrors": {},
    "traceId": "tr_01JBY7K9X2",
    "retryable": false,
    "currentVersion": 6
  }
}
```

---

## 2. Frozen Enums (V6.1)

* **`stage` (Case Axis 1):** `AWAITING_EVIDENCE` | `MEDIATING` | `AWAITING_CONSENT` | `EXECUTION_PENDING` | `EXECUTION_UNKNOWN` | `EXTERNAL_PENDING` | `RESOLVED` | `CLOSED_NO_AGREEMENT`
* **`control` (Case Axis 2):** `RUNNING` | `WAITING_ADMIN` | `PAUSED` | `MANUAL`
* **`operationStatus` (Case Axis 3 — Provider Operation Status):** `IDLE` | `PENDING` | `SUCCEEDED` | `FAILED` | `UNKNOWN` | `UNAVAILABLE`
* **`operationType`:** `ORDER_CAPTURE` | `CAPTURE_REFUND` | `DISPUTE_MAKE_OFFER` | `SUBSCRIPTION_CANCEL`
* **`paymentStatus` (Transactions & Orders):** `APPROVAL_PENDING` | `UNCONFIRMED` | `PAID` | `PARTIALLY_REFUNDED` | `REFUNDED` | `FAILED` | `UNKNOWN`
* **`disputeCategory`:** `ITEM_NOT_AS_DESCRIBED` | `ITEM_NOT_RECEIVED` | `PAYMENT_NOT_CONFIRMED` | `FULFILMENT_OR_RETURN_ISSUE` | `BILLING_OR_RENEWAL_CONCERN` | `CONTESTED_CLAIM`
* **`initiatorParty` / `partyType`:** `CUSTOMER` | `SELLER`
* **`audience`:** `PRIVATE` | `CASE_SHARED` | `PROVIDER_SHARED` | `REVOKED`
* **`scanState`:** `QUARANTINED` | `SCANNING` | `CLEAN` | `REJECTED`
* **`aiPurpose` (5 Logical Functions):**
  1. `PERSONAL_ASSISTANT` — Customer shopping & transaction assistant
  2. `CUSTOMER_PREPARATION` — Isolated private assistance for Customer
  3. `SELLER_PREPARATION` — Isolated private assistance for Seller
  4. `SHARED_ASSESSMENT` — Evidence synthesis + mediation options on shared case context
* **`aiRunStatus`:** `QUEUED` | `RUNNING` | `NEEDS_INFO` | `COMPLETED` | `ABSTAINED` | `STALE` | `FAILED`
* **`aiNextStep`:** `REQUEST_CLARIFICATION` | `REQUEST_PACKING_SERIAL` | `REQUEST_PAYMENT_PROOF` | `PROPOSE_VOLUNTARY_SETTLEMENT` | `ESCALATE_TO_ADMIN` | `OFFICIAL_CHANNEL_HANDOFF` | `NONE`
* **`modelMode`:** `live` | `fixture`
* **`businessDataMode`:** `paypal_sandbox` | `synthetic_fixture`
* **`consentIntent` (4 Distinct Intents — Never Merged):**
  1. `SHARE_SOURCE` — Owner consent to share a specific `sourceId` + `sourceVersion`
  2. `CONTINUE_MEDIATION` — Party consent to proceed with voluntary mediation when uncertainty remains
  3. `ACCEPT_PROPOSAL_TERMS` — Bilateral party agreement to exact settlement `Proposal` terms
  4. `AUTHORIZE_FINANCIAL_EXECUTION` — Merchant fund-owner authorization to execute the `ActionRequest`
* **`settlementRoute`:** `PAYPAL_CAPTURE_REFUND` | `PAYPAL_DISPUTE_MAKE_OFFER` | `OFFICIAL_HANDOFF`

---

## 3. Public API: Identity, Session, MFA Step-Up & Transactions (`/api/v1`)

### 3.1 `POST /api/v1/auth/login` (P0)
Authenticates a user account. Standard accounts receive an active session immediately; `ADMIN` accounts receive a `SESSION_LOGIN` MFA challenge.
* **Request Body:**
  ```json
  {
    "email": "customer@velapal.demo",
    "password": "correct-horse-battery-staple"
  }
  ```
* **Response `200 OK` (Authenticated Session):**
  ```json
  {
    "data": {
      "status": "AUTHENTICATED",
      "csrfToken": "csrf_9f8e7d6c5b",
      "user": {
        "id": "usr_cust_01",
        "email": "customer@velapal.demo",
        "name": "Daffa Yunus"
      },
      "activeWorkspace": {
        "workspaceId": "ws_cust_01",
        "type": "CUSTOMER",
        "name": "Personal Workspace",
        "merchantId": null,
        "role": "CUSTOMER"
      }
    },
    "meta": { "traceId": "tr_login_01", "version": 1, "timestamp": "2026-11-05T14:00:00.000Z" }
  }
  ```
* **Response `200 OK` (Admin MFA Login Challenge Required):**
  ```json
  {
    "data": {
      "status": "MFA_REQUIRED",
      "challengeId": "mfa_ch_login_01",
      "purpose": "SESSION_LOGIN",
      "targetId": null,
      "expiresAt": "2026-11-05T14:05:00.000Z"
    },
    "meta": { "traceId": "tr_login_02", "version": 1, "timestamp": "2026-11-05T14:00:00.000Z" }
  }
  ```

### 3.2 `GET /api/v1/auth/session` (P0)
Restores current session profile, active workspace, and a valid `csrfToken` on browser reload.
* **Response `200 OK`:** Same payload structure as `AUTHENTICATED` in `3.1`.

### 3.3 `POST /api/v1/auth/mfa/challenges` (P0)
Creates a purpose-bound MFA step-up challenge for an already-authenticated user before performing a sensitive operation (`ADMIN_INTERVENTION`, `ADMIN_APPROVAL`, `WORKSPACE_SWITCH`, `MERCHANT_EXECUTION`).
* **Request Body:**
  ```json
  {
    "purpose": "ADMIN_INTERVENTION",
    "targetId": "case_vp_0421"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "data": {
      "challengeId": "mfa_ch_step_02",
      "purpose": "ADMIN_INTERVENTION",
      "targetId": "case_vp_0421",
      "expiresAt": "2026-11-05T14:05:00.000Z"
    },
    "meta": { "traceId": "tr_mfa_ch_01", "version": 1, "timestamp": "2026-11-05T14:00:10.000Z" }
  }
  ```

### 3.4 `POST /api/v1/auth/mfa/verify` (P0)
Verifies either a `SESSION_LOGIN` challenge (rotating the session cookie and returning `session` + `csrfToken`) or a step-up challenge (returning `stepUpId`).
* **Request Body:**
  ```json
  {
    "challengeId": "mfa_ch_step_02",
    "code": "123456"
  }
  ```
* **Response `200 OK` (When `purpose === "SESSION_LOGIN"`):**
  ```json
  {
    "data": {
      "status": "AUTHENTICATED",
      "purpose": "SESSION_LOGIN",
      "csrfToken": "csrf_admin_rotated_9912",
      "user": {
        "id": "usr_admin_01",
        "email": "admin@velapal.demo",
        "name": "Arya Pratama"
      },
      "activeWorkspace": {
        "workspaceId": "ws_adm_01",
        "type": "ADMIN",
        "name": "VelaPal Operations",
        "merchantId": null,
        "role": "SUPERVISOR"
      }
    },
    "meta": { "traceId": "tr_mfa_v1", "version": 1, "timestamp": "2026-11-05T14:01:00.000Z" }
  }
  ```
* **Response `200 OK` (When `purpose` is Step-Up, e.g., `ADMIN_INTERVENTION`):**
  ```json
  {
    "data": {
      "status": "STEP_UP_VERIFIED",
      "stepUpId": "stepup_01JBY8",
      "purpose": "ADMIN_INTERVENTION",
      "targetId": "case_vp_0421",
      "expiresAt": "2026-11-05T14:11:00.000Z"
    },
    "meta": { "traceId": "tr_mfa_v2", "version": 1, "timestamp": "2026-11-05T14:01:00.000Z" }
  }
  ```

### 3.5 `POST /api/v1/auth/logout` (P0)
Revokes the server session and clears cookies.
* **Response `204 No Content`**

### 3.6 `GET /api/v1/me/workspaces` & `POST /api/v1/session/workspace` (P0)
Lists granted workspaces or switches the active workspace context on the session.
* **Request Body (`POST /api/v1/session/workspace`):**
  ```json
  {
    "workspaceId": "ws_sell_01",
    "stepUpId": null
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "activeWorkspace": {
        "workspaceId": "ws_sell_01",
        "type": "SELLER",
        "name": "Vela Market",
        "merchantId": "merch_vela_01",
        "role": "SELLER_OWNER"
      },
      "csrfToken": "csrf_rotated_8821"
    },
    "meta": { "traceId": "tr_ws_02", "version": 2, "timestamp": "2026-11-05T14:01:30.000Z" }
  }
  ```

### 3.7 `GET /api/v1/catalog` & `POST /api/v1/quotes` (P0)
* **`GET /api/v1/catalog` Response `200 OK`:** Returns merchant catalog products (`prod_pocket_drive`, variants `128GB` @ `3900` and `256GB` @ `5900`).
* **`POST /api/v1/quotes` Request Body:**
  ```json
  {
    "productId": "prod_pocket_drive",
    "variantId": "256GB",
    "quantity": 1,
    "spendingLimitMinor": 10000
  }
  ```
* **`POST /api/v1/quotes` Response `201 Created`:**
  ```json
  {
    "data": {
      "quoteId": "qt_01JBY9",
      "merchantId": "merch_vela_01",
      "productId": "prod_pocket_drive",
      "sku": "PD-256-M",
      "variantId": "256GB",
      "quantity": 1,
      "amountMinor": 5900,
      "currency": "USD",
      "spendingLimitMinor": 10000,
      "ruleResult": "READY",
      "quoteVersion": 1,
      "expiresAt": "2026-11-05T14:30:00.000Z"
    },
    "meta": { "traceId": "tr_qt_01", "version": 1, "timestamp": "2026-11-05T14:01:45.000Z" }
  }
  ```

### 3.8 `POST /api/v1/checkout/orders` & `POST /api/v1/checkout/orders/:id/capture` (P0)
* **`POST /api/v1/checkout/orders`** (Headers: `Idempotency-Key: chk-ord-001`): Freezes `PurchaseSnapshot`, creates local `orderId` (`ord_vp_1028`), and calls PayPal `POST /v2/checkout/orders`.
* **`POST /api/v1/checkout/orders/:id/capture`** (Headers: `Idempotency-Key: chk-cap-001`): Enqueues/executes order capture after buyer approval and returns `202 Accepted` with `operationId: "op_cap_01JBYB"`.

### 3.9 `GET /api/v1/transactions` & `GET /api/v1/transactions/:id` (P0)
Returns authorized orders and transactions (including unconfirmed orders like `VP-0422` where `paymentStatus === "UNCONFIRMED"` and `paypalCaptureId === null`).
* **Response `200 OK` (`GET /api/v1/transactions/tx_vp_1028`):**
  ```json
  {
    "data": {
      "transaction": {
        "id": "tx_vp_1028",
        "orderId": "ord_vp_1028",
        "customerId": "usr_cust_01",
        "merchantId": "merch_vela_01",
        "merchantName": "Vela Market",
        "paypalOrderId": "5O190127TN364715T",
        "paypalCaptureId": "2GG903537H408804M",
        "amountMinor": 5900,
        "refundableRemainingMinor": 5900,
        "currency": "USD",
        "paymentStatus": "PAID",
        "verifiedAt": "2026-11-05T14:02:10.000Z"
      },
      "snapshot": {
        "snapshotId": "snap_01JBYA",
        "sku": "PD-256-M",
        "variantId": "256GB",
        "quantity": 1,
        "amountMinor": 5900,
        "currency": "USD",
        "snapshotHash": "sha256_8f9d2a1b..."
      },
      "activeCaseId": "case_vp_0421"
    },
    "meta": { "traceId": "tr_tx_01", "version": 1, "timestamp": "2026-11-05T14:02:15.000Z" }
  }
  ```

### 3.10 `GET /api/v1/operations/:id` & `POST /api/v1/operations/:id/reconcile` (P0)
Reads or actively reconciles an in-flight or `UNKNOWN` provider operation **on the exact same `operationId`** (never creating a second financial intent).
* **`GET /api/v1/operations/:id` Response `200 OK`:**
  ```json
  {
    "data": {
      "operationId": "op_ref_01JBYZ",
      "type": "CAPTURE_REFUND",
      "actionRequestId": "act_01JBYX",
      "caseId": "case_vp_0421",
      "route": "PAYPAL_CAPTURE_REFUND",
      "status": "UNKNOWN",
      "amountMinor": 2000,
      "currency": "USD",
      "providerRef": null,
      "lastCheckedAt": "2026-11-05T14:24:00.000Z",
      "verifiedAt": null,
      "nextStep": "Provider timed out. Use Reconcile to query PayPal status for this operation without sending a duplicate refund."
    },
    "meta": { "traceId": "tr_op_01", "version": 1, "timestamp": "2026-11-05T14:24:00.000Z" }
  }
  ```
* **`POST /api/v1/operations/:id/reconcile`** (Headers: `Idempotency-Key: rec-op_ref_01JBYZ-01`):
  Queries PayPal `GET /v2/payments/captures/{id}` / `GET /v2/payments/refunds/{id}` or `GET /v1/customer/disputes/{id}` for the existing `operationId` and updates the outcome.
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "operationId": "op_ref_01JBYZ",
      "type": "CAPTURE_REFUND",
      "actionRequestId": "act_01JBYX",
      "caseId": "case_vp_0421",
      "route": "PAYPAL_CAPTURE_REFUND",
      "status": "SUCCEEDED",
      "amountMinor": 2000,
      "currency": "USD",
      "providerRef": "9JU7654321098765A",
      "lastCheckedAt": "2026-11-05T14:25:00.000Z",
      "verifiedAt": "2026-11-05T14:25:00.000Z",
      "caseStage": "RESOLVED",
      "nextStep": "Refund of USD 20.00 verified by PayPal Sandbox."
    },
    "meta": { "traceId": "tr_op_02", "version": 2, "timestamp": "2026-11-05T14:25:00.000Z" }
  }
  ```

### 3.11 `POST /api/v1/agent/runs` & `GET /api/v1/agent/runs/:id` (P0)
Triggers or polls `PERSONAL_ASSISTANT`, `CUSTOMER_PREPARATION`, or `SELLER_PREPARATION`.
* **Request Body (`POST /api/v1/agent/runs`):**
  ```json
  {
    "purpose": "CUSTOMER_PREPARATION",
    "caseId": "case_vp_0421",
    "prompt": "Help me organize my statement about the 128 GB label."
  }
  ```
  *(When `purpose === "PERSONAL_ASSISTANT"`, `caseId` is `null` and the assistant reads the actor's catalog/spending limit/transaction list).*
* **Response `202 Accepted`:**
  ```json
  {
    "data": {
      "runId": "run_priv_01",
      "purpose": "CUSTOMER_PREPARATION",
      "audience": "PRIVATE",
      "status": "QUEUED",
      "pollUrl": "/api/v1/agent/runs/run_priv_01"
    },
    "meta": { "traceId": "tr_run_01", "version": 1, "timestamp": "2026-11-05T14:03:00.000Z" }
  }
  ```

---

## 4. Public API: Two-Sided Dispute Cases & Sources (`/api/v1`)

### 4.1 `POST /api/v1/disputes` (P0)
Opens an internal two-sided case initiated by either `CUSTOMER` (via `transactionId`) or `SELLER` (via `transactionId` or `orderId`, e.g., fixture `VP-0422` where payment is unconfirmed and no capture exists yet).
* **Duplicate Policy (Frozen):** Deduplicates active cases using `issueKey = (transactionId || orderId, category)`. If an active case already exists for the same `issueKey`, the server returns **`409 DUPLICATE_ACTIVE_CASE`** with `existingCaseId` in `error.fieldErrors.existingCaseId` so the UI redirects cleanly to the active case.
* **Headers:** `Idempotency-Key: dsp-open-001`
* **Request Body:**
  ```json
  {
    "transactionId": "tx_vp_1028",
    "orderId": null,
    "category": "ITEM_NOT_AS_DESCRIBED",
    "statement": "I ordered 256 GB (SKU PD-256-M), but the delivered package label reads 128 GB.",
    "audience": "CASE_SHARED"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "data": {
      "caseId": "case_vp_0421",
      "transactionId": "tx_vp_1028",
      "orderId": "ord_vp_1028",
      "initiatorParty": "CUSTOMER",
      "category": "ITEM_NOT_AS_DESCRIBED",
      "stage": "AWAITING_EVIDENCE",
      "control": "RUNNING",
      "caseVersion": 1,
      "controlVersion": 1,
      "privateContextVersion": 1,
      "accessRevision": 1,
      "nextAction": "UPLOAD_OR_SHARE_EVIDENCE"
    },
    "meta": { "traceId": "tr_dsp_01", "version": 1, "timestamp": "2026-11-05T14:04:00.000Z" }
  }
  ```

### 4.2 `GET /api/v1/disputes` & `GET /api/v1/disputes/:id` (P0)
Fetches the full 3-axis case detail (`stage`, `control`, `providerOperation`), perspectives, authorized sources, messages, timeline events (for the Activity tab), `latestAssessment`, `activeProposal`, and `pendingConsents`.
* **Response `200 OK` (`GET /api/v1/disputes/case_vp_0421` at `caseVersion: 6`):**
  ```json
  {
    "data": {
      "case": {
        "caseId": "case_vp_0421",
        "transactionId": "tx_vp_1028",
        "orderId": "ord_vp_1028",
        "merchantId": "merch_vela_01",
        "initiatorParty": "CUSTOMER",
        "category": "ITEM_NOT_AS_DESCRIBED",
        "stage": "AWAITING_CONSENT",
        "control": "RUNNING",
        "caseVersion": 6,
        "controlVersion": 3,
        "privateContextVersion": 2,
        "accessRevision": 4,
        "nextAction": "REVIEW_AND_CONSENT_PROPOSAL",
        "officialPaypalDisputeId": null,
        "capabilities": {
          "canShareEvidence": true,
          "canPostMessage": true,
          "canProposeTerms": true,
          "canGrantConsent": true,
          "canExecuteSettlement": false,
          "canRequestReview": true,
          "supportedSettlementRoutes": ["PAYPAL_CAPTURE_REFUND", "OFFICIAL_HANDOFF"]
        }
      },
      "providerOperation": {
        "operationId": null,
        "type": null,
        "route": "PAYPAL_CAPTURE_REFUND",
        "status": "IDLE",
        "providerRef": null,
        "verifiedAt": null
      },
      "snapshot": {
        "snapshotId": "snap_01JBYA",
        "sku": "PD-256-M",
        "variantId": "256GB",
        "amountMinor": 5900,
        "currency": "USD"
      },
      "perspectives": {
        "customerStatement": "I ordered 256 GB. The received item is labelled 128 GB.",
        "sellerStatement": "Our invoice records SKU PD-256-M. Packing serial still needs checking."
      },
      "sources": [
        {
          "sourceId": "src_label_01",
          "sourceVersion": 2,
          "ownerParty": "CUSTOMER",
          "originalName": "photo-label-128gb.jpg",
          "mime": "image/jpeg",
          "scanState": "CLEAN",
          "audience": "CASE_SHARED",
          "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
          "locator": "image:1"
        },
        {
          "sourceId": "src_invoice_01",
          "sourceVersion": 2,
          "ownerParty": "SELLER",
          "originalName": "invoice-pd-256.pdf",
          "mime": "application/pdf",
          "scanState": "CLEAN",
          "audience": "CASE_SHARED",
          "sha256": "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
          "locator": "page:1"
        },
        {
          "sourceId": "src_serial_02",
          "sourceVersion": 2,
          "ownerParty": "CUSTOMER",
          "originalName": "serial-number-box.jpg",
          "mime": "image/jpeg",
          "scanState": "CLEAN",
          "audience": "CASE_SHARED",
          "sha256": "4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a",
          "locator": "image:1"
        }
      ],
      "messages": [
        {
          "messageId": "msg_01JBYD",
          "authorParty": "CUSTOMER",
          "audience": "CASE_SHARED",
          "text": "The serial number on the back of the enclosure is SN-PD128-9921, which matches a 128 GB batch.",
          "sourceRefs": [{ "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }],
          "createdAt": "2026-11-05T14:18:00.000Z"
        }
      ],
      "latestAssessment": {
        "runId": "run_shared_02",
        "inputVersion": 5,
        "status": "COMPLETED",
        "audience": "CASE_SHARED",
        "modelMode": "live",
        "businessDataMode": "paypal_sandbox",
        "category": "ITEM_NOT_AS_DESCRIBED",
        "verifiedFacts": [
          {
            "text": "Paid transaction of USD 59.00 for SKU PD-256-M (256 GB) is verified on server.",
            "sourceRefs": [{ "sourceId": "snap_01JBYA", "version": 1, "locator": "record:1" }]
          }
        ],
        "claims": [
          {
            "party": "CUSTOMER",
            "text": "Customer states the delivered unit label and serial SN-PD128-9921 belong to a 128 GB unit.",
            "sourceRefs": [
              { "sourceId": "src_label_01", "version": 2, "locator": "image:1" },
              { "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }
            ]
          },
          {
            "party": "SELLER",
            "text": "Seller explains the warehouse invoice lists SKU PD-256-M (256 GB).",
            "sourceRefs": [{ "sourceId": "src_invoice_01", "version": 2, "locator": "page:1" }]
          }
        ],
        "findings": [
          {
            "findingId": "fnd_02",
            "kind": "OBSERVATION",
            "text": "Uploaded serial photo SN-PD128-9921 links the physical enclosure to the 128 GB SKU tier.",
            "sourceRefs": [{ "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }]
          }
        ],
        "missingEvidence": [],
        "uncertainty": "Physical serial photo supports a packing mismatch, though warehouse physical inventory recount was not uploaded.",
        "policyReferences": ["POL-DISPUTE-EVIDENCE-01", "POL-VOLUNTARY-REFUND-02"],
        "nextStep": "PROPOSE_VOLUNTARY_SETTLEMENT",
        "requiresHumanApproval": false
      },
      "activeProposal": {
        "proposalId": "prop_01JBYE",
        "proposalVersion": 1,
        "proposerParty": "SELLER",
        "caseVersion": 6,
        "actionRequestId": "act_01JBYX",
        "terms": "Voluntary partial refund of USD 20.00 to cover the capacity difference without item return.",
        "money": { "amountMinor": 2000, "currency": "USD" },
        "route": "PAYPAL_CAPTURE_REFUND",
        "sourceDigest": "sha256_manifest_v5_991a...",
        "paramsHash": "sha256_params_77b2c1...",
        "status": "AWAITING_CONSENT",
        "expiresAt": "2026-11-05T15:20:00.000Z"
      },
      "pendingConsents": [
        { "party": "SELLER", "intent": "ACCEPT_PROPOSAL_TERMS", "status": "APPROVED", "approvedAt": "2026-11-05T14:20:00.000Z" },
        { "party": "CUSTOMER", "intent": "ACCEPT_PROPOSAL_TERMS", "status": "PENDING", "approvedAt": null },
        { "party": "SELLER", "intent": "AUTHORIZE_FINANCIAL_EXECUTION", "status": "PENDING", "approvedAt": null }
      ],
      "activityTimeline": [
        { "eventId": "ev_01", "type": "CASE_OPENED", "actorParty": "CUSTOMER", "summary": "Case opened for tx_vp_1028", "caseVersion": 1, "at": "2026-11-05T14:04:00.000Z" },
        { "eventId": "ev_02", "type": "SOURCE_SHARED", "actorParty": "CUSTOMER", "summary": "Shared photo-label-128gb.jpg (v2)", "caseVersion": 2, "at": "2026-11-05T14:06:00.000Z" },
        { "eventId": "ev_03", "type": "SOURCE_SHARED", "actorParty": "SELLER", "summary": "Shared invoice-pd-256.pdf (v2)", "caseVersion": 3, "at": "2026-11-05T14:08:00.000Z" },
        { "eventId": "ev_04", "type": "ADMIN_INTERVENTION", "actorParty": "ADMIN", "summary": "Supervisor allowed voluntary mediation", "caseVersion": 3, "at": "2026-11-05T14:17:00.000Z" },
        { "eventId": "ev_05", "type": "PROPOSAL_CREATED", "actorParty": "SELLER", "summary": "Seller proposed USD 20.00 partial refund", "caseVersion": 6, "at": "2026-11-05T14:20:00.000Z" }
      ]
    },
    "meta": { "traceId": "tr_dsp_02", "version": 6, "timestamp": "2026-11-05T14:20:05.000Z" }
  }
  ```

### 4.3 `POST /api/v1/disputes/:id/sources/upload-intents` (P0)
Creates a quarantined `PRIVATE` upload intent (`sourceVersion: 1`, `scanState: "QUARANTINED"`).
* **Request Body:**
  ```json
  {
    "mime": "image/jpeg",
    "byteCount": 420100,
    "originalName": "serial-number-box.jpg"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "data": {
      "sourceId": "src_serial_02",
      "uploadId": "upl_01JBYC",
      "sourceVersion": 1,
      "audience": "PRIVATE",
      "scanState": "QUARANTINED",
      "uploadHandle": {
        "method": "PUT",
        "url": "https://storage.velapal.local/quarantine/cases/case_vp_0421/src_serial_02-v1?sig=...",
        "expiresInSeconds": 600
      }
    },
    "meta": { "traceId": "tr_src_01", "version": 1, "timestamp": "2026-11-05T14:17:10.000Z" }
  }
  ```

### 4.4 `POST /api/v1/disputes/:id/sources/:sid/finalize` (P0)
Records upload completion in quarantine and enqueues asynchronous malware/MIME/hash scanning and AI extraction. Per PRD §13, returns `202 Accepted` with `scanState: "SCANNING"` (not yet ready for analysis until background scan transitions it to `CLEAN`).
* **Headers:** `If-Match: "1"` *(matches `sourceVersion: 1`)*
* **Request Body:**
  ```json
  {
    "uploadId": "upl_01JBYC"
  }
  ```
* **Response `202 Accepted`:**
  ```json
  {
    "data": {
      "sourceId": "src_serial_02",
      "sourceVersion": 1,
      "audience": "PRIVATE",
      "scanState": "SCANNING",
      "readyForAnalysis": false,
      "indexJobStatus": "QUEUED"
    },
    "meta": { "traceId": "tr_src_02", "version": 1, "timestamp": "2026-11-05T14:17:20.000Z" }
  }
  ```

### 4.5 `GET /api/v1/disputes/:id/sources/:sid` (P0)
Returns source metadata (`scanState`, `sha256`, `locator`, `sourceVersion`) and a short-lived authorized preview URL after ACL verification.

### 4.6 `POST /api/v1/disputes/:id/sources/:sid/share` (P0)
Records an explicit **`SHARE_SOURCE` consent record** in the consent ledger, promotes a `CLEAN` source to `CASE_SHARED` (or `PROVIDER_SHARED`), increments both `sourceVersion` and `caseVersion`, bumps `accessRevision`, and invalidates stale proposals.
* **Headers:** `If-Match: "1"` *(matches `sourceVersion: 1`)*
* **Request Body:**
  ```json
  {
    "audience": "CASE_SHARED",
    "consentIntent": "SHARE_SOURCE",
    "paramsHash": "sha256_share_src_serial_02_v1"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "sourceId": "src_serial_02",
      "sourceVersion": 2,
      "audience": "CASE_SHARED",
      "consentId": "con_share_01",
      "caseVersion": 4,
      "accessRevision": 4,
      "invalidatedProposalIds": []
    },
    "meta": { "traceId": "tr_src_04", "version": 4, "timestamp": "2026-11-05T14:17:45.000Z" }
  }
  ```

### 4.7 `POST /api/v1/disputes/:id/sources/:sid/revoke` (P0)
Immediately blocks backend reads, increments `sourceVersion`, `caseVersion`, and `accessRevision`, invalidates dependent assessments/proposals/consents, and schedules durable Qdrant/memory purge.
* **Headers:** `If-Match: "2"` *(matches `sourceVersion: 2`)*
* **Request Body:**
  ```json
  {
    "reason": "Uploaded wrong image file by mistake"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "sourceId": "src_serial_02",
      "sourceVersion": 3,
      "audience": "REVOKED",
      "caseVersion": 7,
      "accessRevision": 5,
      "invalidatedProposalIds": ["prop_01JBYE"],
      "purgeScheduled": true
    },
    "meta": { "traceId": "tr_src_05", "version": 7, "timestamp": "2026-11-05T14:30:00.000Z" }
  }
  ```

### 4.8 `POST /api/v1/disputes/:id/messages` (P0)
Posts a `PRIVATE` draft (using `If-Match: "<privateContextVersion>"`) or a `CASE_SHARED` statement (using `If-Match: "<caseVersion>"`).
* **Headers:** `If-Match: "4"` *(matches `caseVersion: 4` when `audience === "CASE_SHARED"`)*
* **Request Body:**
  ```json
  {
    "text": "The serial number on the back of the enclosure is SN-PD128-9921, which matches a 128 GB batch.",
    "sourceRefs": [{ "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }],
    "audience": "CASE_SHARED"
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "data": {
      "messageId": "msg_01JBYD",
      "party": "CUSTOMER",
      "audience": "CASE_SHARED",
      "caseVersion": 5,
      "privateContextVersion": 2
    },
    "meta": { "traceId": "tr_msg_01", "version": 5, "timestamp": "2026-11-05T14:18:00.000Z" }
  }
  ```

### 4.9 `POST /api/v1/disputes/:id/assessments` (P0)
Enqueues a shared AI assessment run (`SHARED_ASSESSMENT`) bound to the current `caseVersion`.
* **Headers:** `If-Match: "5"` *(matches `caseVersion: 5`)*
* **Request Body:** `{}`
* **Response `202 Accepted`:**
  ```json
  {
    "data": {
      "runId": "run_shared_02",
      "caseId": "case_vp_0421",
      "inputVersion": 5,
      "status": "QUEUED"
    },
    "meta": { "traceId": "tr_asmt_01", "version": 5, "timestamp": "2026-11-05T14:18:15.000Z" }
  }
  ```

### 4.10 `POST /api/v1/disputes/:id/mediation-consents` (P0)
Records the dedicated **`CONTINUE_MEDIATION` consent** when a party agrees to continue voluntary mediation despite remaining evidence uncertainty (keeping the 4 consent types strictly separated per PRD §7).
* **Headers:** `If-Match: "5"` *(matches `caseVersion: 5`)*
* **Request Body:**
  ```json
  {
    "consentIntent": "CONTINUE_MEDIATION",
    "assessmentRunId": "run_shared_02",
    "paramsHash": "sha256_med_continue_v5",
    "decision": "APPROVED"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "consentId": "con_med_01",
      "caseId": "case_vp_0421",
      "party": "CUSTOMER",
      "intent": "CONTINUE_MEDIATION",
      "decision": "APPROVED",
      "caseVersion": 5,
      "approvedAt": "2026-11-05T14:19:00.000Z"
    },
    "meta": { "traceId": "tr_mcon_01", "version": 5, "timestamp": "2026-11-05T14:19:00.000Z" }
  }
  ```

### 4.11 `POST /api/v1/disputes/:id/proposals` (P0)
Creates a frozen resolution proposal (recording `proposerParty`: `SELLER` or `CUSTOMER`) and its corresponding `ActionRequest` in a single atomic transaction, incrementing `caseVersion` from `5` to `6`.
* **Headers:** `If-Match: "5"` *(matches `caseVersion: 5`)*
* **Request Body:**
  ```json
  {
    "terms": "Voluntary partial refund of USD 20.00 to cover the capacity difference without item return.",
    "money": {
      "amountMinor": 2000,
      "currency": "USD"
    },
    "route": "PAYPAL_CAPTURE_REFUND",
    "sourceDigest": "sha256_manifest_v5_991a...",
    "expiresInMinutes": 60
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "data": {
      "proposalId": "prop_01JBYE",
      "proposalVersion": 1,
      "proposerParty": "SELLER",
      "caseVersion": 6,
      "stage": "AWAITING_CONSENT",
      "actionRequestId": "act_01JBYX",
      "paramsHash": "sha256_params_77b2c1...",
      "requiredConsents": [
        { "party": "SELLER", "intent": "ACCEPT_PROPOSAL_TERMS", "status": "PENDING" },
        { "party": "CUSTOMER", "intent": "ACCEPT_PROPOSAL_TERMS", "status": "PENDING" },
        { "party": "SELLER", "intent": "AUTHORIZE_FINANCIAL_EXECUTION", "status": "PENDING" }
      ],
      "expiresAt": "2026-11-05T15:20:00.000Z"
    },
    "meta": { "traceId": "tr_prop_01", "version": 6, "timestamp": "2026-11-05T14:20:00.000Z" }
  }
  ```

### 4.12 `POST /api/v1/disputes/:id/reviews` (P0)
Contest a finding or request human supervisor review. Transitions `control` to `WAITING_ADMIN` and increments `controlVersion` (without altering `caseVersion`).
* **Request Body:**
  ```json
  {
    "reason": "The invoice SKU does not match the physical serial batch sticker on the unit.",
    "contestedFindingIds": ["fnd_01"],
    "newSourceRefs": [{ "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }]
  }
  ```
* **Response `201 Created`:**
  ```json
  {
    "data": {
      "reviewRequestId": "rev_01JBYF",
      "caseId": "case_vp_0421",
      "control": "WAITING_ADMIN",
      "controlVersion": 2,
      "caseVersion": 3
    },
    "meta": { "traceId": "tr_rev_01", "version": 3, "timestamp": "2026-11-05T14:15:00.000Z" }
  }
  ```

### 4.13 `POST /api/v1/action-requests/:id/consents` (P0)
Records party approval or rejection for `ACCEPT_PROPOSAL_TERMS` or `AUTHORIZE_FINANCIAL_EXECUTION`.
* **Seller financial authorization requires step-up MFA.** The Seller creates a challenge with `POST /api/v1/auth/mfa/challenges` using `purpose: "MERCHANT_EXECUTION"` and `targetId` equal to the `:id` action-request ID. The Seller verifies that challenge with `POST /api/v1/auth/mfa/verify` and the demo OTP `123456`, then sends the returned `stepUpId` token in this consent request. The OTP is used only for challenge verification; it is not the `stepUpId`. The API validates that the token belongs to the authenticated Seller, has the `MERCHANT_EXECUTION` purpose, is valid and unexpired, and is bound to this action request.
* **`stepUpId` requirement:** Required for a Seller's `AUTHORIZE_FINANCIAL_EXECUTION` intent. It may be `null` for ordinary `ACCEPT_PROPOSAL_TERMS` consent, which does not require this financial step-up.
* **Headers:** `If-Match: "1"` *(matches `proposalVersion: 1`)*
* **Request Body (Seller financial authorization):**
  ```json
  {
    "paramsHash": "sha256_params_77b2c1...",
    "caseVersion": 6,
    "intent": "AUTHORIZE_FINANCIAL_EXECUTION",
    "decision": "APPROVED",
    "stepUpId": "tok_abc123"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "consentId": "con_01JBYG",
      "actionRequestId": "act_01JBYX",
      "party": "SELLER",
      "intent": "AUTHORIZE_FINANCIAL_EXECUTION",
      "decision": "APPROVED",
      "paramsHash": "sha256_params_77b2c1...",
      "allRequiredConsentsMet": true,
      "approvedAt": "2026-11-05T14:22:00.000Z",
      "expiresAt": "2026-11-05T15:20:00.000Z"
    },
    "meta": { "traceId": "tr_con_01", "version": 6, "timestamp": "2026-11-05T14:22:00.000Z" }
  }
  ```
* **Error `403 Forbidden` (`STEP_UP_REQUIRED`):** Returned before recording the financial consent if `stepUpId` is missing, invalid, expired, belongs to another user, has a different purpose, or is not bound to this action request.
  ```json
  {
    "error": {
      "code": "STEP_UP_REQUIRED",
      "message": "Step-up verification is invalid, expired, or bound to a different target",
      "fieldErrors": {},
      "traceId": "tr_stepup_01",
      "retryable": false
    }
  }
  ```

---

## 5. Public API: Admin Supervision, Approval Queue, Audit & Executor (`/api/v1`)

### 5.1 `GET /api/v1/admin/disputes` (P0)
Returns the supervision queue metadata.
* **Query Params:** `?filter=NEEDS_REVIEW|APPROVAL_REQUESTS|MANUAL|CLOSED|ALL&assignedToMe=true`
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "items": [
        {
          "caseId": "case_vp_0421",
          "transactionId": "tx_vp_1028",
          "merchantId": "merch_vela_01",
          "initiatorParty": "CUSTOMER",
          "stage": "MEDIATING",
          "control": "WAITING_ADMIN",
          "controlVersion": 2,
          "caseVersion": 3,
          "gateReason": "MATERIAL_CONFLICT_INVOICE_VS_LABEL",
          "assignedReviewerId": "usr_admin_01",
          "pendingApprovalRequestId": "apv_01JBYH",
          "updatedAt": "2026-11-05T14:15:00.000Z"
        }
      ]
    },
    "meta": { "traceId": "tr_adm_01", "version": 1, "timestamp": "2026-11-05T14:15:05.000Z" }
  }
  ```

### 5.2 `GET /api/v1/admin/disputes/:id` (P0)
Admin investigation detail endpoint.
* **Access Rule:** If the admin only holds `disputes.read` (monitoring), returns case metadata, stage/control, and audit summary without evidence content. If the admin holds `disputes.investigate` **and** is the assigned reviewer on the case, also returns `CASE_SHARED` sources, shared statements, and AI assessment findings. **`PRIVATE` party drafts are never returned to Admin.**
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "case": {
        "caseId": "case_vp_0421",
        "transactionId": "tx_vp_1028",
        "merchantId": "merch_vela_01",
        "initiatorParty": "CUSTOMER",
        "stage": "MEDIATING",
        "control": "WAITING_ADMIN",
        "controlVersion": 2,
        "caseVersion": 3,
        "assignedReviewerId": "usr_admin_01",
        "investigationAccessGranted": true
      },
      "sharedPerspectives": {
        "customerStatement": "I ordered 256 GB. The received item is labelled 128 GB.",
        "sellerStatement": "Our invoice records SKU PD-256-M. Packing serial still needs checking."
      },
      "sharedSources": [
        { "sourceId": "src_label_01", "sourceVersion": 2, "ownerParty": "CUSTOMER", "originalName": "photo-label-128gb.jpg", "locator": "image:1" },
        { "sourceId": "src_invoice_01", "sourceVersion": 2, "ownerParty": "SELLER", "originalName": "invoice-pd-256.pdf", "locator": "page:1" }
      ],
      "latestAssessment": { ... },
      "pendingApprovalRequests": [
        {
          "approvalRequestId": "apv_01JBYH",
          "scope": "ALLOW_VOLUNTARY_MEDIATION",
          "caseVersion": 3,
          "status": "PENDING"
        }
      ]
    },
    "meta": { "traceId": "tr_adm_detail_01", "version": 3, "timestamp": "2026-11-05T14:16:10.000Z" }
  }
  ```

### 5.3 `POST /api/v1/admin/disputes/:id/assignments` (P0)
Assigns an authorized reviewer after verifying no conflict of interest exists.
* **Request Body:**
  ```json
  {
    "reviewerId": "usr_admin_01",
    "conflictDeclarationAccepted": true,
    "reason": "Assigned for material contradiction review on VP-0421"
  }
  ```
* **Response `200 OK`:** Returns `{ assignmentId, caseId, reviewerId, assignedAt }`.

### 5.4 `POST /api/v1/admin/disputes/:id/interventions` (P0)
Executes a workflow control intervention (`PAUSE`, `RESUME`, `REQUEST_INVESTIGATION`, `ALLOW_VOLUNTARY_MEDIATION`, `SET_MANUAL`, `OFFICIAL_HANDOFF`).
* **Versioning Rule:** Uses `If-Match: "<controlVersion>"` and increments `controlVersion` (from `2` to `3`). **Does NOT increment `caseVersion`** so shared evidence digests and party consents remain valid.
* **Headers:** `If-Match: "2"` *(matches `controlVersion: 2`)*
* **Request Body:**
  ```json
  {
    "action": "ALLOW_VOLUNTARY_MEDIATION",
    "reason": "Parties may proceed with voluntary mediation and serial number check.",
    "stepUpId": "stepup_01JBY8"
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "decisionId": "dec_01JBYJ",
      "caseId": "case_vp_0421",
      "control": "RUNNING",
      "controlVersion": 3,
      "stage": "MEDIATING",
      "caseVersion": 3,
      "resumeTriggered": true
    },
    "meta": { "traceId": "tr_adm_03", "version": 3, "timestamp": "2026-11-05T14:17:00.000Z" }
  }
  ```

### 5.5 `GET /api/v1/admin/approval-requests` & `POST /api/v1/admin/approval-requests/:id/decisions` (P0)
Lists pending administrative approval requests (discovering `approvalRequestId`) and records scoped step-up decisions.
* **`GET /api/v1/admin/approval-requests` Response `200 OK`:**
  ```json
  {
    "data": {
      "items": [
        {
          "approvalRequestId": "apv_01JBYH",
          "caseId": "case_vp_0421",
          "actionRequestId": "act_01JBYX",
          "scope": "ALLOW_VOLUNTARY_SETTLEMENT_PROPOSAL",
          "amountMinor": 2000,
          "currency": "USD",
          "paramsHash": "sha256_params_77b2c1...",
          "caseVersion": 6,
          "proposalVersion": 1,
          "status": "PENDING",
          "createdAt": "2026-11-05T14:20:00.000Z"
        }
      ]
    },
    "meta": { "traceId": "tr_apv_list_01", "version": 1, "timestamp": "2026-11-05T14:21:00.000Z" }
  }
  ```
* **`POST /api/v1/admin/approval-requests/:id/decisions` Headers:** `If-Match: "1"` *(matches `proposalVersion: 1`)*
* **Request Body:**
  ```json
  {
    "decision": "APPROVED",
    "scope": "ALLOW_VOLUNTARY_SETTLEMENT_PROPOSAL",
    "paramsHash": "sha256_params_77b2c1...",
    "caseVersion": 6,
    "stepUpId": "stepup_01JBY8",
    "reason": "Verified both parties reviewed shared sources and serial number photo."
  }
  ```
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "decisionId": "dec_01JBYK",
      "approvalRequestId": "apv_01JBYH",
      "decision": "APPROVED",
      "expiresAt": "2026-11-05T15:20:00.000Z"
    },
    "meta": { "traceId": "tr_adm_04", "version": 6, "timestamp": "2026-11-05T14:22:30.000Z" }
  }
  ```

### 5.6 `GET /api/v1/admin/audit-events` (P0)
Reads append-only, redacted audit logs (`audit.read` permission required). Never exposes raw passwords, session tokens, or private draft contents.
* **Query Params:** `?caseId=case_vp_0421&actorId=...&cursor=...`
* **Response `200 OK`:**
  ```json
  {
    "data": {
      "items": [
        {
          "auditId": "aud_01JBYM",
          "eventName": "ADMIN_INTERVENTION_RECORDED",
          "actorId": "usr_admin_01",
          "workspaceId": "ws_adm_01",
          "targetType": "DISPUTE_CASE",
          "targetId": "case_vp_0421",
          "reason": "Parties may proceed with voluntary mediation and serial number check.",
          "caseVersion": 3,
          "controlVersion": 3,
          "traceId": "tr_adm_03",
          "createdAt": "2026-11-05T14:17:00.000Z"
        }
      ],
      "nextCursor": null
    },
    "meta": { "traceId": "tr_aud_01", "version": 1, "timestamp": "2026-11-05T14:23:00.000Z" }
  }
  ```

### 5.7 `POST /api/v1/action-requests/:id/execute` (P0)
Atomically claims `ActionRequest` via CAS when `control === "RUNNING"` and `caseVersion` matches `If-Match`. Re-verifies all required `PartyConsent` records (`ACCEPT_PROPOSAL_TERMS` from both Customer and Seller + `AUTHORIZE_FINANCIAL_EXECUTION` from Seller), reserves `amountMinor` against the capture's remaining refundable balance, and dispatches one `ProviderOperation`.
* **Headers:** `Idempotency-Key: exec-act-01JBYX`, `If-Match: "6"` *(matches `caseVersion: 6`)*
* **Request Body:**
  ```json
  {
    "paramsHash": "sha256_params_77b2c1..."
  }
  ```
* **Response `202 Accepted`:**
  ```json
  {
    "data": {
      "operationId": "op_ref_01JBYZ",
      "type": "CAPTURE_REFUND",
      "actionRequestId": "act_01JBYX",
      "caseStage": "EXECUTION_PENDING",
      "operationStatus": "PENDING",
      "pollUrl": "/api/v1/operations/op_ref_01JBYZ"
    },
    "meta": { "traceId": "tr_exec_01", "version": 6, "timestamp": "2026-11-05T14:23:30.000Z" }
  }
  ```

### 5.8 `POST /api/v1/webhooks/paypal` (P0)
Exempt from CSRF/Origin. Verifies PayPal transmission signature, deduplicates in `webhook_inbox`, and reconciles matching `provider_operations` and `transactions`.

---

## 6. Internal Worker ↔ Python AI Service Contract (`/internal/v1`)

* **Worker ➔ Python Auth Header:** `X-Worker-Service-Token: <WORKER_TO_AI_SECRET>`
* **Python ➔ Express Auth Header:** `X-AI-Callback-Token: <AI_TO_EXPRESS_SECRET>`
* **Unified Field Naming:** Both public and internal DTOs use **`missingEvidence`** (replacing `gaps` everywhere).

### 6.1 `POST /internal/v1/case-runs` *(Express Outbox Worker ➔ Python FastAPI)*
Synchronous (`200 OK`), time-bounded call matching the frozen V6.1 request schema in PRD §15.
* **Request Body (Frozen PRD §15 Schema):**
  ```json
  {
    "runId": "run_demo_01",
    "purpose": "SHARED_ASSESSMENT",
    "expectedContextVersion": 3,
    "traceId": "trace_demo_01"
  }
  ```
* **Response `200 OK` — Example A: `NEEDS_INFO` (At `inputVersion: 3`):**
  ```json
  {
    "runId": "run_demo_01",
    "inputVersion": 3,
    "status": "NEEDS_INFO",
    "audience": "CASE_SHARED",
    "modelMode": "live",
    "businessDataMode": "paypal_sandbox",
    "category": "ITEM_NOT_AS_DESCRIBED",
    "verifiedFacts": [
      {
        "text": "Transaction tx_vp_1028 captured USD 59.00 for SKU PD-256-M.",
        "sourceRefs": [{ "sourceId": "snap_01JBYA", "version": 1, "locator": "record:1" }]
      }
    ],
    "claims": [
      {
        "party": "CUSTOMER",
        "text": "Customer states the delivered unit label reads 128 GB.",
        "sourceRefs": [{ "sourceId": "src_label_01", "version": 2, "locator": "image:1" }]
      },
      {
        "party": "SELLER",
        "text": "Seller explains the dispatch invoice lists SKU PD-256-M (256 GB).",
        "sourceRefs": [{ "sourceId": "src_invoice_01", "version": 2, "locator": "page:1" }]
      }
    ],
    "findings": [
      {
        "findingId": "fnd_01",
        "kind": "CONFLICT",
        "text": "Invoice 256 GB; label terlapor 128 GB.",
        "sourceRefs": [
          { "sourceId": "src_invoice_01", "version": 2, "locator": "page:1" },
          { "sourceId": "src_label_01", "version": 2, "locator": "image:1" }
        ]
      }
    ],
    "missingEvidence": ["Physical serial number or warehouse packing slip linking unit to order"],
    "uncertainty": "Photo of 128 GB label and 256 GB invoice conflict without serial number verification.",
    "policyReferences": ["POL-DISPUTE-EVIDENCE-01"],
    "nextStep": "REQUEST_PACKING_SERIAL",
    "requiresHumanApproval": true,
    "manifestHash": "sha256_manifest_v3_88a1...",
    "modelVersion": "gemini-2.5-flash",
    "promptVersion": "v6.1.0",
    "policyVersion": "v6.1",
    "counters": {
      "generativeCalls": 2,
      "embeddingQueries": 1,
      "retrievedChunks": 4,
      "elapsedMs": 6420
    }
  }
  ```
* **Response `200 OK` — Example B: `COMPLETED` (At `inputVersion: 5` after serial photo shared):**
  ```json
  {
    "runId": "run_shared_02",
    "inputVersion": 5,
    "status": "COMPLETED",
    "audience": "CASE_SHARED",
    "modelMode": "live",
    "businessDataMode": "paypal_sandbox",
    "category": "ITEM_NOT_AS_DESCRIBED",
    "verifiedFacts": [
      {
        "text": "Transaction tx_vp_1028 captured USD 59.00 for SKU PD-256-M.",
        "sourceRefs": [{ "sourceId": "snap_01JBYA", "version": 1, "locator": "record:1" }]
      }
    ],
    "claims": [
      {
        "party": "CUSTOMER",
        "text": "Customer states serial SN-PD128-9921 confirms a 128 GB unit was delivered.",
        "sourceRefs": [{ "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }]
      },
      {
        "party": "SELLER",
        "text": "Seller explains warehouse invoice lists SKU PD-256-M.",
        "sourceRefs": [{ "sourceId": "src_invoice_01", "version": 2, "locator": "page:1" }]
      }
    ],
    "findings": [
      {
        "findingId": "fnd_02",
        "kind": "OBSERVATION",
        "text": "Serial number SN-PD128-9921 on enclosure matches the 128 GB manufacturing batch.",
        "sourceRefs": [{ "sourceId": "src_serial_02", "version": 2, "locator": "image:1" }]
      }
    ],
    "missingEvidence": [],
    "uncertainty": "Serial number supports capacity mismatch; voluntary partial settlement is non-binding until both parties consent.",
    "policyReferences": ["POL-DISPUTE-EVIDENCE-01", "POL-VOLUNTARY-REFUND-02"],
    "nextStep": "PROPOSE_VOLUNTARY_SETTLEMENT",
    "requiresHumanApproval": false,
    "manifestHash": "sha256_manifest_v5_991a...",
    "modelVersion": "gemini-2.5-flash",
    "promptVersion": "v6.1.0",
    "policyVersion": "v6.1",
    "counters": {
      "generativeCalls": 2,
      "embeddingQueries": 1,
      "retrievedChunks": 6,
      "elapsedMs": 7110
    }
  }
  ```
* **Response `200 OK` — Example C: `FAILED` (Provider/Quota Error Without Silent Fixture Fallback):**
  ```json
  {
    "runId": "run_fail_03",
    "inputVersion": 5,
    "status": "FAILED",
    "audience": "CASE_SHARED",
    "modelMode": "live",
    "businessDataMode": "paypal_sandbox",
    "error": {
      "code": "MODEL_PROVIDER_ERROR",
      "message": "Gemini generateContent timed out after budget limit",
      "retryable": true
    },
    "nextStep": "NONE",
    "requiresHumanApproval": false,
    "counters": {
      "generativeCalls": 1,
      "embeddingQueries": 0,
      "retrievedChunks": 0,
      "elapsedMs": 30005
    }
  }
  ```

### 6.2 `POST /internal/v1/case-runs/:id/resume` *(Express Outbox Worker ➔ Python FastAPI)*
Resumes an interrupted LangGraph thread using a verified `decisionId`.
* **Request Body:**
  ```json
  {
    "runId": "run_demo_01",
    "decisionId": "dec_01JBYJ",
    "expectedContextVersion": 3,
    "traceId": "trace_resume_01"
  }
  ```
* **Response `200 OK`:** Returns the resumed run DTO (`NEEDS_INFO` or `COMPLETED`). If `expectedContextVersion` is stale, returns `409 STALE_CONTEXT`.

### 6.3 `GET /internal/v1/case-runs/:id/context` *(Python FastAPI ➔ Express)*
Fetches the authoritative context for `runId`.
* **Includes:**
  1. Cryptographically signed `manifest` (`manifestId`, `replayId`, `audience`, `expiresAt`, `manifestHash`, `hmacSignature`).
  2. Authorized party statements & messages (`allowedMessages`) so Python can extract party claims with valid citations.
  3. Time-limited, token-signed `readHandleUrl`s (`expiresAt` + `handleToken`) for `CLEAN` sources.
  4. For `purpose === "PERSONAL_ASSISTANT"`, returns `personalContext` (`catalogItems`, `spendingLimitMinor`, `recentTransactions`) instead of `caseId`.
* **Response `200 OK` (Case Run Context):**
  ```json
  {
    "runId": "run_demo_01",
    "tenantId": "merch_vela_01",
    "caseId": "case_vp_0421",
    "purpose": "SHARED_ASSESSMENT",
    "audience": "CASE_SHARED",
    "caseVersion": 3,
    "accessRevision": 3,
    "policyVersion": "v6.1",
    "signedManifest": {
      "manifestId": "mf_01JBYN",
      "replayId": "rpl_99281a",
      "audience": "CASE_SHARED",
      "caseVersion": 3,
      "accessRevision": 3,
      "manifestHash": "sha256_manifest_v3_88a1...",
      "expiresAt": "2026-11-05T14:25:00.000Z",
      "hmacSignature": "hmac_sha256_6f8a9b2c..."
    },
    "transactionFacts": {
      "transactionId": "tx_vp_1028",
      "orderId": "ord_vp_1028",
      "sku": "PD-256-M",
      "variantId": "256GB",
      "amountMinor": 5900,
      "refundableRemainingMinor": 5900,
      "currency": "USD",
      "paymentStatus": "PAID",
      "snapshotSourceRef": { "sourceId": "snap_01JBYA", "version": 1, "locator": "record:1" }
    },
    "allowedMessages": [
      {
        "messageId": "msg_init_cust",
        "party": "CUSTOMER",
        "audience": "CASE_SHARED",
        "version": 1,
        "locator": "statement:customer:1",
        "text": "I ordered 256 GB (SKU PD-256-M), but the delivered package label reads 128 GB."
      },
      {
        "messageId": "msg_init_sell",
        "party": "SELLER",
        "audience": "CASE_SHARED",
        "version": 1,
        "locator": "statement:seller:1",
        "text": "Our invoice records SKU PD-256-M. Packing serial still needs checking."
      }
    ],
    "allowedSources": [
      {
        "sourceId": "src_invoice_01",
        "version": 2,
        "ownerParty": "SELLER",
        "audience": "CASE_SHARED",
        "scanState": "CLEAN",
        "mime": "application/pdf",
        "sha256": "8f434346...",
        "readHandle": {
          "url": "http://localhost:4000/internal/v1/sources/src_invoice_01/bytes?v=2&runId=run_demo_01&token=hdl_77a1",
          "expiresAt": "2026-11-05T14:25:00.000Z"
        }
      },
      {
        "sourceId": "src_label_01",
        "version": 2,
        "ownerParty": "CUSTOMER",
        "audience": "CASE_SHARED",
        "scanState": "CLEAN",
        "mime": "image/jpeg",
        "sha256": "e3b0c442...",
        "readHandle": {
          "url": "http://localhost:4000/internal/v1/sources/src_label_01/bytes?v=2&runId=run_demo_01&token=hdl_77a2",
          "expiresAt": "2026-11-05T14:25:00.000Z"
        }
      }
    ]
  }
  ```

### 6.4 `POST /internal/v1/case-runs/:id/checkpoints` *(Python FastAPI ➔ Express)*
Atomically commits the validated assessment result in Express via CAS (`inputVersion === currentCaseVersion` and `accessRevision === currentAccessRevision`).
* **Request Body:**
  ```json
  {
    "inputVersion": 3,
    "accessRevision": 3,
    "manifestId": "mf_01JBYN",
    "replayId": "rpl_99281a",
    "manifestHash": "sha256_manifest_v3_88a1...",
    "hmacSignature": "hmac_sha256_6f8a9b2c...",
    "resultPayload": {
      "runId": "run_demo_01",
      "inputVersion": 3,
      "status": "NEEDS_INFO",
      "audience": "CASE_SHARED",
      "modelMode": "live",
      "businessDataMode": "paypal_sandbox",
      "category": "ITEM_NOT_AS_DESCRIBED",
      "verifiedFacts": [
        {
          "text": "Transaction tx_vp_1028 captured USD 59.00 for SKU PD-256-M.",
          "sourceRefs": [{ "sourceId": "snap_01JBYA", "version": 1, "locator": "record:1" }]
        }
      ],
      "claims": [
        {
          "party": "CUSTOMER",
          "text": "Customer states the delivered unit label reads 128 GB.",
          "sourceRefs": [{ "sourceId": "src_label_01", "version": 2, "locator": "image:1" }]
        }
      ],
      "findings": [
        {
          "findingId": "fnd_01",
          "kind": "CONFLICT",
          "text": "Invoice 256 GB; label terlapor 128 GB.",
          "sourceRefs": [
            { "sourceId": "src_invoice_01", "version": 2, "locator": "page:1" },
            { "sourceId": "src_label_01", "version": 2, "locator": "image:1" }
          ]
        }
      ],
      "missingEvidence": ["Physical serial number or warehouse packing slip linking unit to order"],
      "uncertainty": "Photo of 128 GB label and 256 GB invoice conflict without serial number verification.",
      "policyReferences": ["POL-DISPUTE-EVIDENCE-01"],
      "nextStep": "REQUEST_PACKING_SERIAL",
      "requiresHumanApproval": true,
      "modelVersion": "gemini-2.5-flash",
      "promptVersion": "v6.1.0",
      "policyVersion": "v6.1",
      "counters": {
        "generativeCalls": 2,
        "embeddingQueries": 1,
        "retrievedChunks": 4,
        "elapsedMs": 6420
      }
    }
  }
  ```
* **Response `200 OK` (When Version & ACL Match):**
  ```json
  {
    "data": {
      "committed": true,
      "checkpointId": "cp_dom_01",
      "caseVersion": 3,
      "accessRevision": 3
    },
    "meta": { "traceId": "trace_demo_01", "version": 3, "timestamp": "2026-11-05T14:10:00.000Z" }
  }
  ```
* **Response `409 Conflict` (When `inputVersion` or `accessRevision` is Stale):**
  ```json
  {
    "error": {
      "code": "STALE_CONTEXT",
      "message": "Case evidence or access revision changed while run was in flight. Result discarded without publishing.",
      "fieldErrors": {
        "expectedCaseVersion": 3,
        "currentCaseVersion": 4,
        "expectedAccessRevision": 3,
        "currentAccessRevision": 4
      },
      "traceId": "trace_demo_01",
      "retryable": false,
      "currentVersion": 4
    }
  }
  ```

### 6.5 `POST /internal/v1/evidence-index` & `POST /internal/v1/evidence-revoke` *(Express Outbox Worker ➔ Python FastAPI)*
Synchronous ingestion (`scanState === "CLEAN"` enforced) and durable Qdrant/memory purge on source revocation.
* **Request Body (`/internal/v1/evidence-index`):**
  ```json
  {
    "jobId": "job_idx_01",
    "tenantId": "merch_vela_01",
    "caseId": "case_vp_0421",
    "sourceId": "src_serial_02",
    "sourceVersion": 1,
    "accessRevision": 3,
    "audience": "PRIVATE",
    "mime": "image/jpeg",
    "sha256": "4b227777...",
    "embeddingSpace": "gemini-embedding-001-dim768",
    "retentionUntil": "2026-11-19T00:00:00.000Z",
    "readHandle": {
      "url": "http://localhost:4000/internal/v1/sources/src_serial_02/bytes?v=1&jobId=job_idx_01&token=hdl_88b1",
      "expiresAt": "2026-11-05T14:25:00.000Z"
    }
  }
  ```
* **Response `200 OK` (`/internal/v1/evidence-index`):**
  ```json
  {
    "sourceId": "src_serial_02",
    "sourceVersion": 1,
    "indexStatus": "INDEXED",
    "chunkCount": 2,
    "locators": ["image:1"]
  }
  ```
