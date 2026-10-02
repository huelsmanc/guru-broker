// Error alerts and platform tools: server 5xx answers and browser crashes are logged (4xx and
// noise aren't), only the platform owner sees the list, the alert email goes out once per new
// error, the platform users list is owner-only, and new trainings reach every learner.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app',
  RESEND_API_KEY: 're_test', LOB_API_KEY: 'test_lob', STRIPE_SECRET_KEY: 'sk_test' });
globalThis.__lenientSign = true;
const emails = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url === 'https://api.resend.com/emails') { emails.push(JSON.parse(init.body)); return Response.json({ id: `em${emails.length}` }); }
  if (url.startsWith('https://api.stripe.com/')) return Response.json({ error: { message: 'Stripe is down' } }, { status: 500 });
  return Response.json({});
};
// Tokens shaped like real ones, so "who hit it" can be read from them.
const jwt = (email) => `h.${Buffer.from(JSON.stringify({ email, aal: 'aal2' })).toString('base64url')}.s`;
const ANN = jwt('ann@x.com'); const ROOT = jwt('root@x.com');
globalThis.__users = { [ANN]: { id: 'u1', email: 'ann@x.com' }, [ROOT]: { id: 'u0', email: 'root@x.com' } };
globalThis.__authUsers = [{ id: 'u1', email: 'ann@x.com', last_sign_in_at: '2026-09-30T10:00:00Z' }, { id: 'u0', email: 'root@x.com', last_sign_in_at: '2026-10-01T10:00:00Z' }];
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'tl@x.com', full_name: 'Tia', role: 'team_leader', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'new@x.com', full_name: 'Ned', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u4', email: 'boss@x.com', full_name: 'Bo', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u5', email: 'gone@x.com', full_name: 'Gus', role: 'agent', brokerage_id: 'B1', suspended: true, extra: {} },
    { id: 'u6', email: 'far@o.com', full_name: 'Fay', role: 'agent', brokerage_id: 'B2', extra: {} },
    { id: 'u0', email: 'root@x.com', full_name: 'Root', role: 'super_admin', brokerage_id: 'B1', extra: {} },
  ],
  brokerage: [{ id: 'B1', name: 'Acme', status: 'active', account_owner_id: 'u4' }],
  app_secret: [{ name: 'print_settings', value: { test_mode: false } }],
  app_error: [], notification: [], print_order: [],
};
// Stand-in for the log_app_error database function (same rules as migration 0014).
globalThis.__rpc = { log_app_error: (a) => {
  const rows = __db.app_error; const hit = rows.find((r) => r.fingerprint === a.p_fingerprint);
  if (!hit) { rows.push({ id: `e${rows.length + 1}`, fingerprint: a.p_fingerprint, source: a.p_source, location: a.p_location, message: a.p_message, detail: a.p_detail, count: 1, users: a.p_user_email ? [a.p_user_email] : [], resolved: false, notified_at: null, last_seen: new Date().toISOString(), extra: {} }); return true; }
  hit.count += 1; if (a.p_user_email && !hit.users.includes(a.p_user_email)) hit.users.push(a.p_user_email);
  const was = hit.resolved; hit.resolved = false; if (was) hit.notified_at = null; return was;
} };
const { POST } = await import('./fn.mjs');
const call = (name, tok, body, headers = {}) => POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: JSON.stringify(body) }))
  .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
const svc = (name, body) => call(name, null, body, { 'x-gbh-service': 'hs' });

// A server failure (Stripe down while ordering) is logged, with who hit it; a 4xx isn't.
const files = { front: `/api/file?p=${encodeURIComponent('scoped/B1/user/u1/f.png')}`, back: `/api/file?p=${encodeURIComponent('scoped/B1/user/u1/b.png')}` };
let r = await call('printShop', ANN, { action: 'order', product: 'postcard_4x6', files, recipients: [{ name: 'A', address_line1: '1 Elm St', city: 'Chester', state: 'CT', zip: '06412' }] });
assert.equal(r.status, 502, JSON.stringify(r.body));
assert.equal(__db.app_error.length, 1);
assert.equal(__db.app_error[0].location, 'printShop'); assert.match(__db.app_error[0].message, /Stripe is down/); assert.deepEqual(__db.app_error[0].users, ['ann@x.com']);
r = await call('printShop', ANN, { action: 'settings_save', settings: {} });
assert.equal(r.status, 403);
assert.equal(__db.app_error.length, 1, '4xx answers are not errors');

// Browser crashes: logged even when signed out; noise skipped; repeats counted.
const crash = (msg, tok) => call('reportError', tok, { message: msg, stack: 'at Page (app.js:1:2)', url: 'https://gurubroker.app/Transactions?id=1' });
await crash("Cannot read properties of undefined (reading 'price')", ANN);
await crash("Cannot read properties of undefined (reading 'price')", null);
await crash('ResizeObserver loop completed with undelivered notifications.', ANN);
await crash('Failed to fetch', ANN);
const b = __db.app_error.filter((e) => e.source === 'browser');
assert.equal(b.length, 1, 'noise skipped'); assert.equal(b[0].count, 2); assert.equal(b[0].location, '/Transactions');

// Only the platform owner sees the list.
r = await call('appErrors', ANN, { action: 'list' });
assert.equal(r.status, 403);
r = await call('appErrors', ROOT, { action: 'list' });
assert.equal(r.body.errors.length, 2);

// Alert email: once per new error, to the platform owner only.
r = await call('appErrors', ANN, { alert: true });
assert.equal(r.status, 403, 'alerts run on schedule only');
r = await svc('appErrors', { alert: true });
assert.deepEqual(r.body, { sent: 1, errors: 2 });
assert.equal(emails.length, 1); assert.deepEqual(emails[0].to, ['root@x.com']); assert.match(emails[0].subject, /2 new errors/);
assert.match(emails[0].html, /Stripe is down/); assert.match(emails[0].html, /SuperAdmin\?tab=errors/);
r = await svc('appErrors', { alert: true });
assert.equal(emails.length, 1, 'no repeat email for the same errors');
await crash("Cannot read properties of undefined (reading 'price')", ANN);
r = await svc('appErrors', { alert: true });
assert.equal(emails.length, 1, 'a repeat is counted, not emailed');
// Marked fixed, then it happens again: emailed again.
const browserErr = __db.app_error.find((e) => e.source === 'browser');
r = await call('appErrors', ROOT, { action: 'resolve', id: browserErr.id });
assert.equal(browserErr.resolved, true);
await crash("Cannot read properties of undefined (reading 'price')", ANN);
r = await svc('appErrors', { alert: true });
assert.equal(emails.length, 2, 'back after being fixed: emailed again');

// Platform users list: owner only, with last sign-in.
r = await call('platformUsers', ANN, { action: 'list' });
assert.equal(r.status, 403);
r = await call('platformUsers', ROOT, { action: 'list' });
assert.equal(r.body.users.length, 7); assert.equal(r.body.users.find((u) => u.id === 'u1').last_sign_in_at, '2026-09-30T10:00:00Z');
assert.equal(r.body.brokerages[0].name, 'Acme');

// A new training reaches agents (old and new role names), team leaders and TCs in that brokerage only,
// as an in-app alert (no email); nobody is told when the admin unticks "Let agents know".
r = await svc('notifyAgentsNewTraining', { event: { type: 'create', data: { id: 't0', title: 'Quiet one', brokerage_id: 'B1', notify_agents: false } } });
assert.equal(r.body.notifiedAgents, 0); assert.equal((__db.notification || []).length, 0);
const emailsBefore = emails.length;
r = await svc('notifyAgentsNewTraining', { event: { type: 'create', data: { id: 't1', title: 'Fair housing 2026', brokerage_id: 'B1' } } });
assert.equal(r.body.notifiedAgents, 3, JSON.stringify(r.body));
const told = __db.notification.map((n) => n.user_email).sort();
assert.deepEqual(told, ['ann@x.com', 'new@x.com', 'tl@x.com']);
assert.match(__db.notification[0].description, /Fair housing 2026/);
assert.equal(emails.length, emailsBefore, 'no training emails');
console.log('error alerts and platform tools: all checks passed');
