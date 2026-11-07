# VelaPal V6.1.1 Frontend

Next.js App Router, strict TypeScript, Tailwind, SWR and Zod. The existing transaction UI is retained and adapted to the frozen public DTOs. Browser services use one cookie-authenticated `/api/v1` client; SWR caches are isolated by workspace and replaced on identity/workspace changes. No browser request contacts AI internal services.

## Run locally

Use Node.js 22+ and npm. On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

```powershell
npm.cmd ci
# For a new checkout without .env.local, copy the mock-mode template first:
# Copy-Item .env.example .env.local
npm.cmd run dev
```

Open **http://localhost:3000/**. The frontend and same-origin API prefix are served on port 3000. In mock mode, Next.js handles `/api/v1/*`, `/__mock_upload/*`, and `/health` using one in-memory mock handler. In API mode, Next.js rewrites `/api/v1/*` to the Express backend; the mock API is disabled. No separate mock server or second terminal is needed. `npm run mock` only prints these instructions and exits. Start the app with `npm run dev`.

If `npm run dev` reports `EADDRINUSE`, another process is already listening on port 3000. Stop the previous VelaPal dev/start terminal with Ctrl+C before starting it again. On Windows, `netstat -ano | findstr :3000` shows listener PIDs; inspect the owning process before stopping it. The app stays on port 3000 instead of silently switching ports.

This checkout's `.env.local` currently uses `NEXT_PUBLIC_API_MODE=api` and `API_UPSTREAM=http://localhost:4000`. A protected API request through the frontend returned Express's `401 UNAUTHENTICATED` response without a session cookie, confirming the rewrite; authenticated browser flows still need end-to-end verification. The `.env.example` defaults to mock mode with `API_UPSTREAM=http://localhost:3000`; in mock mode that upstream is intentionally unused. `MOCK_ALLOWED_ORIGINS` applies to the embedded mock. Cookie sessions, CSRF, scoped MFA, role isolation and upload tokens remain enforced.

For API mode, sign in at `/login` using the Express seed accounts and password listed in the [root README](../../README.md#2-configure-and-start-the-api). The credentials in the table below work only in mock mode and are different from the Express seed credentials.

For production preview, run `npm run build`, then `npm start`, and open the same URL. Mock records are synthetic and reset when the Next.js process restarts; browser-local P1 previews can be reset in Settings.

Development uses Next.js `instantInsights.validationLevel: "manual-warning"`: only routes explicitly opting into instant-navigation validation are checked. Protected workspace pages wait for client session recovery and can be omitted during automatic validation. Cache Components, partial prefetching and authentication remain enabled.

| Mock workspace accounts (mock mode only) | Email                 | Password  | MFA                                    |
| -------------- | --------------------- | --------- | -------------------------------------- |
| Customer       | customer@velapal.demo | demo12345 | None at login                          |
| Seller         | seller@velapal.demo   | demo12345 | Scoped financial authorization: 123456 |
| Admin          | admin@velapal.demo    | demo12345 | Login and scoped intervention: 123456  |

Accounts have one membership each. To compare parties, use separate browser profiles/contexts or sign out and sign in with the other account. The workspace selector lists only server-granted memberships and supports scoped MFA when switching to Admin. It does not impersonate another user.

## Implemented flows

- Session recovery, cookie credentials, CSRF, protected navigation, logout, role-aware navigation, scoped MFA, request cancellation and cache replacement.
- Customer and Seller dashboards derived from authorized transactions/cases; searchable transaction history, payment status and purchase snapshot.
- Catalog variants, quantities, integer-minor-unit spending limits and API quotes.
- Shared Customer/Seller case intake, duplicate-case links, private notes, cited shared responses, evidence upload/finalize/scan polling, explicit share consent, revocation and activity timeline.
- Private assistance and shared assessment submission/polling, all frozen AI statuses, citations, claims, missing evidence, uncertainty and stale context.
- Voluntary mediation decisions, proposal terms and expiry, bilateral acceptance/rejection, separate Seller financial authorization with MFA, capability-gated execution and existing-operation reconciliation.
- Admin queue filters, investigator assignment with conflict declaration, shared investigation, scoped intervention MFA, approval request UI and audit events. Private party sources and runs are excluded.

## Mock and Express configuration

The original ZIP, PDFs and frozen API documents remain unchanged in `docs/`. The runtime mock is in `mock-api/`; `createMockHandler()` is reused by Node HTTP contract tests and by Next.js Route Handlers through `embedded-handler.ts`. Embedding changes transport only, not the frozen request/response contracts. All browser API calls remain same-origin `/api/v1`.

The upload folder is encoded as `app/%5F%5Fmock_upload` because ordinary underscore-prefixed folders are private in Next.js. Its public URL remains `/__mock_upload`. A process-wide mock handler shares upload handles, sessions and case state across API/upload/health routes. API and cookie responses are never cached.

To switch modes, set `NEXT_PUBLIC_API_MODE=api` with `API_UPSTREAM=http://localhost:4000` for Express, or set `NEXT_PUBLIC_API_MODE=mock` for the embedded demo. API-mode rewrites run before embedded routes; the embedded mock is disabled. A live upstream pointing at the frontend's own port is rejected to prevent a proxy loop. Restart dev after environment changes; rebuild before production start. Provider secrets must remain server-side.

### Explicit integration limits

All mock data, MFA codes, scans and AI results are synthetic and reset on mock restart. No Gemini, PayPal, durable ledger, actual malware scanning or file preview is implemented. UNKNOWN reconciliation keeps the same operation ID and never claims provider verification. The dashboard reconciliation fixture is independent of case execution.

Checkout/capture and settlement execution deliberately do not report successful money movement. The frozen document lacks the checkout request/approval DTO, so checkout submission is unavailable in the UI. Its service endpoints remain ready for the confirmed backend handoff. Mock financial execution and approval-decision endpoints return explicit 501 errors. The approval queue is empty in the mock; returned live requests render exact-scope review and MFA controls.

The frozen document requires `paramsHash` for source-sharing/mediation and `sourceDigest` for proposals but does not specify how the frontend obtains them. The mock supplies optional, server-generated `mockShareParamsHash` and `mockConsentBindings` metadata to exercise these flows. These are **mock-only extensions**, not changes to the official contract. Live mode ignores them and displays unavailable states until the BE owner confirms the authoritative binding handoff; the frontend never invents production hashes. Proposal acceptance already uses the server-returned official proposal hash.

Public registration/password recovery, subscriptions, Digital Library, expanded merchant analytics and notification endpoints are not frozen P0 APIs. Their UI is preview/unavailable. There is no public Admin registration. List pagination/filter DTOs and full catalog product shape also need BE schema confirmation; transaction search/paging currently operate over the authorized list returned by the server, without assuming an undocumented request DTO.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

`npm test` runs the actual API client unit tests and HTTP mock integration tests using Node's built-in runner. Coverage includes cookie/CSRF headers, all requested HTTP error codes, cancellation, privacy, version axes, idempotency, duplicate cases, two-party consent, scoped Admin MFA and UNKNOWN reconciliation.

Playwright uses the same **http://localhost:3000** app with its embedded API. Run:

```powershell
npm.cmd run build
npm.cmd run test:e2e
```

No upstream override or second mock process is required. The runner starts/stops the app when needed. `PLAYWRIGHT_BASE_URL` can override the app URL; Windows defaults to Edge (`PLAYWRIGHT_CHANNEL=chrome` selects Chrome). Use a fresh app process for a clean full workflow run because mock API records persist in memory. Contract tests use ephemeral OS-assigned listeners for isolated HTTP assertions; these are not application services. Screenshots/traces are stored in ignored `test-results/` and `.visual-audit/`.

Verified in this checkout: TypeScript, ESLint (zero warnings), production build, 30 unit/HTTP integration tests and 17 Playwright workflow/visual tests passed. Browser checks covered all four requested widths and the three-role workflow. The last dependency install reported 8 moderate npm advisories; dependency-security triage remains outstanding, and no forced upgrades were applied.

## Visual reference alignment

The original hosted VelaPal Customer, Seller and Admin screens and the PDF design-system/wireframe sections were inspected. The shared shell uses the 224px sidebar, contextual topbar, slim demo disclosure, navy assistant/merchant banner, compact metrics, task panels and mobile bottom navigation. Brand tokens are navy `#0B326D`, action blue `#0871E8`, background `#F6F8FC` and border `#E6EBF2`. Geist is self-hosted from `public/fonts/geist-latin.woff2` with the SIL Open Font License alongside it, so builds need no font-network access.

Dispute intake uses the dedicated `/workspace/cases/new` page with explicit shared-statement consent; case filters, consent/MFA controls, provider states and API operations remain available. Dashboard amounts, payment states and case counts use authorized API records, so their content can differ from the reference prototype. New Admin account, merchant and reporting screens use explicitly fictional, browser-local preview records in mock mode; live endpoints are not assumed. Renewal analytics remain outside the implemented API scope. Visual checks cover login, dashboards, case views, drawer/bottom navigation and the dispute intake page at 360/390/768/1440px.

## Public frontend flow

`/` opens the original public landing page; it does not automatically send visitors to login. Create an account opens `/register` with Personal and Seller forms. Validation covers email, 15?128 character passwords, confirmation, seller business name and acceptance of the demo notices. `/verify-email` supports simulated verification, expiry and resend. This frontend preview never sends registration credentials or email; only fictional profile details are retained in tab session storage. Continue through Sign in using the seeded demo accounts to explore the existing mock workspace. `/forgot-password` previews the recovery request without changing a credential. There is no public Admin registration.

The Assistant includes the reference welcome, prompt cards, conversation history and bottom composer while continuing to use the existing private agent service. The case list includes local search and filters over authorized data. Intake retains existing API services, duplicate handling and idempotency; it requires a reviewed shared statement before submission. Mock mode runs without a production backend. Run `npm run dev` and open http://localhost:3000/.

## Admin frontend workspace

Admin navigation now follows all ten destinations from the original design: Overview, Users, Merchants, Transactions, Dispute Monitoring, AI monitoring, Analytics & reports, Audit logs, Roles & permissions, and Settings. Search/filter controls, merchant detail review, suspend/restore, bounded staff grants, illustrative AI traces, CSV downloads, invitation/session previews and local reset are interactive. Mutations require a reason, explicit review and demo verification (`123456`) and produce local audit entries. The Admin preview is scoped to the signed-in user/workspace and stored only in the browser tab. It does not revoke real sessions, deliver invitations, change real grants or pause API agent execution. API mode displays integration-unavailable notices for these new mock-only controls.

Existing dispute investigations retain API assignment, shared-source restrictions, canonical assessment, approval services and scoped MFA. Their UI now follows Overview, Evidence, Mediation and Activity tabs with supervisor controls alongside the case. The seeded case is already assigned to the demo supervisor; newly created cases require investigator assignment before shared evidence is returned. Local Admin preview changes and API audit events appear together in the audit screen. Full UI audit and handoff details are in [docs/admin-ui-audit.md](docs/admin-ui-audit.md).

## Feature coverage against the supplied documentation

Audit sources: PRD pp. 3–5, 18, 22–24; architecture/design specification pp. 5–19, 40–54; frozen V6.1.1 contract and ZIP endpoint matrix; original Customer, Seller and Admin screens and action dialogs inspected in the browser. The frozen contract wins for API interfaces. P1/P2 prototype controls are local previews, not new production endpoints.

| ID / feature                     | Priority in PRD                                        | Frontend coverage and route                                                                                                                                       | Integration boundary                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 Shopping assistant           | P0 thin                                                | Private Assistant, authorized catalogue search, user spending guardrail, quote review                                                                             | Existing Express agent/catalogue/quote services; AI response is a labelled fixture in mock mode                                                                               |
| F02 Checkout and snapshot        | P0                                                     | API quote, exact item/amount/version/expiry review, unchecked consent, approval/cancel/unavailable preview; authorized transaction snapshot viewer                | Checkout request/approval DTO is not frozen. Real create/capture and provider verification remain unavailable; no UI-generated PAID or authoritative snapshot/hash            |
| F03 Transaction history          | P0, advanced insights P1                               | Scoped list/detail, search, status, UTC dates, authorized immutable purchase agreement; Seller Payments and aggregate Insights                                    | Uses existing authorized transaction API data. No general PayPal wallet scan or invented product-type analytics                                                               |
| F04 Paid content/API             | P1                                                     | Digital Library, sample agreement, excerpt reader and download                                                                                                    | Fictional entitlement only. Signed access, revocation, provisioning and paid API access require the backend; no claim to access arbitrary paywalls                            |
| F05 Subscriptions                | P1                                                     | Personal plan review/cancel with explicit consequences and consent; Seller read-only plan view                                                                    | Local cancellation only; accessUntil/billing date preserved; no refund or provider cancellation claim                                                                         |
| F06 Reminders/recaps             | P1                                                     | Keep cycle, one 24-hour snooze, visible history/status, Notifications read state and preference                                                                   | Snooze never shifts billing; no scheduler, outbound email or WhatsApp integration                                                                                             |
| F07 Two-party cases              | P0                                                     | Both parties create/list/detail, incoming vs Seller reports, duplicate existing-case link, shared statements and timeline                                         | Existing dispute services and mock HTTP contracts; server derives parties and enforces ownership                                                                              |
| F08 Evidence/private preparation | P0                                                     | Private upload, scan polling, metadata/locator/version review, explicit share, revoke, private notes and party assistance                                         | Mock scans/storage are synthetic. Real scanning, OCR, signed access and durable ACL/index revocation require backend services                                                 |
| F09 AI analysis/mediation        | P0                                                     | All run statuses including NEEDS_INFO, source citations, facts/claims/gaps/conflicts/uncertainty, stale handling and review requests                              | Existing Express routes only; no browser internal/worker calls. No live Gemini or neutrality/quality evaluation claimed                                                       |
| F10 Authorized resolution        | P0                                                     | Exact proposals, four distinct consent intents, rejection, scoped Seller MFA, capability-gated execution, operation status, prepared official handoff checklist   | No provider side effects are simulated as financial success. Handoff includes shared metadata only and is explicitly not submitted                                            |
| F11 Identity/recovery            | P0 auth; public recovery P1                            | Landing/register/verify/login, Admin MFA, protected navigation, logout; forgot/reset preview with expiry and one use; branded 404/denied/expiry pages             | Existing cookie session API for auth. Passwords are never persisted by registration/reset preview; public recovery does not change actual credentials or revoke sessions      |
| F12 Membership/RBAC              | P0                                                     | Existing granted-workspace selector, cancellation/cache isolation, role guards for all new routes                                                                 | Local business approval never creates a grant; authoritative resource permissions remain server responsibilities                                                              |
| F13 Merchant application         | P1                                                     | Business form, Pending/Approved/Rejected preview, reason and resubmission; Admin merchant review                                                                  | Local preview only, separate from PayPal authorization and actual membership creation                                                                                         |
| F14 Seller operations            | P0 orders/disputes; broad operations P1                | Products add/edit/archive/publish, distinct Orders/Payments, plan view, aggregate Insights, scripted business draft, Notifications/Settings                       | Orders/payments use actual authorized API DTOs. Catalogue/profile/fulfilment previews stay separate. Unconfirmed/refunded orders cannot be marked shipped through the preview |
| F15 Admin operations             | P0 cases; broad operations P1                          | All ten original menus, assignment, investigator tabs, scoped interventions/approvals, combined API/local audit, CSV exports                                      | Existing case APIs preserved; additional administration controls remain mock-only and expose no private party prompts/sources                                                 |
| F16 Staff security               | P0 seeded grants/MFA; advanced invite/role/recovery P2 | Scoped API MFA, bounded read-only staff preview, no self-edit/public Admin signup, invitation and sample-session dialogs                                          | Frontend preview is not real revocation, role mutation or an invitation delivery service                                                                                      |
| F17 Operational resilience       | P0                                                     | Busy guards, stable idempotency per logical request, correct version axes, stale/error/denied/loading/empty/pending/unknown states, same-operation reconciliation | Durable outbox, worker leases, provider deduplication, replay recovery and production SLOs are BE/AI responsibilities, not proven by UI tests                                 |

Acceptance evidence is split deliberately. The HTTP contract suite and three-party browser workflow cover mock session/CSRF/ownership, private-vs-shared data, duplicate cases, version invalidation, separate consent, scoped Admin MFA and UNKNOWN reconciliation (PRD T02–T04/T06/T09/T12; design D01–D03/D06/D07/D10/D11, within mock scope). The new preview tests cover cancellation consent, unchanged billing/access, one snooze, role isolation, catalogue integrity, application resubmission without grants, guarded fulfilment, reset-token reuse, quote review, and all visible navigation destinations.

PRD T01 real capture, T05/T11 live AI quality/injection, T07/T08/T10 worker races/restart/webhooks, the production parts of SEC01–SEC09, and p95/SLO/evaluation targets remain external acceptance work. The frontend does not claim those passed. No frozen document, provider capability or backend handoff was silently rewritten to make these limits disappear.


Local routing is unified on port 3000. Embedded adapter tests cover cookie/session recovery, disallowed origins, CSRF, empty 204 logout, and upload-intent/byte/finalize state sharing without a second listener. The same browser workflows verify Customer, Seller and Admin on this single origin.
