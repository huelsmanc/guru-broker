// Client portal: per-client links confirmed with an emailed code; clients only reach their own
// deal; messages land in a separate client chat; document requests and uploads; team-only actions.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', RESEND_API_KEY: 're' });
const emails = [];
globalThis.fetch = async (url, init = {}) => { url = String(url);
  if (url.includes('resend')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"e"}'); }
  throw new Error('unexpected ' + url); };
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' }, tess: { id: 'u2', email: 'tess@x.com' }, bob: { id: 'u4', email: 'bob@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: { phone: '555' } },
    { id: 'u2', email: 'tess@x.com', full_name: 'Tess TC', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u4', email: 'bob@x.com', full_name: 'Bob Other', role: 'user', brokerage_id: 'B1', extra: {} },
  ],
  transaction: [
    { id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', tc_email: 'tess@x.com', property_address: '1 Elm St, Chester, CT', status: 'active', closing_date: '2026-11-01', documents: [], extra: {} },
    { id: 't2', brokerage_id: 'B1', agent_email: 'bob@x.com', property_address: '9 Oak', status: 'active', documents: [], extra: {} },
  ],
  transaction_contact: [
    { id: 'k1', brokerage_id: 'B1', transaction_id: 't1', name: 'Bill Buyer', email: 'Bill@c.com', role: 'buyer', is_client: true, extra: {} },
    { id: 'k2', brokerage_id: 'B1', transaction_id: 't1', name: 'Lenny Lender', email: 'len@bank.com', role: 'lender', is_client: false, extra: {} },
    { id: 'k3', brokerage_id: 'B1', transaction_id: 't2', name: 'Other Client', email: 'oc@c.com', role: 'buyer', is_client: true, extra: {} },
  ],
  checklist: [], group_chat: [], group_message: [], notification: [], brokerage_settings: [], brokerage: [], push_subscription: [],
};
globalThis.__rls = { transaction: (row, u) => [row.agent_email, row.tc_email].includes(u.email) };
const { POST } = await import('./fn.mjs');
const call = (body, tok) => POST(new Request('https://gurubroker.app/api/fn/clientPortal', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}) }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const contact = (id) => { const c = __db.transaction_contact.find((x) => x.id === id); return { ...c, ...(c.extra || {}) }; };

// Team: only people on the deal; invite emails the client a link.
let r = await call({ action: 'team', transaction_id: 't1' }, 'bob');
assert.equal(r.status, 404, 'cannot see the deal');
r = await call({ action: 'invite', transaction_id: 't1', contact_id: 'k2' }, 'ann');
assert.equal(r.status, 404, 'lender is not a client');
r = await call({ action: 'invite', transaction_id: 't1', contact_id: 'k1' }, 'ann');
assert.equal(r.status, 200, JSON.stringify(r.body));
const link = r.body.link; const t = new URL(link).searchParams.get('t');
assert.ok(link.startsWith('https://gurubroker.app/portal?t=') && t.length >= 30);
assert.equal(emails.at(-1).to[0], 'Bill@c.com'); assert.ok(emails.at(-1).html.includes(link.replace(/&/g, '&amp;')));
r = await call({ action: 'team', transaction_id: 't1' }, 'tess');
assert.equal(r.body.clients.length, 1); assert.equal(r.body.clients[0].active, true);
const group = r.body.group;
assert.equal(group.client_transaction_id, 't1');
assert.deepEqual(group.members.map((m) => m.email).sort(), ['ann@x.com', 'bill@c.com', 'tess@x.com']);
assert.equal(__db.group_chat.length, 1, 'one client chat, not the team deal chat');

// Client: link alone isn't enough; code by email.
r = await call({ action: 'open', t: 'x'.repeat(32) });
assert.equal(r.status, 404);
r = await call({ action: 'open', t });
assert.equal(r.body.needs_code, true); assert.match(r.body.email_hint, /^bi•+@c\.com$/);
r = await call({ action: 'load', session: 'forged.sig' });
assert.equal(r.status, 401);
r = await call({ action: 'send_code', t });
const code = emails.at(-1).subject.match(/\d{6}/)[0];
r = await call({ action: 'verify', t, code: '000000' === code ? '111111' : '000000' });
assert.equal(r.status, 400);
r = await call({ action: 'verify', t, code });
assert.equal(r.status, 200); const session = r.body.session;
r = await call({ action: 'verify', t, code });
assert.equal(r.status, 400, 'code works once');
r = await call({ action: 'open', t, session });
assert.equal(r.body.session, session, 'device remembered');

r = await call({ action: 'load', session });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.deal.property, '1 Elm St, Chester, CT');
assert.deepEqual(r.body.deal.dates, [{ label: 'Closing', date: '2026-11-01', done: false }]);
assert.equal(r.body.team[0].name, 'Ann Agent'); assert.equal(r.body.team[0].role, 'Your agent');
assert.ok(!JSON.stringify(r.body).includes('commission'), 'no money details');

// Messages: client posts into the client chat as themselves.
r = await call({ action: 'send', session, text: 'When is the inspection?' });
assert.equal(r.status, 200); assert.equal(r.body.message.mine, true);
const gm = __db.group_message.at(-1);
assert.equal(gm.group_id, group.id); assert.equal(gm.sender_email, 'bill@c.com'); assert.equal(gm.sender_name, 'Bill Buyer');
__db.group_message.push({ id: 'm2', group_id: group.id, brokerage_id: 'B1', sender_email: 'ann@x.com', sender_name: 'Ann Agent', content: 'Tuesday at 10', created_date: new Date(Date.now() + 1000).toISOString(), extra: {} });
r = await call({ action: 'messages', session, after: gm.created_date });
assert.deepEqual(r.body.messages.map((m) => [m.content, m.mine]), [['Tuesday at 10', false]]);

// Agent's message emails the client (they haven't been on the portal for a while), at most every 30 min.
__db.transaction_contact.find((x) => x.id === 'k1').extra.portal_last_seen = new Date(Date.now() - 3600_000).toISOString();
const svc = (body) => POST(new Request('https://gurubroker.app/api/fn/pushOnMessage', { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: JSON.stringify(body) })).then((x) => x.json());
const before = emails.length;
await svc({ event: { type: 'create', entity_name: 'GroupMessage', data: { id: 'm2', group_id: group.id, sender_email: 'ann@x.com', sender_name: 'Ann Agent', content: 'Tuesday at 10' } } });
assert.equal(emails.length, before + 1); assert.equal(emails.at(-1).to[0], 'Bill@c.com'); assert.ok(emails.at(-1).html.includes('Tuesday at 10'));
await svc({ event: { type: 'create', entity_name: 'GroupMessage', data: { id: 'm3', group_id: group.id, sender_email: 'ann@x.com', sender_name: 'Ann Agent', content: 'Also bring ID' } } });
assert.equal(emails.length, before + 1, 'throttled');
await svc({ event: { type: 'create', entity_name: 'GroupMessage', data: { id: 'm4', group_id: group.id, sender_email: 'bill@c.com', sender_name: 'Bill Buyer', content: 'ok' } } });
assert.equal(emails.length, before + 1, "client's own message doesn't email clients");

// Document requests and uploads.
r = await call({ action: 'request', transaction_id: 't1', title: 'Proof of funds', note: 'Bank statement from the last 30 days' }, 'tess');
assert.equal(r.status, 200); const reqId = r.body.request.id;
assert.match(emails.at(-1).subject, /Proof of funds/);
r = await call({ action: 'load', session });
assert.deepEqual(r.body.requests.map((x) => [x.title, x.status]), [['Proof of funds', 'open']]);
r = await call({ action: 'upload_url', session, name: 'virus.exe', size: 10 });
assert.equal(r.status, 400);
r = await call({ action: 'upload_url', session, name: 'statement.pdf', size: 1000 });
assert.equal(r.status, 200); const path = r.body.path;
assert.ok(path.startsWith('scoped/B1/tx/t1/client-'));
r = await call({ action: 'upload_done', session, path, name: 'statement.pdf', request_id: reqId });
assert.equal(r.status, 400, 'not uploaded yet');
globalThis.__storage[`private-files/${path}`] = 'pdf';
r = await call({ action: 'upload_done', session, path: 'scoped/B1/tx/t2/client-x.pdf', name: 'x.pdf' });
assert.equal(r.status, 403, 'only this deal');
r = await call({ action: 'upload_done', session, path, name: 'statement.pdf', request_id: reqId });
assert.equal(r.status, 200, JSON.stringify(r.body));
const tx = __db.transaction.find((x) => x.id === 't1'); const flat = { ...tx, ...(tx.extra || {}) };
assert.equal(flat.documents.at(-1).source, 'client'); assert.equal(flat.documents.at(-1).uploaded_by, 'Bill Buyer');
assert.equal(flat.client_requests[0].status, 'received');
assert.ok(__db.notification.some((n) => n.user_email === 'ann@x.com' && /uploaded/.test(n.title)), 'agent notified');

// New link logs out old devices; disable turns it off.
r = await call({ action: 'new_link', transaction_id: 't1', contact_id: 'k1', email: false }, 'ann');
r = await call({ action: 'load', session });
assert.equal(r.status, 401, 'old session stops working');
r = await call({ action: 'disable', transaction_id: 't1', contact_id: 'k1' }, 'ann');
assert.equal(contact('k1').portal_token, null);
console.log('client portal: all checks passed');
