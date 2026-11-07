# VelaPal FE ↔ BE Integration Handoff

**Contract:** Frozen 6.1.1 — 2026-11-05, Yunggi (BE).  
**FE owner:** Deff. **AI owner:** Ibnu.  
**Mode of this repository:** Local synthetic mock, not a finished backend.

## 1. Transport rule

- Browser → same-origin `/api/v1/*` → Express business API on port 4000 (or mock at 4010). Use `credentials: include`.
- Do **not** use `/internal/v1` in React. Express and Python communicate with directional service tokens server-side.
- Cookie: `velapal_session` local or `__Host-velapal` in production; browser cannot read `HttpOnly` cookie.
- Recover `csrfToken` via `GET /auth/session` on reload. `POST`/`PATCH`/`DELETE` use `X-CSRF-Token`. Browser sets `Origin` automatically. Do not attempt to set it manually in browser JS.
- Success `200/201/202`: `{ data, meta: { traceId, version, timestamp } }`. `204`: empty body. Error: `{ error: { code, message, fieldErrors, traceId, retryable, currentVersion? } }`.

## 2. Request examples

### Shared evidence message

`POST /api/v1/disputes/case_vp_0421/messages`  
Headers: `Content-Type: application/json`, `X-CSRF-Token: <session-token>`, `If-Match: "3"`  
Body:

```json
{ "text": "Package label reads 128 GB", "sourceRefs": [], "audience": "CASE_SHARED" }
```

For `PRIVATE` audience, `If-Match` must be the **privateContextVersion**, NOT `caseVersion`.

### Customer opens a dispute

`POST /api/v1/disputes` + `Idempotency-Key: dsp-open-001`, `X-CSRF-Token`. In `409 DUPLICATE_ACTIVE_CASE`, read `error.fieldErrors.existingCaseId` and navigate to the existing case.

### Admin intervention

1. `POST /auth/mfa/challenges` with `{ purpose: "ADMIN_INTERVENTION", targetId: "case_vp_0421" }`.
2. `POST /auth/mfa/verify`, obtain `stepUpId`.
3. `POST /admin/disputes/case_vp_0421/interventions` with `If-Match: "<controlVersion>"`, `action`, `reason`, and `stepUpId`.
4. Refresh case; `controlVersion` changes while `caseVersion` remains unchanged.

### Evidence upload

1. `POST .../sources/upload-intents` → `{ sourceId, sourceVersion, uploadId, uploadHandle }`.
2. PUT file bytes to `uploadHandle.url` (no VelaPal session cookie, CSRF, or auth bearer on external signed storage requests).
3. `POST .../sources/:sid/finalize` with `If-Match: "<sourceVersion>"` and `{uploadId}` → `202 SCANNING`.
4. Poll `GET .../sources/:sid` until `scanState: CLEAN`.
5. Request owner consent and `POST .../share` with intent `SHARE_SOURCE` and the current `sourceVersion`.
6. Refresh case and invalidate dependent AI assessment/proposal UI.

## 3. FE errors that require separate UX

- `401 SESSION_REQUIRED`: redirect to login, clear private query caches.
- `403 CSRF_INVALID`: restore session once; do not auto-replay sensitive transactions.
- `409 STALE_VERSION` or `STALE_CONSENT`: reload latest data, show changed terms/source versions; require explicit reconfirmation.
- `409 DUPLICATE_ACTIVE_CASE`: navigate to `existingCaseId`.
- `409 IDEMPOTENCY_CONFLICT`: report key reuse bug; do not auto-generate another key and retry blindly.
- `202 QUEUED/PENDING` and `UNKNOWN`: poll the same run/operation ID; never infer success from the POST result.
- `501 MOCK_FINANCIAL_EXECUTION_UNAVAILABLE`: development-only functionality; do not show a completed refund UI.

## 4. Requirements on Backend API integration

- Derive actorId/workspaceId from session, not JSON body.
- RBAC and source ACL are **server-authoritative**; FE route guards are only UX.
- Concurrency and idempotency are BE-owned, including requestHash and effect execution.
- PayPal webhook signatures are verified by BE; front-end never owns PayPal secrets.
- Strict four consent intents are independent.
- Return `modelMode` and `businessDataMode` in the supported AI fields to distinguish fixture and real runs.

## 5. Smoke-test checklist with Yunggi

- [ ] Login customer and restore after reload
- [ ] Seller membership and workspace switch
- [ ] Admin login MFA + scoped step-up
- [ ] Customer/Seller cannot read each other's PRIVATE evidence
- [ ] `sourceVersion` increments on share/revoke; case/access revisions update
- [ ] Private message does not increment caseVersion
- [ ] Admin PAUSE/RESUME does not increment caseVersion
- [ ] Duplicate dispute → existing case route
- [ ] Identical idempotency key+body yields same operation, changed body → 409
- [ ] Payment `UNKNOWN` never silently retried with a new intent
- [ ] AI fixture never silently substitutes for live Gemini during real integration
