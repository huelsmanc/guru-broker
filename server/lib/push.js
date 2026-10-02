// Web Push (phone and desktop notifications even when the app is closed), using only
// Node's crypto: RFC 8291 message encryption (aes128gcm) and RFC 8292 VAPID signing.
// Keys are created automatically the first time they're needed and kept in the
// server-only app_secret table. Setting VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY overrides that.
import crypto from 'node:crypto';
import { sendApns } from './apns.js';

const b64u = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

export const pushConfigured = () => true;

let cachedKeys = null;
/** The app's push key pair: from Vercel settings if set, otherwise made once and stored. */
export async function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  if (cachedKeys) return cachedKeys;
  const { adminClient } = await import('./base44.js'); // loaded lazily so key helpers work standalone
  const db = adminClient();
  const read = async () => (await db.from('app_secret').select('value').eq('name', 'vapid').maybeSingle()).data?.value;
  const have = await read();
  if (have?.publicKey && have?.privateKey) return (cachedKeys = have);
  const made = makeVapidKeys();
  const { error } = await db.from('app_secret').insert({ name: 'vapid', value: made });
  if (error) { // another request made them at the same moment: use theirs
    const again = await read();
    if (again?.publicKey) return (cachedKeys = again);
    throw new Error(`Could not save push keys: ${error.message}`);
  }
  return (cachedKeys = made);
}

export function makeVapidKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = privateKey.export({ format: 'jwk' });
  const pub = publicKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), unb64u(pub.x), unb64u(pub.y)])), privateKey: jwk.d };
}

function vapidKey(publicKeyB64, privateKeyB64) {
  const pub = unb64u(publicKeyB64);
  return crypto.createPrivateKey({ key: { kty: 'EC', crv: 'P-256', d: privateKeyB64, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk' });
}

export function vapidHeader(endpoint, { publicKey, privateKey, subject = process.env.VAPID_SUBJECT || `mailto:${process.env.SUPPORT_EMAIL || 'support@gurubroker.app'}` } = {}) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), { key: vapidKey(publicKey, privateKey), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${publicKey}`;
}

/** Encrypts a payload for one browser subscription ({ p256dh, auth } from the browser). */
export function encrypt(payload, { p256dh, auth }) {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);
  const ecdh = crypto.createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const secret = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, secret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** Sends to one subscription. Returns 'ok', 'gone' (delete it) or 'error'. */
export async function sendOne(sub, data, { ttl = 3600, urgency = 'normal', keys } = {}) {
  try {
    const k = keys || (await vapidKeys());
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(ttl), Urgency: urgency, Authorization: vapidHeader(sub.endpoint, k) },
      body: encrypt(JSON.stringify(data), sub),
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

const PREF = { message: 'push_messages', mention: 'push_mentions', call: 'push_calls' };

/** Push to everyone listed (by email). data: { title, body, url, tag, kind }. Respects each person's settings. */
export async function pushTo(entities, emails, data, opts = {}) {
  if (!pushConfigured() || !emails?.length) return 0;
  let list = [...new Set(emails.map((e) => String(e || '').toLowerCase()).filter(Boolean))];
  const pref = PREF[data.kind] || 'push_updates';
  const people = await entities.User.filter({ email: { $in: list } }, '-created_date', 500).catch(() => []);
  const off = new Set(people.filter((u) => u.notify_prefs && u.notify_prefs[pref] === false).map((u) => String(u.email).toLowerCase()));
  list = list.filter((e) => !off.has(e));
  if (!list.length) return 0;
  const subs = await entities.PushSubscription.filter({ user_email: { $in: list } }, '-created_date', 500);
  if (!subs.length) return 0;
  // Browsers use Web Push; the iPhone app ("apns:" devices) uses Apple's push service.
  const web = subs.filter((s) => !String(s.endpoint || '').startsWith('apns:'));
  const apple = subs.filter((s) => String(s.endpoint || '').startsWith('apns:'));
  const keys = web.length ? await vapidKeys() : null;
  let sent = 0;
  await Promise.all([
    ...web.map(async (s) => {
      const r = await sendOne(s, data, { ...opts, keys });
      if (r === 'ok') sent += 1;
      if (r === 'gone') await entities.PushSubscription.delete(s.id).catch(() => {});
    }),
    ...apple.map(async (s) => {
      const r = await sendApns(s, data);
      if (r.result === 'ok') {
        sent += 1;
        if (r.env && r.env !== (s.apns_env || s.extra?.apns_env)) await entities.PushSubscription.update(s.id, { apns_env: r.env }).catch(() => {});
      }
      if (r.result === 'gone') await entities.PushSubscription.delete(s.id).catch(() => {});
    }),
  ]);
  return sent;
}
