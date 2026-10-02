// Apple push notifications for the iPhone app (devices saved as endpoint "apns:<token>").
// Uses Apple's token-based auth: a .p8 key from the Apple Developer account, set in Vercel as
//   APNS_KEY (the .p8 file's contents), APNS_KEY_ID, APNS_TEAM_ID, and APNS_BUNDLE_ID (the app's id).
// Development builds from Xcode use Apple's sandbox; App Store / TestFlight builds use production.
// We try production first and fall back to the sandbox once per device, remembering which worked.
import http2 from 'node:http2';
import crypto from 'node:crypto';

const HOSTS = { production: 'https://api.push.apple.com', sandbox: 'https://api.sandbox.push.apple.com' };
const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const apnsConfigured = () => !!(process.env.APNS_KEY && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID);
export const bundleId = () => process.env.APNS_BUNDLE_ID || 'app.gurubroker.ios';

let jwtCache = { token: null, at: 0 };
/** Apple accepts the same signed token for up to an hour; we refresh every 50 minutes. */
export function apnsJwt(now = Date.now()) {
  if (jwtCache.token && now - jwtCache.at < 50 * 60 * 1000) return jwtCache.token;
  const key = String(process.env.APNS_KEY).replace(/\\n/g, '\n');
  const head = b64u(JSON.stringify({ alg: 'ES256', kid: process.env.APNS_KEY_ID }));
  const body = b64u(JSON.stringify({ iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: crypto.createPrivateKey(key), dsaEncoding: 'ieee-p1363' });
  jwtCache = { token: `${head}.${body}.${b64u(sig)}`, at: now };
  return jwtCache.token;
}

/** The notification as Apple wants it. Extra keys (url, kind) reach the app when it's tapped. */
export function apnsPayload({ title, body, url, kind, tag }) {
  return {
    aps: {
      alert: { title: String(title || 'Guru Broker').slice(0, 120), body: String(body || '').slice(0, 400) },
      sound: 'default',
      ...(tag ? { 'thread-id': String(tag).slice(0, 64) } : {}),
      ...(kind === 'call' ? { 'interruption-level': 'time-sensitive' } : {}),
    },
    url: url || '/Dashboard',
    kind: kind || 'update',
  };
}

// One HTTP/2 connection per host, reused while this server instance is warm.
const sessions = {};
function session(env) {
  const s = sessions[env];
  if (s && !s.closed && !s.destroyed) return s;
  const fresh = http2.connect(HOSTS[env]);
  fresh.on('error', () => { delete sessions[env]; });
  fresh.on('goaway', () => { delete sessions[env]; });
  fresh.setTimeout(60_000, () => fresh.close());
  sessions[env] = fresh;
  return fresh;
}

/** Low-level send; overridable in tests. Resolves { status, reason }. */
export let apnsRequest = (env, token, headers, body) => new Promise((resolve) => {
  try {
    const req = session(env).request({ ':method': 'POST', ':path': `/3/device/${token}`, ...headers });
    let status = 0; let data = '';
    req.setTimeout(10_000, () => { req.close(); resolve({ status: 0, reason: 'timeout' }); });
    req.on('response', (h) => { status = h[':status']; });
    req.on('data', (c) => { data += c; });
    req.on('end', () => { let reason = ''; try { reason = JSON.parse(data || '{}').reason || ''; } catch { /* empty */ } resolve({ status, reason }); });
    req.on('error', (e) => resolve({ status: 0, reason: e.message }));
    req.end(body);
  } catch (e) { resolve({ status: 0, reason: e.message }); }
});
export const setApnsRequest = (fn) => { apnsRequest = fn; };

/**
 * Sends to one saved device. Returns { result: 'ok'|'gone'|'error', env } where env is the
 * Apple environment that accepted it (so it can be remembered on the device row).
 */
export async function sendApns(sub, data) {
  if (!apnsConfigured()) return { result: 'error', reason: 'not configured' };
  const token = String(sub.endpoint || '').replace(/^apns:/, '');
  if (!/^[0-9a-f]{32,200}$/i.test(token)) return { result: 'gone' };
  const headers = {
    authorization: `bearer ${apnsJwt()}`,
    'apns-topic': bundleId(),
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
    ...(data.tag ? { 'apns-collapse-id': String(data.tag).slice(0, 64) } : {}),
    'content-type': 'application/json',
  };
  const body = JSON.stringify(apnsPayload(data));
  const known = sub.apns_env || sub.extra?.apns_env;
  const order = known === 'sandbox' ? ['sandbox', 'production'] : ['production', 'sandbox'];
  for (const env of order) {
    const r = await (globalThis.__apnsRequest || apnsRequest)(env, token, headers, body); // tests can stand in for Apple
    if (r.status === 200) return { result: 'ok', env };
    if (r.status === 410 || r.reason === 'Unregistered') return { result: 'gone' };
    // A development device token sent to production (or the reverse) answers BadDeviceToken: try the other.
    if (r.status === 400 && r.reason === 'BadDeviceToken') continue;
    return { result: 'error', reason: r.reason || String(r.status) };
  }
  return { result: 'gone' };
}
