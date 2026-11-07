import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createMockServer } from '../apps/mock-api/server.mjs';

const origin = 'http://localhost:3000';
async function withApi(run) {
  const server = createMockServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}
async function api(base, method, path, { body, cookie, csrf, version, key, originValue = origin } = {}) {
  const headers = { Origin: originValue };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  if (csrf) headers['X-CSRF-Token'] = csrf;
  if (version !== undefined) headers['If-Match'] = `"${version}"`;
  if (key) headers['Idempotency-Key'] = key;
  const res = await fetch(`${base}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: res.status, data: res.status === 204 ? null : await res.json(), cookie: res.headers.get('set-cookie')?.split(';')[0] };
}
async function login(base, side = 'customer') {
  const r = await api(base, 'POST', '/auth/login', { body: { email: `${side}@velapal.demo`, password: 'demo12345' } });
  assert.equal(r.status, 200);
  if (side === 'admin') {
    assert.equal(r.data.data.status, 'MFA_REQUIRED');
    const verify = await api(base, 'POST', '/auth/mfa/verify', { body: { challengeId: r.data.data.challengeId, code: '123456' } });
    assert.equal(verify.status, 200);
    return { cookie: verify.cookie, csrf: verify.data.data.csrfToken };
  }
  return { cookie: r.cookie, csrf: r.data.data.csrfToken };
}
test('health never claims live AI or PayPal', async () => withApi(async base => {
  const r = await fetch(`${base}/health`); const x = await r.json();
  assert.equal(x.data.businessDataMode, 'synthetic_fixture'); assert.equal(x.data.paypalConnected, false);
}));
test('session reload restores csrfToken; logout returns 204 and revokes session', async () => withApi(async base => {
  const s = await login(base);
  const restored = await api(base, 'GET', '/auth/session', { cookie: s.cookie });
  assert.equal(restored.data.data.csrfToken, s.csrf);
  assert.equal(restored.data.meta.traceId.startsWith('tr_'), true);
  const logout = await api(base, 'POST', '/auth/logout', s);
  assert.equal(logout.status, 204);
  assert.equal((await api(base, 'GET', '/auth/session', { cookie: s.cookie })).status, 401);
}));
test('mutations require origin+csrf and use quoted If-Match with right version axis', async () => withApi(async base => {
  const s = await login(base);
  const path = '/disputes/case_vp_0421/messages';
  const body = { audience: 'CASE_SHARED', text: 'Additional shared evidence', sourceRefs: [] };
  assert.equal((await api(base, 'POST', path, { body, cookie: s.cookie, version: 3 })).data.error.code, 'CSRF_INVALID');
  assert.equal((await api(base, 'POST', path, { body, ...s, version: 3, originValue: 'https://attacker.example' })).data.error.code, 'INVALID_ORIGIN');
  const shared = await api(base, 'POST', path, { body, ...s, version: 3 });
  assert.equal(shared.status, 201); assert.equal(shared.data.data.caseVersion, 4);
  assert.equal((await api(base, 'POST', path, { body, ...s, version: 3 })).data.error.currentVersion, 4);
  const priv = await api(base, 'POST', path, { body: { audience: 'PRIVATE', text: 'Do not share', sourceRefs: [] }, ...s, version: 1 });
  assert.equal(priv.status, 201); assert.equal(priv.data.data.caseVersion, 4); assert.equal(priv.data.data.privateContextVersion, 2);
  const seller = await login(base, 'seller');
  const caseRead = await api(base, 'GET', '/disputes/case_vp_0421', { cookie: seller.cookie });
  assert.equal(caseRead.data.data.messages.some(m => m.text === 'Do not share'), false);
}));
test('admin MFA step-up changes controlVersion not caseVersion', async () => withApi(async base => {
  const a = await login(base, 'admin');
  const c = await api(base, 'GET', '/admin/disputes/case_vp_0421', { cookie: a.cookie });
  assert.equal(c.data.data.case.controlVersion, 2);
  const challenge = await api(base, 'POST', '/auth/mfa/challenges', { ...a, body: { purpose: 'ADMIN_INTERVENTION', targetId: 'case_vp_0421' } });
  const verify = await api(base, 'POST', '/auth/mfa/verify', { ...a, body: { challengeId: challenge.data.data.challengeId, code: '123456' } });
  const changed = await api(base, 'POST', '/admin/disputes/case_vp_0421/interventions', { ...a, version: 2, body: { action: 'ALLOW_VOLUNTARY_MEDIATION', reason: 'Shared evidence conflict review', stepUpId: verify.data.data.stepUpId } });
  assert.equal(changed.status, 200); assert.equal(changed.data.data.caseVersion, 3); assert.equal(changed.data.data.controlVersion, 3);
}));
test('source upload stays private then can share only after CLEAN and consent', async () => withApi(async base => {
  const s = await login(base);
  const intent = await api(base, 'POST', '/disputes/case_vp_0421/sources/upload-intents', { ...s, body: { originalName: 'serial-number-box.jpg', mime: 'image/jpeg', byteCount: 4 } });
  assert.equal(intent.status, 201); assert.equal(intent.data.data.audience, 'PRIVATE');
  const { sourceId, uploadId, uploadHandle } = intent.data.data;
  const upload = await fetch(uploadHandle.url, { method: 'PUT', body: Buffer.from([1,2,3,4]) }); assert.equal(upload.status, 204);
  const fin = await api(base, 'POST', `/disputes/case_vp_0421/sources/${sourceId}/finalize`, { ...s, version: 1, body: { uploadId } });
  assert.equal(fin.status, 202); assert.equal(fin.data.data.scanState, 'SCANNING');
  const poll = await api(base, 'GET', `/disputes/case_vp_0421/sources/${sourceId}`, { cookie: s.cookie });
  assert.equal(poll.data.data.scanState, 'SCANNING');
  const clean = await api(base, 'GET', `/disputes/case_vp_0421/sources/${sourceId}`, { cookie: s.cookie });
  assert.equal(clean.data.data.scanState, 'CLEAN');
  const share = await api(base, 'POST', `/disputes/case_vp_0421/sources/${sourceId}/share`, { ...s, version: 1, body: { audience: 'CASE_SHARED', consentIntent: 'SHARE_SOURCE', paramsHash: 'mock_hash' } });
  assert.equal(share.status, 200); assert.equal(share.data.data.sourceVersion, 2); assert.equal(share.data.data.caseVersion, 4); assert.equal(share.data.data.accessRevision, 4);
}));
test('idempotency conflicts and duplicate issueKey links existing case', async () => withApi(async base => {
  const s = await login(base);
  const body = { transactionId: 'tx_vp_1028', orderId: null, category: 'ITEM_NOT_AS_DESCRIBED', statement: 'Mismatch', audience: 'CASE_SHARED' };
  const a = await api(base, 'POST', '/disputes', { ...s, key: 'dsp-open-001', body });
  assert.equal(a.status, 409); assert.equal(a.data.error.code, 'DUPLICATE_ACTIVE_CASE');
  assert.equal(a.data.error.fieldErrors.existingCaseId, 'case_vp_0421');
  const b = { ...body, category: 'CONTESTED_CLAIM' };
  const created = await api(base, 'POST', '/disputes', { ...s, key: 'dsp-open-002', body: b });
  assert.equal(created.status, 201);
  const retry = await api(base, 'POST', '/disputes', { ...s, key: 'dsp-open-002', body: b });
  assert.equal(retry.status, 201); assert.equal(retry.data.data.caseId, created.data.data.caseId);
  const conflict = await api(base, 'POST', '/disputes', { ...s, key: 'dsp-open-002', body: { ...b, statement: 'Different statement' } });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.error.code, 'IDEMPOTENCY_CONFLICT');
}));
test('real finance never fake-success; UNKNOWN reconcile remains UNKNOWN', async () => withApi(async base => {
  const s = await login(base);
  const r = await api(base, 'POST', '/checkout/orders', { ...s, key: 'chk-ord-001', body: {} });
  assert.equal(r.status, 501); assert.equal(r.data.error.code, 'MOCK_FINANCIAL_EXECUTION_UNAVAILABLE');
  const op = await api(base, 'POST', '/operations/op_ref_01JBYZ/reconcile', { ...s, key: 'rec-op_ref_01JBYZ-01', body: {} });
  assert.equal(op.status, 200); assert.equal(op.data.data.status, 'UNKNOWN'); assert.equal(op.data.data.providerRef, null);
}));
test('admin-only and internal routes blocked from customer/browser', async () => withApi(async base => {
  const s = await login(base);
  assert.equal((await api(base, 'GET', '/admin/disputes', { cookie: s.cookie })).status, 403);
  const internal = await fetch(`${base}/internal/v1/case-runs`, { method: 'POST' });
  assert.equal(internal.status, 404);
}));
