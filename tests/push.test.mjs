import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { makeVapidKeys, encrypt, vapidHeader } from '../server/lib/push.js';
const b64u = (b) => Buffer.from(b).toString('base64url');
// Pretend to be the browser.
const ua = crypto.createECDH('prime256v1'); const uaPub = ua.generateKeys(); const auth = crypto.randomBytes(16);
const sub = { p256dh: b64u(uaPub), auth: b64u(auth) };
const msg = JSON.stringify({ title: 'Ann', body: 'Are we still on for 3?' });
const enc = encrypt(msg, sub);
// Decrypt as the browser would (RFC 8291/8188).
const salt = enc.subarray(0, 16); const rs = enc.readUInt32BE(16); const idlen = enc[20]; const asPub = enc.subarray(21, 21 + idlen); const ct = enc.subarray(21 + idlen);
assert.equal(rs, 4096); assert.equal(idlen, 65);
const h = (k, d) => crypto.createHmac('sha256', k).update(d).digest();
const secret = ua.computeSecret(asPub);
const ikm = h(h(auth, secret), Buffer.concat([Buffer.from('WebPush: info\0'), uaPub, asPub, Buffer.from([1])]));
const prk = h(salt, ikm);
const cek = h(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
const nonce = h(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
const d = crypto.createDecipheriv('aes-128-gcm', cek, nonce); d.setAuthTag(ct.subarray(ct.length - 16));
const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
assert.equal(plain[plain.length - 1], 2); assert.equal(plain.subarray(0, -1).toString(), msg);
// VAPID JWT verifies with the public key.
const k = makeVapidKeys();
const hdr = vapidHeader('https://fcm.googleapis.com/fcm/send/abc', { publicKey: k.publicKey, privateKey: k.privateKey, subject: 'mailto:a@b.c' });
const [, jwt, kk] = hdr.match(/^vapid t=([^,]+), k=(.+)$/);
assert.equal(kk, k.publicKey);
const [hd, bd, sg] = jwt.split('.');
const pub = Buffer.from(k.publicKey, 'base64url');
const key = crypto.createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) }, format: 'jwk' });
assert.ok(crypto.verify('sha256', Buffer.from(`${hd}.${bd}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(sg, 'base64url')));
const claims = JSON.parse(Buffer.from(bd, 'base64url'));
assert.equal(claims.aud, 'https://fcm.googleapis.com'); assert.equal(claims.sub, 'mailto:a@b.c');
console.log('web push crypto: all checks passed');
