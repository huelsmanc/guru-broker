// iPhone app notifications: devices saved as "apns:<token>" get Apple pushes (signed with the
// .p8 key), browsers still get Web Push; a development device falls back to Apple's sandbox
// once and is remembered; a device Apple says is gone is removed.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app',
  APNS_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }), APNS_KEY_ID: 'KEY123', APNS_TEAM_ID: 'TEAM456', APNS_BUNDLE_ID: 'app.gurubroker.ios',
  VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y' });
const apple = [];
const PROD = 'a'.repeat(64); const DEV = 'b'.repeat(64); const GONE = 'c'.repeat(64);
globalThis.__apnsRequest = async (env, token, headers, body) => {
  apple.push({ env, token, headers, body: JSON.parse(body) });
  if (token === GONE) return { status: 410, reason: 'Unregistered' };
  if (token === DEV && env === 'production') return { status: 400, reason: 'BadDeviceToken' };
  return { status: 200, reason: '' };
};
const web = [];
globalThis.fetch = async (url) => { web.push(String(url)); return new Response('', { status: 201 }); };
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [{ id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} }],
  push_subscription: [
    { id: 'p1', user_email: 'ann@x.com', endpoint: `apns:${PROD}`, extra: {} },
    { id: 'p2', user_email: 'ann@x.com', endpoint: `apns:${DEV}`, extra: {} },
    { id: 'p3', user_email: 'ann@x.com', endpoint: `apns:${GONE}`, extra: {} },
  ],
};
const { POST } = await import('./fn.mjs');
const r = await POST(new Request('https://gurubroker.app/api/fn/pushKey', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ann' }, body: JSON.stringify({ test: true }) })).then((x) => x.json());
assert.equal(r.sent, 2, JSON.stringify(r));
assert.equal(web.length, 0, 'no web push for app devices');

const prod = apple.find((a) => a.token === PROD);
assert.equal(prod.env, 'production');
assert.equal(prod.headers['apns-topic'], 'app.gurubroker.ios'); assert.equal(prod.headers['apns-push-type'], 'alert');
assert.equal(prod.body.aps.alert.title, 'Notifications are on'); assert.equal(prod.body.url, '/Dashboard');
// The signed token is valid for Apple: ES256 over header.claims with our key, right key id and team.
const [h, c, s] = prod.headers.authorization.replace('bearer ', '').split('.');
assert.deepEqual(JSON.parse(Buffer.from(h, 'base64url')), { alg: 'ES256', kid: 'KEY123' });
assert.equal(JSON.parse(Buffer.from(c, 'base64url')).iss, 'TEAM456');
assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url')), 'signature checks out');

assert.deepEqual(apple.filter((a) => a.token === DEV).map((a) => a.env), ['production', 'sandbox'], 'development device falls back to the sandbox');
const dev = __db.push_subscription.find((x) => x.id === 'p2');
assert.equal(dev.extra?.apns_env || dev.apns_env, 'sandbox', 'remembered');
assert.ok(!__db.push_subscription.some((x) => x.id === 'p3'), 'gone device removed');

// Next time the development device goes straight to the sandbox.
apple.length = 0;
await POST(new Request('https://gurubroker.app/api/fn/pushKey', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ann' }, body: JSON.stringify({ test: true }) }));
assert.deepEqual(apple.filter((a) => a.token === DEV).map((a) => a.env), ['sandbox']);
console.log('iPhone app notifications: all checks passed');
