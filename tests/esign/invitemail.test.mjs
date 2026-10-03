// Invites go out as Guru Broker's own email (from gurubroker.app through Resend) with the team's
// name, a plain-text copy and a working Supabase link; people who already have a login get a
// sign-in link instead.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', APP_URL: 'https://gurubroker.app', RESEND_API_KEY: 're_test', EMAIL_FROM: 'Guru Broker <noreply@gurubroker.app>' });
const sent = [];
globalThis.fetch = async (url, o) => { if (String(url).startsWith('https://api.resend.com')) { sent.push(JSON.parse(o.body)); return new Response(JSON.stringify({ id: 'e1' })); } throw new Error('unexpected ' + url); };
globalThis.__users = { cody: { id: 'u0', email: 'cody@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'cody@x.com', full_name: 'Cody Huelsman', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u5', email: 'old@x.com', full_name: 'Olly Old', role: 'agent', brokerage_id: null, extra: {} },
  ],
  brokerage: [{ id: 'B1', name: 'mygoodagent', extra: {} }],
};
const { POST } = await import('./fn.mjs');
const call = (body) => POST(new Request('https://gurubroker.app/api/fn/inviteUser', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer cody' }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));

let r = await call({ email: 'Jake@X.com', role: 'agent' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(sent.length, 1);
const m = sent[0];
assert.deepEqual(m.to, ['jake@x.com']);
assert.equal(m.from, 'mygoodagent <noreply@gurubroker.app>');
assert.equal(m.subject, 'Cody Huelsman invited you to join mygoodagent');
assert.match(m.html, /Set up my account/); assert.match(m.html, /https:\/\/sb\/auth\/v1\/verify\?token=t-jake@x.com&amp;type=invite/);
assert.match(m.text, /Set up my account: https:\/\/sb\/auth\/v1\/verify/, 'plain-text copy');
assert.match(decodeURIComponent(m.text), /redirect_to=https:\/\/gurubroker.app\/reset-password\?welcome=1/);
const jake = __db.profiles.find((p) => p.email === 'jake@x.com');
assert.equal(jake.brokerage_id, 'B1'); assert.equal(jake.role, 'agent');
assert.ok(!globalThis.__invites?.length, 'Supabase email not used');

// Already has a login: placed on the team and sent a sign-in link.
r = await call({ email: 'old@x.com', role: 'agent' });
assert.equal(r.body.already_registered, true);
assert.equal(sent[1].subject, "You've been added to mygoodagent on Guru Broker");
assert.match(sent[1].html, /type=magiclink/);
assert.equal(__db.profiles.find((p) => p.email === 'old@x.com').brokerage_id, 'B1');
console.log('invite emails: all checks passed');
