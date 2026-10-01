// Deleting a deal: admins only, same brokerage, refused once money went out; cleans up the deal's own records.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => { throw new Error('unexpected ' + url); };
globalThis.__users = { boss: { id: 'u3', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, eve: { id: 'u9', email: 'eve@o.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'boss@x.com', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@o.com', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  transaction: [{ id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '1 Elm', extra: {} }, { id: 't2', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '2 Oak', extra: {} }],
  checklist: [{ id: 'c1', subject_type: 'transaction', subject_id: 't1', extra: {} }, { id: 'c2', subject_type: 'agent', subject_id: 't1', extra: {} }],
  transaction_contact: [{ id: 'k1', transaction_id: 't1', extra: {} }],
  group_chat: [{ id: 'g1', transaction_id: 't1', extra: {} }, { id: 'g2', transaction_id: null, extra: {} }],
  group_message: [{ id: 'm1', group_id: 'g1', extra: {} }, { id: 'm2', group_id: 'g2', extra: {} }],
  commission_record: [{ id: 'r1', transaction_id: 't1', status: 'pending', extra: {} }],
  payout: [{ id: 'p1', transaction_id: 't1', status: 'pending', extra: {} }, { id: 'p2', transaction_id: 't2', status: 'sent', extra: {} }],
  offer: [{ id: 'o1', transaction_id: 't1', extra: {} }],
  esign_document: [{ id: 'e1', transaction_id: 't1', extra: {} }],
  marketing_design: [],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/deleteTransaction', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
let r = await call('ann', { id: 't1' });
assert.equal(r.status, 403, 'agents cannot delete'); assert.match(r.body.error, /cancel/i);
r = await call('eve', { id: 't1' });
assert.equal(r.status, 404, 'other brokerage');
r = await call('boss', { id: 't2' });
assert.equal(r.status, 409, 'money already went out');
assert.ok(__db.transaction.some((t) => t.id === 't2'));
r = await call('boss', { id: 't1' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(__db.transaction.map((t) => t.id), ['t2']);
assert.deepEqual(__db.checklist.map((c) => c.id), ['c2']);
assert.equal(__db.transaction_contact.length, 0);
assert.deepEqual(__db.group_chat.map((g) => g.id), ['g2']); assert.deepEqual(__db.group_message.map((m) => m.id), ['m2']);
assert.equal(__db.commission_record.length, 0); assert.deepEqual(__db.payout.map((p) => p.id), ['p2']);
assert.equal(__db.offer[0].transaction_id, null, 'offer kept, unlinked'); assert.equal(__db.esign_document[0].transaction_id, null, 'signed doc kept');
console.log('deal delete: all checks passed');
