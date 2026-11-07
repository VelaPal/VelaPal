import { createServer } from 'node:http';
import { randomUUID, createHash } from 'node:crypto';

/** Local simulation ONLY; never contacts Gemini, PayPal, object storage or a real DB. */
const allowedOrigins = new Set((process.env.MOCK_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000').split(','));
const now = () => new Date().toISOString();
const uuid = (prefix) => `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
const hash = (input) => createHash('sha256').update(JSON.stringify(input)).digest('hex');
const plus = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
const people = [
  { id: 'usr_cust_01', email: 'customer@velapal.demo', name: 'Demo Customer', type: 'CUSTOMER', workspaceId: 'ws_cust_01', merchantId: null, role: 'CUSTOMER' },
  { id: 'usr_sell_01', email: 'seller@velapal.demo', name: 'Demo Seller', type: 'SELLER', workspaceId: 'ws_sell_01', merchantId: 'merch_vela_01', role: 'SELLER_OWNER' },
  { id: 'usr_admin_01', email: 'admin@velapal.demo', name: 'Demo Supervisor', type: 'ADMIN', workspaceId: 'ws_adm_01', merchantId: null, role: 'SUPERVISOR' },
];
const makeWorkspace = (p) => ({ workspaceId: p.workspaceId, type: p.type, name: p.type === 'CUSTOMER' ? 'Personal Workspace' : p.type === 'SELLER' ? 'Vela Market' : 'VelaPal Operations', merchantId: p.merchantId, role: p.role });
const fixtureTransaction = { id: 'tx_vp_1028', orderId: 'ord_vp_1028', customerId: 'usr_cust_01', merchantId: 'merch_vela_01', merchantName: 'Vela Market', paypalOrderId: '5O190127TN364715T', paypalCaptureId: '2GG903537H408804M', amountMinor: 5900, refundableRemainingMinor: 5900, currency: 'USD', paymentStatus: 'PAID', verifiedAt: '2026-11-05T14:02:10.000Z' };
const unconfirmedTransaction = { id: 'tx_demo_unconfirmed_0422', orderId: 'ord_demo_unconfirmed_0422', customerId: 'usr_cust_01', merchantId: 'merch_vela_01', merchantName: 'Vela Market', paypalOrderId: null, paypalCaptureId: null, amountMinor: 4900, refundableRemainingMinor: 0, currency: 'USD', paymentStatus: 'UNCONFIRMED', verifiedAt: null };
const fixtureSnapshot = { snapshotId: 'snap_01JBYA', sku: 'PD-256-M', variantId: '256GB', quantity: 1, amountMinor: 5900, currency: 'USD', snapshotHash: 'synthetic_only_not_provider_verified' };
const initialCase = () => ({
  caseId: 'case_vp_0421', transactionId: 'tx_vp_1028', orderId: 'ord_vp_1028', merchantId: 'merch_vela_01', initiatorParty: 'CUSTOMER', category: 'ITEM_NOT_AS_DESCRIBED',
  stage: 'MEDIATING', control: 'WAITING_ADMIN', caseVersion: 3, controlVersion: 2, privateContextVersion: 1, accessRevision: 3, nextAction: 'WAIT_FOR_REVIEW', officialPaypalDisputeId: null,
  capabilities: { canShareEvidence: true, canPostMessage: true, canProposeTerms: true, canGrantConsent: true, canExecuteSettlement: false, canRequestReview: true, supportedSettlementRoutes: ['PAYPAL_CAPTURE_REFUND', 'OFFICIAL_HANDOFF'] },
});
const initialSources = () => [
  { sourceId: 'src_label_01', sourceVersion: 2, ownerParty: 'CUSTOMER', originalName: 'photo-label-128gb.jpg', mime: 'image/jpeg', scanState: 'CLEAN', audience: 'CASE_SHARED', sha256: hash('label-synthetic'), locator: 'image:1' },
  { sourceId: 'src_invoice_01', sourceVersion: 2, ownerParty: 'SELLER', originalName: 'invoice-pd-256.pdf', mime: 'application/pdf', scanState: 'CLEAN', audience: 'CASE_SHARED', sha256: hash('invoice-synthetic'), locator: 'page:1' },
];
function initialState() {
  const c = initialCase();
  return { sessions: new Map(), challenges: new Map(), stepUps: new Map(), idempotency: new Map(), uploads: new Map(), runs: new Map(), cases: new Map([[c.caseId, {
    case: c, sources: initialSources(), messages: [], latestAssessment: null, activeProposal: null, pendingConsents: [], reviewerId: 'usr_admin_01',
    perspectives: { customerStatement: 'I ordered 256 GB. The received item is labelled 128 GB.', sellerStatement: 'Our invoice records SKU PD-256-M. Packing serial still needs checking.' },
    activityTimeline: [{ eventId: 'ev_01', type: 'CASE_OPENED', actorParty: 'CUSTOMER', summary: 'Synthetic case opened', caseVersion: 1, at: now() }],
  }]]), operations: new Map([['op_ref_01JBYZ', { operationId: 'op_ref_01JBYZ', type: 'CAPTURE_REFUND', actionRequestId: 'act_01JBYX', caseId: 'case_vp_0421', route: 'PAYPAL_CAPTURE_REFUND', status: 'UNKNOWN', amountMinor: 2000, currency: 'USD', providerRef: null, lastCheckedAt: null, verifiedAt: null, nextStep: 'MOCK ONLY: No PayPal request was made. Verify the real operation in Express/PayPal.' }]]), audits: [] };
}
class Fault extends Error { constructor(status, code, message, currentVersion, fieldErrors = {}) { super(message); Object.assign(this, { status, code, currentVersion, fieldErrors }); } }
const bad = (status, code, message, version, errors) => { throw new Fault(status, code, message, version, errors); };
async function readJson(req) {
  let value = '';
  for await (const chunk of req) {
    value += chunk;
    if (value.length > 1024 * 1024) bad(413, 'PAYLOAD_TOO_LARGE', 'Demo JSON body exceeded 1 MiB.');
  }
  try { return value ? JSON.parse(value) : {}; }
  catch { bad(400, 'INVALID_JSON', 'Invalid JSON body.'); }
}
function write(res, status, data, version = 1, traceId = uuid('tr')) {
  if (status === 204) { res.writeHead(204, { 'X-Trace-Id': traceId }); res.end(); return; }
  const payload = { data, meta: { traceId, version, timestamp: now() } };
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Mock-Mode': 'synthetic_fixture', 'X-Trace-Id': traceId });
  res.end(JSON.stringify(payload));
}
function error(res, fault, traceId) {
  const payload = { error: { code: fault.code || 'INTERNAL_ERROR', message: fault.message || 'Unexpected mock server error', fieldErrors: fault.fieldErrors || {}, traceId, retryable: false, ...(fault.currentVersion === undefined ? {} : { currentVersion: fault.currentVersion }) } };
  res.writeHead(fault.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'X-Mock-Mode': 'synthetic_fixture' });
  res.end(JSON.stringify(payload));
}
function sameVersion(req, current) {
  const header = req.headers['if-match'];
  if (!header || !/^"?\d+"?$/.test(header)) bad(409, 'VERSION_REQUIRED', 'If-Match with the relevant version counter is required.', current);
  if (Number(header.replaceAll('"', '')) !== current) bad(409, 'STALE_VERSION', 'The resource has changed; reload before retrying.', current);
}
function requireOrigin(req) {
  const origin = req.headers.origin;
  if (!origin || !allowedOrigins.has(origin)) bad(403, 'INVALID_ORIGIN', 'Origin does not match configured web origin.');
}
function ownSide(person) { if (person.type === 'ADMIN') bad(403, 'FORBIDDEN', 'Admin is not a dispute party.'); return person.type; }
function assertAccess(person, entry) { if (!entry) bad(404, 'NOT_FOUND', 'Case not found.'); if (person.type === 'CUSTOMER' && entry.case.transactionId !== 'tx_vp_1028' && entry.customerId !== person.id) bad(403, 'FORBIDDEN', 'Case is not owned by this customer.'); if (person.type === 'SELLER' && entry.case.merchantId !== person.merchantId) bad(403, 'FORBIDDEN', 'Case is outside your merchant workspace.'); }
function visible(entry, person) {
  const party = person.type;
  const sources = entry.sources.filter(s => s.audience === 'CASE_SHARED' || (party !== 'ADMIN' && s.ownerParty === party && s.audience === 'PRIVATE'));
  const messages = entry.messages.filter(m => m.audience === 'CASE_SHARED' || (party !== 'ADMIN' && m.authorParty === party && m.audience === 'PRIVATE'));
  return { case: entry.case, providerOperation: { operationId: null, type: null, route: 'PAYPAL_CAPTURE_REFUND', status: 'IDLE', providerRef: null, verifiedAt: null }, snapshot: fixtureSnapshot, perspectives: entry.perspectives, sources, messages, latestAssessment: entry.latestAssessment, activeProposal: entry.activeProposal, pendingConsents: entry.pendingConsents, activityTimeline: entry.activityTimeline };
}
function assessment(entry, runId) {
  const serial = entry.sources.some(s => s.sourceId.startsWith('src_') && s.originalName.toLowerCase().includes('serial') && s.audience === 'CASE_SHARED');
  return {
    runId, inputVersion: entry.case.caseVersion, status: serial ? 'COMPLETED' : 'NEEDS_INFO', audience: 'CASE_SHARED', modelMode: 'fixture', businessDataMode: 'synthetic_fixture', category: entry.case.category,
    verifiedFacts: [], claims: [{ party: 'CUSTOMER', text: 'Customer claims package label is 128 GB.', sourceRefs: [{ sourceId: 'src_label_01', version: 2, locator: 'image:1' }] }, { party: 'SELLER', text: 'Seller claims invoice lists 256 GB.', sourceRefs: [{ sourceId: 'src_invoice_01', version: 2, locator: 'page:1' }] }],
    findings: [{ findingId: 'fnd_01', kind: 'CONFLICT', text: 'Fixture: Label states 128 GB, invoice states 256 GB.', sourceRefs: [{ sourceId: 'src_label_01', version: 2, locator: 'image:1' }, { sourceId: 'src_invoice_01', version: 2, locator: 'page:1' }] }],
    missingEvidence: serial ? [] : ['Physical serial number or warehouse packing slip'], uncertainty: 'SIMULATED: This is not a Gemini inference or verified provider fact.', policyReferences: ['POL-DISPUTE-EVIDENCE-01'], nextStep: serial ? 'PROPOSE_VOLUNTARY_SETTLEMENT' : 'REQUEST_PACKING_SERIAL', requiresHumanApproval: !serial,
  };
}
function record(entry, type, person, summary) { entry.activityTimeline.push({ eventId: uuid('ev'), type, actorParty: person.type, summary, caseVersion: entry.case.caseVersion, at: now() }); }
function idempotent(state, req, person, path, body, run) {
  const key = req.headers['idempotency-key'];
  if (!key || typeof key !== 'string') bad(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header is required.');
  const scoped = `${person.id}|${person.workspaceId}|${path}|${key}`;
  const digest = hash(body);
  const existing = state.idempotency.get(scoped);
  if (existing) { if (existing.digest !== digest) bad(409, 'IDEMPOTENCY_CONFLICT', 'Idempotency key reused with a different request body.'); return existing.outcome; }
  const outcome = run();
  state.idempotency.set(scoped, { digest, outcome });
  return outcome;
}
function sessionView(person, session) { return { status: 'AUTHENTICATED', csrfToken: session.csrfToken, user: { id: person.id, email: person.email, name: person.name }, activeWorkspace: makeWorkspace(person) }; }
export function createMockServer() {
  const state = initialState();
  return createServer(async (req, res) => {
    const traceId = uuid('tr');
    const url = new URL(req.url || '/', 'http://localhost');
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const method = req.method;
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Credentials', 'true'); res.setHeader('Vary', 'Origin'); }
    if (method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,X-CSRF-Token,If-Match,Idempotency-Key' }); res.end(); return; }
    try {
      if (url.pathname === '/health' && method === 'GET') return write(res, 200, { mode: 'MOCK_ONLY', modelMode: 'fixture', businessDataMode: 'synthetic_fixture', backendConnected: false, paypalConnected: false, aiConnected: false });
      if (url.pathname.startsWith('/internal/v1/')) bad(404, 'NOT_FOUND', 'Internal service APIs cannot be called by FE.');
      if (url.pathname.startsWith('/__mock_upload/') && method === 'PUT') {
        const uploadId = url.pathname.split('/').at(-1); const pending = state.uploads.get(uploadId);
        if (!pending || pending.token !== url.searchParams.get('token')) bad(403, 'INVALID_UPLOAD_HANDLE', 'Invalid mock upload handle.');
        let size = 0; for await (const chunk of req) { size += chunk.length; if (size > 10 * 1024 * 1024) bad(413, 'UPLOAD_TOO_LARGE', 'Mock upload max 10 MiB.'); }
        pending.uploaded = true; pending.bytes = size; res.writeHead(204); res.end(); return;
      }
      if (!url.pathname.startsWith('/api/v1/')) bad(404, 'NOT_FOUND', 'Route does not exist.');
      const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await readJson(req) : {};
      if (method === 'POST' && path === '/auth/login') {
        requireOrigin(req);
        const person = people.find(p => p.email === String(body.email).toLowerCase());
        if (!person || !['demo12345', 'correct-horse-battery-staple'].includes(body.password)) bad(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
        if (person.type === 'ADMIN') {
          const challengeId = uuid('mfa_ch_login'); state.challenges.set(challengeId, { person, purpose: 'SESSION_LOGIN', targetId: null });
          return write(res, 200, { status: 'MFA_REQUIRED', challengeId, purpose: 'SESSION_LOGIN', targetId: null, expiresAt: plus(5) });
        }
        const sid = uuid('session'); const session = { personId: person.id, csrfToken: uuid('csrf') }; state.sessions.set(sid, session);
        res.setHeader('Set-Cookie', `velapal_session=${sid}; HttpOnly; SameSite=Lax; Path=/`);
        return write(res, 200, sessionView(person, session));
      }
      const cookie = /(?:^|;\s*)velapal_session=([^;]+)/.exec(req.headers.cookie || '')?.[1];
      const session = cookie ? state.sessions.get(cookie) : null;
      const person = session ? people.find(p => p.id === session.personId) : null;
      if (method === 'POST' && path === '/auth/mfa/verify' && !person) {
        requireOrigin(req);
        const challenge = state.challenges.get(body.challengeId);
        if (!challenge || challenge.purpose !== 'SESSION_LOGIN' || body.code !== '123456') bad(401, 'MFA_FAILED', 'Invalid or expired mock MFA challenge.');
        state.challenges.delete(body.challengeId);
        const sid = uuid('session'); const next = { personId: challenge.person.id, csrfToken: uuid('csrf') }; state.sessions.set(sid, next);
        res.setHeader('Set-Cookie', `velapal_session=${sid}; HttpOnly; SameSite=Lax; Path=/`);
        return write(res, 200, { ...sessionView(challenge.person, next), purpose: 'SESSION_LOGIN' });
      }
      if (!session || !person) bad(401, 'SESSION_REQUIRED', 'Login required.');
      if (method !== 'GET') {
        requireOrigin(req);
        if (req.headers['x-csrf-token'] !== session.csrfToken) bad(403, 'CSRF_INVALID', 'CSRF token missing or invalid.');
      }
      if (method === 'GET' && path === '/auth/session') return write(res, 200, sessionView(person, session));
      if (method === 'POST' && path === '/auth/logout') { state.sessions.delete(cookie); res.setHeader('Set-Cookie', 'velapal_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax'); return write(res, 204); }
      if (method === 'GET' && path === '/me/workspaces') return write(res, 200, { items: [makeWorkspace(person)] });
      if (method === 'POST' && path === '/session/workspace') {
        if (person.workspaceId !== body.workspaceId) bad(403, 'WORKSPACE_NOT_GRANTED', 'Workspace membership not granted.');
        session.csrfToken = uuid('csrf'); return write(res, 200, { activeWorkspace: makeWorkspace(person), csrfToken: session.csrfToken }, 2);
      }
      if (method === 'POST' && path === '/auth/mfa/challenges') {
        const challengeId = uuid('mfa_ch_step'); state.challenges.set(challengeId, { person, purpose: body.purpose, targetId: body.targetId });
        return write(res, 201, { challengeId, purpose: body.purpose, targetId: body.targetId, expiresAt: plus(5) });
      }
      if (method === 'POST' && path === '/auth/mfa/verify') {
        const challenge = state.challenges.get(body.challengeId);
        if (!challenge || challenge.person.id !== person.id || body.code !== '123456') bad(401, 'MFA_FAILED', 'Invalid or expired mock MFA challenge.');
        state.challenges.delete(body.challengeId); const stepUpId = uuid('stepup'); state.stepUps.set(stepUpId, { personId: person.id, purpose: challenge.purpose, targetId: challenge.targetId });
        return write(res, 200, { status: 'STEP_UP_VERIFIED', stepUpId, purpose: challenge.purpose, targetId: challenge.targetId, expiresAt: plus(10) });
      }
      if (method === 'GET' && path === '/catalog') return write(res, 200, { items: [{ id: 'prod_pocket_drive', name: 'Pocket Drive', merchantId: 'merch_vela_01', variants: [{ id: '128GB', amountMinor: 3900 }, { id: '256GB', amountMinor: 5900 }], currency: 'USD' }] });
      if (method === 'POST' && path === '/quotes') {
        if (body.productId !== 'prod_pocket_drive' || !['128GB', '256GB'].includes(body.variantId) || !Number.isInteger(body.quantity) || body.quantity < 1) bad(422, 'INVALID_QUOTE', 'Invalid product or quantity.');
        const amountMinor = (body.variantId === '256GB' ? 5900 : 3900) * body.quantity;
        return write(res, 201, { quoteId: uuid('qt'), merchantId: 'merch_vela_01', productId: body.productId, sku: body.variantId === '256GB' ? 'PD-256-M' : 'PD-128-M', variantId: body.variantId, quantity: body.quantity, amountMinor, currency: 'USD', spendingLimitMinor: body.spendingLimitMinor, ruleResult: amountMinor <= body.spendingLimitMinor ? 'READY' : 'OVER_LIMIT', quoteVersion: 1, expiresAt: plus(30) });
      }
      if (method === 'GET' && path === '/transactions') return write(res, 200, { items: person.type === 'ADMIN' ? [] : [fixtureTransaction, unconfirmedTransaction], nextCursor: null });
      if (method === 'GET' && path === `/transactions/${fixtureTransaction.id}` && person.type !== 'ADMIN') return write(res, 200, { transaction: fixtureTransaction, snapshot: fixtureSnapshot, activeCaseId: 'case_vp_0421' });
      if (method === 'GET' && path === `/transactions/${unconfirmedTransaction.id}` && person.type !== 'ADMIN') return write(res, 200, { transaction: unconfirmedTransaction, snapshot: { ...fixtureSnapshot, amountMinor: 4900 }, activeCaseId: null });
      if (method === 'GET' && path === '/disputes') return write(res, 200, { items: [...state.cases.values()].filter(e => { try { assertAccess(person,e); return person.type !== 'ADMIN'; } catch { return false; } }).map(e => e.case), nextCursor: null });
      if (method === 'POST' && path === '/disputes') {
        const outcome = idempotent(state, req, person, path, body, () => {
          ownSide(person);
          const existing = [...state.cases.values()].find(e => e.case.category === body.category && (e.case.transactionId || e.case.orderId) === (body.transactionId || body.orderId));
          if (existing) bad(409, 'DUPLICATE_ACTIVE_CASE', 'An active case already exists for this transaction/category.', undefined, { existingCaseId: existing.case.caseId });
          if (!body.category || (!body.transactionId && !body.orderId)) bad(422, 'INVALID_DISPUTE', 'Missing category and transaction/order reference.');
          const newId = uuid('case'); const c = { ...initialCase(), caseId: newId, transactionId: body.transactionId, orderId: body.orderId, initiatorParty: person.type, category: body.category, stage: 'AWAITING_EVIDENCE', control: 'RUNNING', caseVersion: 1, controlVersion: 1, privateContextVersion: 1, accessRevision: 1, nextAction: 'UPLOAD_OR_SHARE_EVIDENCE' };
          state.cases.set(newId, { case: c, sources: [], messages: [], perspectives: { customerStatement: person.type === 'CUSTOMER' ? body.statement : null, sellerStatement: person.type === 'SELLER' ? body.statement : null }, latestAssessment: null, activeProposal: null, pendingConsents: [], activityTimeline: [], reviewerId: null, customerId: person.id });
          return { status: 201, data: { caseId: c.caseId, transactionId: c.transactionId, orderId: c.orderId, initiatorParty: c.initiatorParty, category: c.category, stage: c.stage, control: c.control, caseVersion: 1, controlVersion: 1, privateContextVersion: 1, accessRevision: 1, nextAction: c.nextAction }, version: 1 };
        }); return write(res, outcome.status, outcome.data, outcome.version);
      }
      const caseMatch = /^\/disputes\/([^/]+)(?:\/(.*))?$/.exec(path);
      if (caseMatch) {
        const entry = state.cases.get(caseMatch[1]); assertAccess(person, entry); const tail = caseMatch[2] || '';
        if (!tail && method === 'GET') return write(res, 200, visible(entry, person), entry.case.caseVersion);
        if (tail === 'messages' && method === 'POST') {
          const party = ownSide(person), shared = body.audience === 'CASE_SHARED';
          if (!shared && body.audience !== 'PRIVATE') bad(422, 'INVALID_AUDIENCE', 'Use PRIVATE or CASE_SHARED.');
          sameVersion(req, shared ? entry.case.caseVersion : entry.case.privateContextVersion);
          const messageId = uuid('msg'); const msg = { messageId, authorParty: party, audience: body.audience, text: body.text || '', sourceRefs: body.sourceRefs || [], createdAt: now() };
          entry.messages.push(msg); if (shared) entry.case.caseVersion++; else entry.case.privateContextVersion++;
          record(entry, 'MESSAGE_POSTED', person, shared ? 'Shared message posted' : 'Private message posted (not public)');
          return write(res, 201, { messageId, party, audience: body.audience, caseVersion: entry.case.caseVersion, privateContextVersion: entry.case.privateContextVersion }, entry.case.caseVersion);
        }
        if (tail === 'assessments' && method === 'POST') {
          sameVersion(req, entry.case.caseVersion); const runId = uuid('run_shared'); const result = assessment(entry, runId);
          entry.latestAssessment = result; state.runs.set(runId, { runId, caseId: entry.case.caseId, inputVersion: entry.case.caseVersion, status: result.status, purpose: 'SHARED_ASSESSMENT', audience: 'CASE_SHARED', modelMode: 'fixture', businessDataMode: 'synthetic_fixture', result });
          return write(res, 202, { runId, caseId: entry.case.caseId, inputVersion: entry.case.caseVersion, status: 'QUEUED' }, entry.case.caseVersion);
        }
        if (tail === 'reviews' && method === 'POST') {
          ownSide(person); entry.case.control = 'WAITING_ADMIN'; entry.case.controlVersion++; record(entry, 'REVIEW_REQUESTED', person, body.reason || 'Human review requested');
          return write(res, 201, { reviewRequestId: uuid('rev'), caseId: entry.case.caseId, control: entry.case.control, controlVersion: entry.case.controlVersion, caseVersion: entry.case.caseVersion }, entry.case.caseVersion);
        }
        if (tail === 'mediation-consents' && method === 'POST') {
          ownSide(person); sameVersion(req, entry.case.caseVersion);
          if (body.consentIntent !== 'CONTINUE_MEDIATION') bad(422, 'INVALID_CONSENT', 'Mediation requires CONTINUE_MEDIATION.');
          return write(res, 200, { consentId: uuid('con_med'), caseId: entry.case.caseId, party: person.type, intent: 'CONTINUE_MEDIATION', decision: body.decision, caseVersion: entry.case.caseVersion, approvedAt: now() }, entry.case.caseVersion);
        }
        if (tail === 'proposals' && method === 'POST') {
          ownSide(person); sameVersion(req, entry.case.caseVersion);
          if (!body.terms || !Number.isInteger(body.money?.amountMinor) || body.money.amountMinor < 0 || body.money.currency !== 'USD') bad(422, 'INVALID_PROPOSAL', 'Invalid exact terms or integer money minor units.');
          if (entry.case.control !== 'RUNNING') bad(409, 'CASE_CONTROL_BLOCKED', 'Cannot propose while waiting for admin or paused.', entry.case.controlVersion);
          entry.case.caseVersion++; entry.case.stage = 'AWAITING_CONSENT'; const proposalId = uuid('prop'); const actionRequestId = uuid('act'); const paramsHash = hash(body);
          entry.activeProposal = { proposalId, proposalVersion: 1, proposerParty: person.type, caseVersion: entry.case.caseVersion, actionRequestId, terms: body.terms, money: body.money, route: body.route, sourceDigest: body.sourceDigest, paramsHash, status: 'AWAITING_CONSENT', expiresAt: plus(body.expiresInMinutes || 60) };
          entry.pendingConsents = [{ party: 'CUSTOMER', intent: 'ACCEPT_PROPOSAL_TERMS', status: 'PENDING', approvedAt: null }, { party: 'SELLER', intent: 'ACCEPT_PROPOSAL_TERMS', status: 'PENDING', approvedAt: null }, { party: 'SELLER', intent: 'AUTHORIZE_FINANCIAL_EXECUTION', status: 'PENDING', approvedAt: null }];
          record(entry, 'PROPOSAL_CREATED', person, 'Synthetic settlement terms drafted (no funds moved)');
          return write(res, 201, { proposalId, proposalVersion: 1, proposerParty: person.type, caseVersion: entry.case.caseVersion, stage: 'AWAITING_CONSENT', actionRequestId, paramsHash, requiredConsents: entry.pendingConsents, expiresAt: entry.activeProposal.expiresAt }, entry.case.caseVersion);
        }
        if (tail === 'sources/upload-intents' && method === 'POST') {
          const side = ownSide(person); if (!body.originalName || !body.mime || !Number.isInteger(body.byteCount) || body.byteCount > 10 * 1024 * 1024) bad(422, 'INVALID_UPLOAD', 'Invalid file metadata.');
          const sourceId = uuid('src'), uploadId = uuid('upl'), token = uuid('sig'); const source = { sourceId, sourceVersion: 1, ownerParty: side, originalName: body.originalName, mime: body.mime, scanState: 'QUARANTINED', audience: 'PRIVATE', sha256: null, locator: null };
          entry.sources.push(source); state.uploads.set(uploadId, { token, sourceId, caseId: entry.case.caseId, uploaded: false });
          return write(res, 201, { sourceId, uploadId, sourceVersion: 1, audience: 'PRIVATE', scanState: 'QUARANTINED', uploadHandle: { method: 'PUT', url: `http://${req.headers.host}/__mock_upload/${uploadId}?token=${token}`, expiresInSeconds: 600 } });
        }
        const sourceMatch = /^sources\/([^/]+)(?:\/(finalize|share|revoke))?$/.exec(tail);
        if (sourceMatch) {
          const source = entry.sources.find(s => s.sourceId === sourceMatch[1]); if (!source) bad(404, 'SOURCE_NOT_FOUND', 'Evidence source not found.');
          if (source.audience === 'PRIVATE' && source.ownerParty !== person.type) bad(403, 'PRIVATE_SOURCE', 'Private source belongs to another party.');
          if (!sourceMatch[2] && method === 'GET') {
            // emulate async scanning: first poll reports SCANNING; next poll reports CLEAN.
            if (source.scanState === 'SCANNING') { source.scanState = 'CLEAN'; source.sha256 = hash(source.originalName); source.locator = source.mime.includes('pdf') ? 'page:1' : 'image:1'; return write(res, 200, { ...source, scanState: 'SCANNING', readyForAnalysis: false }); }
            return write(res, 200, { ...source, readyForAnalysis: source.scanState === 'CLEAN', previewUrl: null });
          }
          if (method === 'POST' && sourceMatch[2] === 'finalize') {
            if (source.ownerParty !== person.type) bad(403, 'PRIVATE_SOURCE', 'Only source owner may finalize.'); sameVersion(req, source.sourceVersion);
            const upload = state.uploads.get(body.uploadId); if (!upload?.uploaded || upload.sourceId !== source.sourceId) bad(409, 'UPLOAD_NOT_COMPLETE', 'Upload bytes before finalizing.');
            source.scanState = 'SCANNING'; return write(res, 202, { sourceId: source.sourceId, sourceVersion: source.sourceVersion, audience: 'PRIVATE', scanState: 'SCANNING', readyForAnalysis: false, indexJobStatus: 'QUEUED' });
          }
          if (method === 'POST' && sourceMatch[2] === 'share') {
            if (source.ownerParty !== person.type) bad(403, 'PRIVATE_SOURCE', 'Only source owner may share.'); sameVersion(req, source.sourceVersion);
            if (source.scanState !== 'CLEAN') bad(409, 'SOURCE_NOT_READY', 'Wait for CLEAN scan before sharing.');
            if (body.consentIntent !== 'SHARE_SOURCE' || !['CASE_SHARED', 'PROVIDER_SHARED'].includes(body.audience) || !body.paramsHash) bad(422, 'INVALID_SHARE_CONSENT', 'Explicit source sharing consent required.');
            source.audience = body.audience; source.sourceVersion++; entry.case.caseVersion++; entry.case.accessRevision++;
            entry.latestAssessment = null; entry.activeProposal = null; entry.pendingConsents = []; record(entry, 'SOURCE_SHARED', person, `Shared ${source.originalName} (fixture)`);
            return write(res, 200, { sourceId: source.sourceId, sourceVersion: source.sourceVersion, audience: source.audience, consentId: uuid('con_share'), caseVersion: entry.case.caseVersion, accessRevision: entry.case.accessRevision, invalidatedProposalIds: [] }, entry.case.caseVersion);
          }
          if (method === 'POST' && sourceMatch[2] === 'revoke') {
            if (source.ownerParty !== person.type) bad(403, 'PRIVATE_SOURCE', 'Only source owner may revoke.'); sameVersion(req, source.sourceVersion);
            const invalidatedProposalIds = entry.activeProposal ? [entry.activeProposal.proposalId] : [];
            source.audience = 'REVOKED'; source.sourceVersion++; entry.case.caseVersion++; entry.case.accessRevision++; entry.activeProposal = null; entry.pendingConsents = []; entry.latestAssessment = null;
            record(entry, 'SOURCE_REVOKED', person, 'Source access revoked (mock)');
            return write(res, 200, { sourceId: source.sourceId, sourceVersion: source.sourceVersion, audience: 'REVOKED', caseVersion: entry.case.caseVersion, accessRevision: entry.case.accessRevision, invalidatedProposalIds, purgeScheduled: true }, entry.case.caseVersion);
          }
        }
      }
      if (method === 'POST' && path === '/agent/runs') {
        ownSide(person); if (!['PERSONAL_ASSISTANT', 'CUSTOMER_PREPARATION', 'SELLER_PREPARATION'].includes(body.purpose)) bad(422, 'INVALID_PURPOSE', 'Use disputes/:id/assessments for SHARED_ASSESSMENT.');
        const runId = uuid('run_priv'); const run = { runId, purpose: body.purpose, audience: 'PRIVATE', status: 'QUEUED', pollUrl: `/api/v1/agent/runs/${runId}`, modelMode: 'fixture', businessDataMode: 'synthetic_fixture' }; state.runs.set(runId, run); return write(res, 202, run);
      }
      const runMatch = /^\/agent\/runs\/([^/]+)$/.exec(path);
      if (method === 'GET' && runMatch) {
        const run = state.runs.get(runMatch[1]); if (!run) bad(404, 'RUN_NOT_FOUND', 'AI run not found.');
        return write(res, 200, { ...run, status: run.status === 'QUEUED' ? 'COMPLETED' : run.status, result: run.result ?? { message: 'SIMULATED: No Gemini call was performed.' } });
      }
      const actionConsent = /^\/action-requests\/([^/]+)\/consents$/.exec(path);
      if (method === 'POST' && actionConsent) {
        ownSide(person); const entry = [...state.cases.values()].find(e => e.activeProposal?.actionRequestId === actionConsent[1]); assertAccess(person, entry);
        sameVersion(req, entry.activeProposal.proposalVersion);
        if (body.paramsHash !== entry.activeProposal.paramsHash || body.caseVersion !== entry.case.caseVersion) bad(409, 'STALE_CONSENT', 'Terms, version, or parameter hash no longer match.', entry.case.caseVersion);
        const consent = entry.pendingConsents.find(c => c.party === person.type && c.intent === body.intent);
        if (!consent) bad(403, 'CONSENT_NOT_GRANTED', 'This party cannot approve that intent.');
        if (body.intent === 'AUTHORIZE_FINANCIAL_EXECUTION' && !body.stepUpId) bad(403, 'STEP_UP_REQUIRED', 'Merchant financial authorization requires step-up MFA.');
        consent.status = body.decision; consent.approvedAt = body.decision === 'APPROVED' ? now() : null;
        return write(res, 200, { consentId: uuid('con'), actionRequestId: actionConsent[1], party: person.type, intent: body.intent, decision: body.decision, paramsHash: body.paramsHash, allRequiredConsentsMet: entry.pendingConsents.every(c => c.status === 'APPROVED'), approvedAt: consent.approvedAt, expiresAt: entry.activeProposal.expiresAt }, entry.case.caseVersion);
      }
      if (method === 'GET' && path === '/admin/disputes') {
        if (person.type !== 'ADMIN') bad(403, 'FORBIDDEN', 'Only admin can monitor.');
        const items = [...state.cases.values()].map(e => ({ caseId: e.case.caseId, transactionId: e.case.transactionId, merchantId: e.case.merchantId, initiatorParty: e.case.initiatorParty, stage: e.case.stage, control: e.case.control, controlVersion: e.case.controlVersion, caseVersion: e.case.caseVersion, gateReason: e.case.control === 'WAITING_ADMIN' ? 'MATERIAL_CONFLICT_INVOICE_VS_LABEL' : null, assignedReviewerId: e.reviewerId, pendingApprovalRequestId: e.case.control === 'WAITING_ADMIN' ? 'apv_01JBYH' : null, updatedAt: now() }));
        return write(res, 200, { items: url.searchParams.get('filter') === 'NEEDS_REVIEW' ? items.filter(i => i.control === 'WAITING_ADMIN') : items });
      }
      const adminCaseMatch = /^\/admin\/disputes\/([^/]+)(?:\/(assignments|interventions))?$/.exec(path);
      if (adminCaseMatch) {
        if (person.type !== 'ADMIN') bad(403, 'FORBIDDEN', 'Only admin can access.');
        const entry = state.cases.get(adminCaseMatch[1]); if (!entry) bad(404, 'NOT_FOUND', 'Case not found.');
        if (method === 'GET' && !adminCaseMatch[2]) {
          // Default admin monitoring is metadata-only. Only assigned reviewer gets CASE_SHARED sources.
          const investigationAccessGranted = entry.reviewerId === person.id;
          return write(res, 200, { case: { ...entry.case, assignedReviewerId: entry.reviewerId, investigationAccessGranted }, ...(investigationAccessGranted ? { sharedPerspectives: entry.perspectives, sharedSources: entry.sources.filter(s => s.audience === 'CASE_SHARED'), latestAssessment: entry.latestAssessment } : {}), pendingApprovalRequests: [] }, entry.case.caseVersion);
        }
        if (method === 'POST' && adminCaseMatch[2] === 'assignments') {
          if (!body.conflictDeclarationAccepted || !body.reason) bad(422, 'ASSIGNMENT_DECLARATION_REQUIRED', 'Conflict declaration and reason are required.');
          entry.reviewerId = body.reviewerId; return write(res, 200, { assignmentId: uuid('asg'), caseId: entry.case.caseId, reviewerId: body.reviewerId, assignedAt: now() });
        }
        if (method === 'POST' && adminCaseMatch[2] === 'interventions') {
          sameVersion(req, entry.case.controlVersion);
          const step = state.stepUps.get(body.stepUpId);
          if (!step || step.personId !== person.id || step.purpose !== 'ADMIN_INTERVENTION' || step.targetId !== entry.case.caseId) bad(403, 'STEP_UP_REQUIRED', 'A scoped admin intervention MFA step-up is required.');
          if (entry.reviewerId !== person.id) bad(403, 'REVIEWER_NOT_ASSIGNED', 'Assigned reviewer required.');
          if (!body.reason) bad(422, 'REASON_REQUIRED', 'Audit reason required.');
          entry.case.control = body.action === 'PAUSE' ? 'PAUSED' : body.action === 'SET_MANUAL' ? 'MANUAL' : body.action === 'REQUEST_INVESTIGATION' ? 'WAITING_ADMIN' : 'RUNNING';
          entry.case.controlVersion++; state.stepUps.delete(body.stepUpId); record(entry, 'ADMIN_INTERVENTION', person, body.reason);
          state.audits.push({ auditId: uuid('aud'), eventName: 'ADMIN_INTERVENTION_RECORDED', actorId: person.id, workspaceId: person.workspaceId, targetType: 'DISPUTE_CASE', targetId: entry.case.caseId, reason: body.reason, caseVersion: entry.case.caseVersion, controlVersion: entry.case.controlVersion, traceId, createdAt: now() });
          return write(res, 200, { decisionId: uuid('dec'), caseId: entry.case.caseId, control: entry.case.control, controlVersion: entry.case.controlVersion, stage: entry.case.stage, caseVersion: entry.case.caseVersion, resumeTriggered: body.action === 'RESUME' || body.action === 'ALLOW_VOLUNTARY_MEDIATION' }, entry.case.controlVersion);
        }
      }
      if (method === 'GET' && path === '/admin/approval-requests') { if (person.type !== 'ADMIN') bad(403, 'FORBIDDEN', 'Admin required.'); return write(res, 200, { items: [] }); }
      if (method === 'GET' && path === '/admin/audit-events') { if (person.type !== 'ADMIN') bad(403, 'FORBIDDEN', 'Admin required.'); return write(res, 200, { items: state.audits.filter(a => !url.searchParams.has('caseId') || a.targetId === url.searchParams.get('caseId')), nextCursor: null }); }
      const op = /^\/operations\/([^/]+)(?:\/(reconcile))?$/.exec(path);
      if (op) {
        const record = state.operations.get(op[1]); if (!record) bad(404, 'OPERATION_NOT_FOUND', 'Operation not found.');
        if (method === 'GET' && !op[2]) return write(res, 200, record);
        if (method === 'POST' && op[2]) {
          const outcome = idempotent(state, req, person, path, body, () => ({ status: 200, data: { ...record, lastCheckedAt: now(), nextStep: 'SIMULATED ONLY: No PayPal verification attempted. Preserve UNKNOWN.' } }));
          return write(res, outcome.status, outcome.data);
        }
      }
      if ((method === 'POST' && (/^\/checkout\/orders(?:\/.*)?$/.test(path) || /^\/action-requests\/[^/]+\/execute$/.test(path)))) {
        // Check header required by frozen contract even when we deliberately refuse to simulate money movement.
        idempotent(state, req, person, path, body, () => ({ status: 501, data: null }));
        bad(501, 'MOCK_FINANCIAL_EXECUTION_UNAVAILABLE', 'Not connected to PayPal. Never pretend payment or refund succeeded.');
      }
      if (method === 'POST' && /^\/admin\/approval-requests\/[^/]+\/decisions$/.test(path)) bad(501, 'MOCK_NOT_IMPLEMENTED', 'Admin financial approval simulation not implemented.');
      if (method === 'POST' && /^\/auth\/(register|forgot-password|reset-password)/.test(path)) bad(501, 'NOT_IN_FROZEN_P0_CONTRACT', 'Endpoint is not specified in the V6.1.1 frozen P0 contract.');
      bad(404, 'NOT_FOUND', 'No route in this mock server.');
    } catch (e) { error(res, e instanceof Fault ? e : new Fault(500, 'MOCK_INTERNAL_ERROR', e?.message || String(e)), traceId); }
  });
}
if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  const port = Number(process.env.PORT || 4010);
  createMockServer().listen(port, '0.0.0.0', () => console.log(`VelaPal synthetic mock API: http://localhost:${port} (no PayPal/Gemini)`));
}
