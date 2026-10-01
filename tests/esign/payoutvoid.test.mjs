// Voiding payouts that were already sent or paid: Payload is asked to stop a sent deposit;
// "books only" needs a reason and is recorded; agents can't do either.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', PAYLOAD_SECRET_KEY: 'sk', PAYLOAD_PROCESSING_ID: 'pr' });
const calls = [];
globalThis.fetch = async (url, init = {}) => { url = String(url); calls.push({ url, method: init.method, body: String(init.body || '') });
  if (url.includes('/transactions/txn_late')) return new Response(JSON.stringify({ error_description: 'Transaction already processed' }), { status: 400 });
  if (url.includes('/transactions/')) return new Response(JSON.stringify({ id: 'x', status: 'voided' }));
  throw new Error('unexpected ' + url); };
globalThis.__users = { boss: { id: 'u3', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [{ id: 'u1', email: 'ann@x.com', role: 'user', brokerage_id: 'B1', extra: {} }, { id: 'u3', email: 'boss@x.com', role: 'owner', brokerage_id: 'B1', extra: {} }],
  payout: [
    { id: 'p1', brokerage_id: 'B1', status: 'sent', payload_transaction_id: 'txn_ok', amount: 100, extra: {} },
    { id: 'p2', brokerage_id: 'B1', status: 'sent', payload_transaction_id: 'txn_late', amount: 100, extra: {} },
    { id: 'p3', brokerage_id: 'B1', status: 'paid', method: 'manual', amount: 100, extra: {} },
  ],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/payoutAction', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const row = (id) => __db.payout.find((p) => p.id === id);
let r = await call('ann', { payoutIds: ['p1'], action: 'void_sent' });
assert.equal(r.status, 403);
r = await call('boss', { payoutIds: ['p1', 'p2'], action: 'void_sent' });
assert.deepEqual(r.body.results.map((x) => x.ok), [true, false], JSON.stringify(r.body));
assert.equal(row('p1').status, 'void'); assert.equal(calls[0].method, 'PUT'); assert.match(calls[0].url, /\/transactions\/txn_ok$/); assert.match(calls[0].body, /status=voided/);
assert.equal(row('p2').status, 'sent', 'already went out: untouched'); assert.ok(r.body.results[1].record_only_possible);
r = await call('boss', { payoutIds: ['p3'], action: 'void_record', memo: '' });
assert.equal(r.body.results[0].ok, false); assert.equal(row('p3').status, 'paid');
r = await call('boss', { payoutIds: ['p2', 'p3'], action: 'void_record', memo: 'Test deal' });
assert.deepEqual(r.body.results.map((x) => x.ok), [true, true]);
assert.equal(row('p3').status, 'void'); const flat = { ...row('p3'), ...(row('p3').extra || {}) };
assert.equal(flat.void_note, 'Test deal'); assert.equal(flat.was, 'paid'); assert.equal(flat.voided_by, 'boss@x.com');
console.log('payout void: all checks passed');
