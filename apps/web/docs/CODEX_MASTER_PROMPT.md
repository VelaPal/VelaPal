# VelaPal V6.1.1 — Full Frontend Execution Prompt for Codex (VS Code)

You are a Senior Frontend Engineer, Next.js/React Architect, TypeScript Engineer, and API Integration Engineer working **directly in my currently opened VelaPal repository** in VS Code.

## Primary objective

**Finish the existing VelaPal Frontend P0 implementation using real edits to the current source code.** Deliver a runnable, responsive, tested application whose browser-facing API behavior matches the frozen backend contract. **Do not restart from zero, produce only a roadmap, or substitute a demo for working integration.** Prioritize completing the actual application while preserving already working UI and code.

## Reference material: everything is in ONE `docs/` folder

Read and use these paths relative to the repository root:

- `docs/VelaPal_V6_1_PRD_dan_Pembagian_Tugas.pdf` — product requirements, P0/P1 scope, and acceptance criteria.
- `docs/VelaPal_V6_Dispute_Resolution_dan_Arsitektur.pdf` — Customer/Seller/Admin workflows, privacy boundaries, and UI specifications.
- `docs/velapal-v6.1-api-contract-v2.md` — **Yunggi's Master API Contract V6.1.1 Frozen**; source of truth for routes, DTOs, enums, headers, statuses, and concurrency rules.
- `docs/VelaPal_FE_API_Contract_V6.1.1.zip` — typed service implementations, contract fixtures, mock server, handoff documentation and tests. **It is a starter/reference archive, not the complete frontend application.**

Design reference: https://velapal-workspace.arkandaffa0105.chatgpt.site/

**Priority order:** Frozen API Contract for API interfaces > PRD for scope and priorities > existing frontend source for working implementation/design > prototype for visual reference. Highlight inconsistencies; do not silently edit the frozen contract.

Read only the sections relevant to the module being implemented to conserve context. Do not repeatedly dump full PDFs or the contract into conversation.

## First actions — start actual implementation

1. Inspect working directory, `git status`, package scripts, framework, routing, existing components, services, and tests. Do not discard unrelated user changes.
2. Identify what's already working and what is missing for P0. Give a **brief** execution summary, then proceed directly to code changes.
3. Inspect the ZIP in `docs/` and extract it to a temporary/safe location. Integrate its **relevant source files** into the existing repository structure instead of importing from the ZIP at runtime. Put the mock server in an appropriate runnable folder such as `apps/mock-api` or `mock-api` after considering existing structure. Adapt service imports and proxy/rewrite configuration to the repository; avoid duplicate modules. Keep all four reference files inside `docs/`.
4. Preserve the original design and existing functionality; avoid replacing an operational Vite/React app with Next.js without a proven need. If the repo is already Next.js, keep App Router patterns. Prefer TypeScript strict and existing Tailwind/UI dependencies.
5. Build P0 modules in cohesive, testable increments. Continue to the next meaningful unit after checks pass, without waiting for approvals for routine edits.

## UI modules to complete

**Public/Auth:** Landing, login Customer/Seller, Admin MFA challenge and verification, session reload recovery, logout, workspace selector, protected navigation. Register Customer/Seller may have an interactive **preview/mock-only** UI because public registration endpoints are not frozen; never add public Admin registration or claim backend support without contract.

**Customer:** Overview, catalog/quote, checkout state UI, transaction list/detail, personal assistant UI, create/list/detail dispute, evidence upload/scan/share/revoke, private drafting, shared assessment with citations, mediation, consent review, timeline, operation status.

**Seller:** Overview, authorized order/payment views, incoming disputes and Seller reports, shared case detail, counter-evidence and private Seller preparation, proposal creation and consent, authorized settlement status. Features lacking official endpoints must be clearly labeled preview/unavailable rather than fabricated.

**Admin:** Dispute queue and detail, reviewer assignment, shared-source investigation by permission, approval requests, MFA step-up, pause/resume/manual intervention and audit events. Do not show private Customer/Seller drafts to Admin.

**AI UI:** Frontend calls Express `/api/v1/agent/runs` and dispute assessment endpoints; it **never** invokes `/internal/v1` directly. Present `QUEUED`, `RUNNING`, `NEEDS_INFO`, `COMPLETED`, `ABSTAINED`, `STALE`, `FAILED`. Render verified server facts separately from party claims, missing evidence, uncertainty, source references, and next step. Label fixture output as simulated; do not portray it as a real Gemini run.

## Frozen API integration requirements

- Browser-facing path is `/api/v1` only. Use same-origin Next.js rewrite/proxy for mock/live backend switching. Do not expose PayPal, Gemini, worker, or AI callback secrets in client code.
- Central typed HTTP client and domain-specific services. Prefer existing `packages/contracts` definitions and the supplied starter types when they match the Frozen Contract. UI components must not directly call `fetch` with ad hoc endpoints.
- Use `credentials: 'include'`; session is cookie-based. `GET /api/v1/auth/session` restores profile, active workspace, and CSRF token. Keep CSRF token in application memory and send `X-CSRF-Token` for browser mutations per contract. Do not attempt to set a forbidden `Origin` header manually; use same-origin browser requests and let the browser send Origin.
- Use `Idempotency-Key` on the explicitly required endpoints; reuse keys only for a retry of the same logical request with the same body.
- Apply `If-Match` from the **correct counter** (`caseVersion`, `privateContextVersion`, `sourceVersion`, `controlVersion`, `proposalVersion`). Do not add duplicate expected version body fields when the contract defines header-only versioning.
- Honor success `{ data, meta }`, error `{ error: { code, message, fieldErrors, traceId, retryable, currentVersion } }`, plus 204 No Content. Show actionable error states for 401/403/409/422/429/503.
- Monetary values use integer minor units plus currency, never floating-point dollars for transport.
- Keep `stage`, `control`, `operationStatus` as separate axes. Preserve `PRIVATE`, `CASE_SHARED`, `PROVIDER_SHARED`, `REVOKED` audience semantics; do not leak party-private data through query cache or UI.
- Respect four separate consent intents: `SHARE_SOURCE`, `CONTINUE_MEDIATION`, `ACCEPT_PROPOSAL_TERMS`, `AUTHORIZE_FINANCIAL_EXECUTION`. Never collapse them into a generic approval checkbox.
- Handle duplicate active cases by using the existing case ID from the documented 409 error; never blindly create another.
- On workspace switch, cancel in-flight requests and clear or scope cached data to the new workspace.
- `UNKNOWN` provider operation must lead to reconciliation of the **same operationId**, not another financial request. Never fake payment/refund success.
- Mock API responses, role-specific fixtures, failures, scan states, and operation transitions must match the contract where implemented. If the starter omits endpoints, implement safe mock-only behavior where reasonable and explicitly label unsupported flows; do not make up production API contracts.

## UI quality

Preserve VelaPal's Geist, navy/blue design, spacing and existing reusable components. Responsive behavior must work at 360, 390, 768 and 1440px. Provide accessible forms/dialogs, keyboard focus, loading, empty, error, pending, stale, success, and unknown states. Sensitive actions require explicit review and confirmation. No decorative fake functionality.

## Execution and verification

Work directly on the current repo; implement and verify in practical increments, prioritizing the complete P0 demo journey:

1. Login/session/workspace using mock API.
2. Customer transaction -> dispute creation -> evidence private/upload/share -> AI assessment UI.
3. Seller opens the **same case** -> counter-evidence -> proposal -> distinct party consents.
4. Admin reviews conflicts -> MFA/authorized intervention -> audit UI.
5. Operation pending/unknown -> reconciliation UI.

After changes, run the existing package manager scripts for type-check, lint, unit/integration tests, and production build. Add focused tests for changed behavior when necessary. Use Playwright smoke tests if configured/available. Fix observed regressions. Report unavailable endpoints or unavailable external services as blockers; never claim tests passed unless executed.

## Token and repository hygiene

- Minimize verbose discussion and repeated file dumps. Reuse existing components and service code.
- Do not create `IMPLEMENTATION_PROGRESS.md`, duplicative planning documents, or unnecessary new dependencies.
- A concise final status is sufficient: files changed, P0 flows verified, commands and test results, mock-only/blocked features, and exact startup instructions.
- Keep all four original reference documents inside `docs/`. Extracted executable mock server and imported service modules must live in code/runtime locations as appropriate; do not execute application source from the archive in `docs/`.
- Do not push commits, deploy, remove unrelated code, or modify remote repositories unless explicitly requested.

**Begin by inspecting this repository and the `docs/` references, then immediately edit and test the existing Frontend. Do as much verified implementation work as possible during this session rather than stopping at a plan.**
