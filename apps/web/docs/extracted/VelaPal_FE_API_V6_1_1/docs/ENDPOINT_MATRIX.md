# Frozen Contract 6.1.1 → FE Adapter / Mock Matrix

Source of truth: `packages/contracts/velapal-v6.1.1-frozen.md` (owner Yunggi, 2026-11-05). Paths omit `/api/v1`. **Mock means synthetic HTTP behavior only**, not actual integration.

| Contract endpoint | FE service | Local mock | Notes |
|---|---|---|---|
| POST /auth/login | authService.login | ✅ | Admin receives `MFA_REQUIRED` |
| GET /auth/session | authService.restoreSession | ✅ | Recovers `csrfToken` after reload |
| POST /auth/mfa/challenges | authService.createMfaChallenge | ✅ | Purpose/target scoped |
| POST /auth/mfa/verify | authService.verifyMfa | ✅ | Demo code `123456`; never for production |
| POST /auth/logout | authService.logout | ✅ | 204 empty |
| GET /me/workspaces | authService.listWorkspaces | ✅ (minimal fixture) | List response shape needs machine-readable schema |
| POST /session/workspace | authService.switchWorkspace | ✅ (single grant) | Rotate CSRF, abort old requests, reset cache |
| GET /catalog | transactionsService.catalog | ✅ | Mock variants |
| POST /quotes | transactionsService.quote | ✅ | Minor units, no PayPal |
| POST /checkout/orders | transactionsService.createCheckoutOrder | ⛔ intentional 501 | Requires key; no fake checkout |
| POST /checkout/orders/:id/capture | transactionsService.captureCheckoutOrder | ⛔ intentional 501 | No fake capture |
| GET /transactions, /transactions/:id | transactionsService.list/get | ✅ | One paid fixture and one unconfirmed fixture, both synthetic |
| GET /operations/:id | operationsService.get | ✅ | Fixture UNKNOWN |
| POST /operations/:id/reconcile | operationsService.reconcile | ✅ fixture | Does NOT claim PayPal verified |
| POST /agent/runs | agentService.start | ✅ fixture | No Gemini call |
| GET /agent/runs/:id | agentService.get | ✅ fixture | `modelMode: fixture` |
| POST /disputes | disputesService.create | ✅ | Duplicate issueKey + scoped idempotency |
| GET /disputes, /disputes/:id | disputesService.list/get | ✅ | Role-filtered evidence |
| POST /disputes/:id/sources/upload-intents | disputesService.uploadIntent | ✅ | Local mock signed PUT URL |
| PUT to returned upload handle | disputesService.uploadBytes | ✅ | Separate from `/api/v1` |
| POST /disputes/:id/sources/:sid/finalize | disputesService.finalize | ✅ | 202 SCANNING; poll to CLEAN |
| GET /disputes/:id/sources/:sid | disputesService.getSource | ✅ | Private owner-only metadata |
| POST /disputes/:id/sources/:sid/share | disputesService.shareSource | ✅ | `sourceVersion`, caseVersion, accessRevision increment |
| POST /disputes/:id/sources/:sid/revoke | disputesService.revokeSource | ✅ | Invalidate proposals; no real Qdrant purge |
| POST /disputes/:id/messages | disputesService.message | ✅ | PRIVATE uses privateContextVersion, CASE_SHARED uses caseVersion |
| POST /disputes/:id/assessments | disputesService.assess | ✅ fixture | AI status simulated; no Gemini |
| POST /disputes/:id/mediation-consents | disputesService.mediationConsent | ✅ | Distinct `CONTINUE_MEDIATION` |
| POST /disputes/:id/proposals | disputesService.propose | ✅ | Consent entries generated, no money movement |
| POST /disputes/:id/reviews | disputesService.requestReview | ✅ | Only controlVersion increments |
| POST /action-requests/:id/consents | disputesService.grantConsent | ✅ simplified | Proposal If-Match; no durable ledger |
| POST /action-requests/:id/execute | disputesService.execute | ⛔ intentional 501 | Not safe to pretend a refund occurred |
| GET /admin/disputes | adminService.disputes | ✅ | Admin metadata queue |
| GET /admin/disputes/:id | adminService.detail | ✅ | Assigned reviewer only shared evidence |
| POST /admin/disputes/:id/assignments | adminService.assign | ✅ simplified | Not a real COI verification service |
| POST /admin/disputes/:id/interventions | adminService.intervene | ✅ | Step-up + If-Match controlVersion |
| GET /admin/approval-requests | adminService.approvalRequests | ✅ empty | Approval review not built |
| POST /admin/approval-requests/:id/decisions | adminService.decideApproval | ⛔ intentional 501 | Not built |
| GET /admin/audit-events | adminService.auditEvents | ✅ | In-memory demo audit, not durable |
| POST /webhooks/paypal | N/A | ⛔ | Provider webhook is BE-only, not FE/mock UI |
| `/internal/v1/*` | N/A | ⛔ blocked | Express/worker ↔ Python only, never browser |

## Missing from frozen P0 contract (do not invent)

- Public Customer/Seller registration, verification, forgotten/reset password routes (P1 in PRD).
- Public endpoints for subscription management, notifications, Digital Library, and full merchant operations (P1).
- Exact paging/filter DTOs for some `GET` list endpoints. Existing minimal fixtures are **assumptions**, not BE commitments.
- Generated machine-readable OpenAPI and tests from BE; markdown is authoritative until replaced explicitly by Yunggi.

## Questions for BE owner (Yunggi)

1. Confirm the final `GET /me/workspaces`, `GET /transactions`, and `GET /disputes` list envelope shapes and pagination.
2. Publish OpenAPI / JSON Schema for DTO generation rather than maintaining hand-written types forever.
3. Approve browser-origin deployment design: same-origin reverse proxy and cookie/CSRF behavior.
4. Confirm exact register flow/URLs separately if they need to appear in demo rather than Preview-only.
5. Confirm how proposal `sourceDigest`, `paramsHash`, and idempotency key are produced or supplied to FE. The FE **must not invent** authoritative hashes; BE should return/bind the required values.
