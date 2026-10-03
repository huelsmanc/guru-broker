// Shout-outs: saved for the team, and the person who got it gets an alert (anonymous ones don't
// say who sent it). Only teammates; not yourself.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => { throw new Error('unexpected ' + url); };
globalThis.__users = { jake: { id: 'u1', email: 'jake@x.com' }, cody: { id: 'u0', email: 'cody@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'cody@x.com', full_name: 'Cody Huelsman', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'jake@x.com', full_name: 'jake@x.com', display_name: 'Jake Woodward', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'zed@y.com', full_name: 'Zed Other', role: 'agent', brokerage_id: 'B2', extra: {} },
  ],
  recognition: [], notification: [],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/giveShoutout', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));

let r = await call('jake', { to_email: 'Cody@x.com', message: 'Thanks for the help today!', category: 'teamwork' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const rec = __db.recognition[0];
assert.equal(rec.to_email, 'cody@x.com'); assert.equal(rec.from_name, 'Jake Woodward'); assert.equal(rec.to_name, 'Cody Huelsman');
const n = __db.notification.find((x) => x.user_email === 'cody@x.com');
assert.ok(n, 'Cody is told');
assert.equal(n.title, 'Jake Woodward gave you a shout-out 🎉');
assert.equal(n.action_url, '/Culture?tab=recognition');

r = await call('jake', { to_email: 'cody@x.com', message: 'Secret thanks', is_anonymous: true });
assert.equal(r.status, 200);
assert.ok(__db.notification.some((x) => x.title === 'Someone on your team gave you a shout-out 🎉'));
assert.ok(!__db.notification.some((x) => x.title.includes('Jake') && x.description === 'Secret thanks'), 'anonymous stays anonymous');
const anonRec = __db.recognition.find((x) => x.message === 'Secret thanks');
assert.equal(anonRec.from_email, ''); assert.equal(anonRec.from_name, 'Someone'); assert.ok(!anonRec.created_by, 'not stamped with the giver');
assert.ok(!JSON.stringify(anonRec).includes('jake@'), 'the giver is sealed');

assert.equal((await call('jake', { to_email: 'zed@y.com', message: 'hi' })).status, 400, 'teammates only');
assert.equal((await call('jake', { to_email: 'jake@x.com', message: 'me' })).status, 400, 'not yourself');
assert.equal((await call('jake', { to_email: 'cody@x.com', message: '  ' })).status, 400, 'needs a message');
assert.equal(__db.recognition.length, 2);
console.log('shout-outs: all checks passed');
