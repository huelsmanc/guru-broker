// Follow Up Boss: the owner connects once (the API key is stored encrypted and never sent back),
// agents are matched by email, people in "Under Contract" get one deal each (with the Zillow Flex
// referral), webhooks are checked against the signature and the brokerage's token, a closing is
// written back, and a deal shows the linked person's activity.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', FUB_SYSTEM: 'GuruBroker', FUB_SYSTEM_KEY: 'sys-key-123' });
const calls = [];
const P1 = { id: 501, name: 'Carla Client', emails: [{ value: 'carla@home.com', isPrimary: 1 }], phones: [{ value: '555-0101' }], stage: 'Under Contract', source: 'Zillow Flex', type: 'Buyer', price: 450000, addresses: [{ street: '12 Elm St', city: 'Chester', state: 'CT', code: '06412' }], assignedUserId: 11, assignedTo: 'Ann Agent' };
const P2 = { id: 502, name: 'Nina Nomatch', stage: 'Under Contract', source: 'Website', assignedUserId: 12 };
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, method, body, headers: init.headers || {} });
  if (!url.startsWith('https://api.followupboss.com/v1')) throw new Error('unexpected ' + url);
  if (init.headers?.Authorization !== `Basic ${Buffer.from('fub-owner-key:').toString('base64')}`) return Response.json({ errorMessage: 'bad key' }, { status: 401 });
  if (init.headers?.['X-System'] !== 'GuruBroker' || init.headers?.['X-System-Key'] !== 'sys-key-123') return Response.json({ errorMessage: 'no system' }, { status: 403 });
  const path = url.slice('https://api.followupboss.com/v1'.length);
  if (path === '/me') return Response.json({ id: 1, name: 'Olivia Owner', email: 'owner@x.com', role: 'Owner' });
  if (path.startsWith('/users')) return Response.json({ users: [{ id: 11, name: 'Ann Agent', email: 'ANN@x.com', role: 'Agent' }, { id: 12, name: 'Zed', email: 'zed@elsewhere.com', role: 'Agent' }] });
  if (path.startsWith('/stages')) return Response.json({ stages: [{ name: 'Lead' }, { name: 'Under Contract' }, { name: 'Closed' }] });
  if (path === '/webhooks' && method === 'POST') return Response.json({ id: 99, ...body });
  if (path.startsWith('/people?stage=Under%20Contract')) return Response.json({ people: [P1, P2] });
  if (path.startsWith('/people?stage=')) return Response.json({ people: [] });
  if (path.startsWith('/people?id=')) return Response.json({ people: [P1, P2].filter((p) => path.includes(String(p.id))) });
  if (path.startsWith('/people?name=')) return Response.json({ people: [P1] });
  if (path.startsWith('/people/501') && method === 'PUT') return Response.json({ ...P1, ...body });
  if (path.startsWith('/people/501')) return Response.json(P1);
  if (path.startsWith('/deals')) return Response.json({ deals: [] });
  if (path === '/notes' && method === 'POST') return Response.json({ id: 7, ...body });
  if (path.startsWith('/notes?')) return Response.json({ notes: [{ created: '2026-09-30T10:00:00Z', subject: 'Showing', body: 'Loved the kitchen', createdBy: 'Ann Agent' }] });
  if (path.startsWith('/calls?')) return Response.json({ calls: [{ created: '2026-10-01T15:00:00Z', isIncoming: false, duration: 300, userName: 'Ann Agent' }] });
  if (path.startsWith('/textMessages?')) return Response.json({ textmessages: [{ created: '2026-10-02T09:00:00Z', isIncoming: true, message: 'We signed!' }] });
  throw new Error('unexpected FUB path ' + method + ' ' + path);
};
globalThis.__users = { owner: { id: 'u0', email: 'owner@x.com' }, ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'owner@x.com', full_name: 'Olivia Owner', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', extra: {} },
  ],
  brokerage_settings: [{ id: 's1', brokerage_id: 'B1', default_tc_email: 'tina@x.com', extra: {} }],
  app_secret: [], transaction: [], transaction_contact: [], notification: [],
};
const { POST } = await import('./fn.mjs');
const call = (name, tok, body, headers = {}, raw) => POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: raw ?? JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const svc = (body) => call('fub', null, body, { 'x-gbh-service': 'hs' });

// Only admins connect; a wrong key is refused.
assert.equal((await call('fub', 'ann', { action: 'connect', api_key: 'fub-owner-key' })).status, 403);
let r = await call('fub', 'owner', { action: 'connect', api_key: 'wrong' });
assert.equal(r.status, 400); assert.match(r.body.error, /didn't accept/);
r = await call('fub', 'owner', { action: 'connect', api_key: 'fub-owner-key' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.connected, true); assert.equal(r.body.account.email, 'owner@x.com');
assert.deepEqual(r.body.user_map, { 11: 'ann@x.com' }, 'matched by email');
assert.deepEqual(r.body.contract_stages, ['Under Contract']); assert.equal(r.body.closed_stage, 'Closed'); assert.equal(r.body.webhook, true);
assert.ok(!JSON.stringify(r.body).includes('fub-owner-key'), 'key never sent back');
const stored = __db.app_secret.find((x) => x.name === 'fub:B1').value;
assert.ok(stored.api_key && !stored.api_key.includes('fub-owner-key'), 'key encrypted at rest');
const hook = calls.find((c) => c.url.endsWith('/webhooks')).body;
assert.equal(hook.event, 'peopleStageUpdated'); assert.match(hook.url, /^https:\/\/gurubroker\.app\/api\/fn\/fubWebhook\?b=B1&t=[a-f0-9]{36}$/);

// The 10-minute check: Carla (Ann's Zillow Flex lead) gets a deal; Nina's agent isn't matched.
assert.equal((await call('fub', 'owner', { poll: true })).status, 403, 'system only');
r = await svc({ poll: true });
assert.equal(r.body.B1.made, 1, JSON.stringify(r.body)); assert.equal(r.body.B1.unmatched, 1);
const tx = __db.transaction[0];
assert.equal(tx.agent_email, 'ann@x.com'); assert.equal(tx.property_address, '12 Elm St, Chester, CT 06412'); assert.equal(tx.sale_price, 450000);
assert.deepEqual(tx.referral, { type: 'pct', amount: 35, to: 'Zillow Flex' });
assert.equal(tx.extra.fub_person_id, '501'); assert.equal(tx.tc_email, 'tina@x.com'); assert.deepEqual(tx.buyers, ['Carla Client']);
assert.equal(__db.transaction_contact[0].email, 'carla@home.com');
assert.ok(__db.notification.some((n) => n.user_email === 'ann@x.com' && /New deal from Follow Up Boss/.test(n.title)));
r = await svc({ poll: true });
assert.equal(r.body.B1.made, 0, 'one deal per person'); assert.equal(__db.transaction.length, 1);
r = await call('fub', 'owner', { action: 'status' });
assert.equal(r.body.unmatched[0].name, 'Nina Nomatch');

// Matching Nina's agent by hand isn't possible to someone outside the brokerage... but the setting saves.
r = await call('fub', 'owner', { action: 'settings', flex_pct: 40, user_map: { 11: 'ann@x.com', 999: 'x@y.com' } });
assert.equal(r.body.flex_pct, 40); assert.deepEqual(r.body.user_map, { 11: 'ann@x.com' }, 'unknown Follow Up Boss users ignored');

// Webhooks: wrong token or signature ignored/refused; a good one is accepted (no duplicate deal).
const raw = JSON.stringify({ event: 'peopleStageUpdated', resourceIds: [501] });
const sig = crypto.createHmac('sha256', 'sys-key-123').update(Buffer.from(raw).toString('base64')).digest('hex');
const tok = new URL(hook.url).searchParams.get('t');
r = await call(`fubWebhook?b=B1&t=nope`, null, null, { 'fub-signature': sig }, raw);
assert.equal(r.body.made, undefined, 'wrong token ignored');
r = await call(`fubWebhook?b=B1&t=${tok}`, null, null, { 'fub-signature': 'bad' }, raw);
assert.equal(r.status, 401);
r = await call(`fubWebhook?b=B1&t=${tok}`, null, null, { 'fub-signature': sig }, raw);
assert.equal(r.status, 200); assert.equal(r.body.made, 0); assert.equal(__db.transaction.length, 1);

// On the deal: the person and their latest activity, newest first.
r = await call('fub', 'ann', { action: 'deal', transaction_id: tx.id });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.person.name, 'Carla Client'); assert.equal(r.body.person.url, 'https://app.followupboss.com/2/people/view/501');
assert.deepEqual(r.body.activity.map((a) => a.kind), ['text', 'call', 'note']);
// Agents search only their own Follow Up Boss people.
r = await call('fub', 'ann', { action: 'search', q: 'Carla' });
assert.equal(r.body.people[0].id, 501);
assert.match(calls.filter((c) => c.url.includes('/people?name=')).at(-1).url, /assignedUserId=11/);

// Closing here updates Follow Up Boss: stage, price and a note.
r = await svc({ event: { type: 'update', entity_name: 'Transaction', data: { ...tx, ...tx.extra, status: 'closed', closed_date: '2026-10-20', sale_price: 455000 }, old_data: { status: 'active' } } });
assert.equal(r.body.ok, true, JSON.stringify(r.body));
const put = calls.find((c) => c.method === 'PUT');
assert.deepEqual(put.body, { stage: 'Closed', price: 455000 });
assert.match(calls.filter((c) => c.method === 'POST' && c.url.endsWith('/notes')).at(-1).body.body, /Closed on 2026-10-20 at \$455,000/);

// Disconnect removes the key and the webhook.
r = await call('fub', 'owner', { action: 'disconnect' });
assert.equal(r.body.connected, false);
assert.ok(!__db.app_secret.some((x) => x.name === 'fub:B1'));
console.log('Follow Up Boss: all checks passed');
