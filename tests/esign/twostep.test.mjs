// 2-step sign-in: admins can't use server routes until they confirm; emailed codes, trusted
// devices, authenticator (aal2) sign-ins, opting in, and an admin resetting a lost phone.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', RESEND_API_KEY: 're' });
const mails = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.includes('resend')) { mails.push(JSON.parse(init.body)); return new Response(JSON.stringify({ id: 'm1' })); }
  throw new Error('unexpected ' + url);
};
const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.s`;
const T = {
  boss1: jwt({ sub: 'u3', session_id: 'S1', aal: 'aal1' }),
  boss2: jwt({ sub: 'u3', session_id: 'S2', aal: 'aal1' }),
  bossTotp: jwt({ sub: 'u3', session_id: 'S3', aal: 'aal2' }),
  ann: jwt({ sub: 'u1', session_id: 'S9', aal: 'aal1' }),
  eve: jwt({ sub: 'u9', session_id: 'S8', aal: 'aal2' }),
};
globalThis.__users = {
  [T.boss1]: { id: 'u3', email: 'boss@x.com' }, [T.boss2]: { id: 'u3', email: 'boss@x.com' }, [T.bossTotp]: { id: 'u3', email: 'boss@x.com' },
  [T.ann]: { id: 'u1', email: 'ann@x.com' }, [T.eve]: { id: 'u9', email: 'eve@other.com' },
};
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@other.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  brokerage_settings: [{ id: 'bs1', brokerage_id: 'B1', extra: {}, created_date: '2026-01-01' }],
};
globalThis.__factors = { u1: ['f1'] };
const { POST } = await import('./fn.mjs');
const call = (tok, name, body = {}, ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120 Safari/537') => POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}`, 'user-agent': ua }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const two = (tok, body) => call(tok, 'twoStep', body);

// Owner signed in with a password only: told to confirm, and other routes refuse.
let r = await two(T.boss1, { action: 'status' });
assert.deepEqual([r.status, r.body.needed, r.body.ok], [200, true, false]);
assert.equal(r.body.email, 'b•••@x.com', 'email is masked');
r = await call(T.boss1, 'myDay', {});
assert.equal(r.status, 401, 'routes refuse until confirmed: ' + JSON.stringify(r.body));
r = await two(T.boss1, { action: 'devices' });
assert.equal(r.status, 401);

// Email code.
r = await two(T.boss1, { action: 'email_send' });
assert.equal(r.status, 200);
assert.equal(mails.length, 1);
const code = mails[0].subject.match(/(\d{6})/)[1];
assert.equal(globalThis.__db.second_step_code[0].code_hash.includes(code), false, 'only a hash is stored');
r = await two(T.boss1, { action: 'email_send' });
assert.equal(mails.length, 1, 'at most one email a minute');
r = await two(T.boss1, { action: 'email_verify', code: code === '000000' ? '111111' : '000000' });
assert.equal(r.status, 400);
r = await two(T.boss1, { action: 'email_verify', code, remember: true });
assert.equal(r.status, 200, JSON.stringify(r.body));
const device = r.body.device_token;
assert.ok(device && device.length >= 32);
assert.ok(!JSON.stringify(globalThis.__db.trusted_device).includes(device), 'device token stored hashed');
r = await two(T.boss1, { action: 'status' });
assert.equal(r.body.ok, true, 'this sign-in is confirmed');
r = await two(T.boss1, { action: 'email_verify', code });
assert.equal(r.status, 400, 'a code works once');

// Another sign-in (new device) still needs its own step, unless it's a trusted device.
r = await two(T.boss2, { action: 'status' });
assert.equal(r.body.ok, false);
r = await two(T.boss2, { action: 'status', device: 'x'.repeat(64) });
assert.equal(r.body.ok, false, 'a made-up device token does nothing');
r = await two(T.boss2, { action: 'status', device });
assert.deepEqual([r.body.ok, r.body.via], [true, 'device']);
r = await two(T.boss2, { action: 'devices' });
assert.equal(r.body.devices.length, 1);
assert.equal(r.body.devices[0].label, 'Chrome on Mac');

// Too many wrong codes.
r = await two(T.ann, { action: 'status' });
assert.deepEqual([r.body.needed, r.body.ok], [false, true], 'agents are not required by default');
globalThis.__db.second_step_code.push({ user_id: 'u1', code_hash: 'nope', sent_at: new Date().toISOString(), attempts: 5 });
r = await two(T.ann, { action: 'email_verify', code: '123456' });
assert.equal(r.status, 429);
globalThis.__db.second_step_code = globalThis.__db.second_step_code.filter((c) => c.user_id !== 'u1');

// Authenticator: an aal2 sign-in is confirmed; totp_done only for aal2.
r = await two(T.bossTotp, { action: 'status' });
assert.equal(r.body.ok, true);
r = await call(T.bossTotp, 'myDay', {});
assert.notEqual(r.status, 401);
r = await two(T.ann, { action: 'totp_done' });
assert.equal(r.status, 400);
r = await two(T.bossTotp, { action: 'totp_done', remember: true });
assert.ok(r.body.device_token);

// Opting in, and the brokerage-wide rule.
r = await two(T.ann, { action: 'set_mine', enabled: true });
assert.equal(r.status, 200);
assert.equal(globalThis.__db.profiles[0].extra.mfa_enabled, true);
r = await two(T.ann, { action: 'status' });
assert.deepEqual([r.body.needed, r.body.ok, r.body.mine], [true, true, true], 'turning it on keeps the current sign-in');
globalThis.__db.profiles[0].extra = {};
globalThis.__db.second_step_session = globalThis.__db.second_step_session.filter((s) => s.user_id !== 'u1');
globalThis.__db.brokerage_settings[0].extra.require_2fa_all = true;
r = await two(T.ann, { action: 'status' });
assert.deepEqual([r.body.needed, r.body.ok], [true, false], 'brokerage rule');
r = await two(T.ann, { action: 'set_mine', enabled: false });
assert.equal(r.status, 401, 'cannot change settings before confirming');

// Reset someone's 2-step (lost phone): admin of the same brokerage only.
r = await two(T.eve, { action: 'reset_user', user_id: 'u1' });
assert.equal(r.status, 403, 'other brokerage');
r = await two(T.boss2, { action: 'reset_user', user_id: 'u1' });
assert.deepEqual([r.status, r.body.removed_factors], [200, 1]);
assert.deepEqual(globalThis.__factors.u1, []);
r = await two(T.boss2, { action: 'forget_devices' });
assert.equal(globalThis.__db.trusted_device.filter((d) => d.user_id === 'u3').length, 0);

console.log('two-step tests passed');
