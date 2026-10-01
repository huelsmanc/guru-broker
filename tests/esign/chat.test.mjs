// Messaging and calls: mention notifications go only to people who can see the message,
// and calls (Daily.co, faked here) ring, answer, decline and end correctly.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', DAILY_API_KEY: 'dk' });
const calls = [];
let roomN = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  if (url.includes('resend')) return new Response('{"id":"e"}');
  if (url.endsWith('/v1/rooms') && init.method === 'POST') { roomN += 1; return new Response(JSON.stringify({ name: `room${roomN}`, url: `https://guru.daily.co/room${roomN}` })); }
  if (url.endsWith('/v1/meeting-tokens')) return new Response(JSON.stringify({ token: `tok-${JSON.parse(init.body).properties.user_name}` }));
  if (url.includes('/v1/rooms/') && init.method === 'DELETE') return new Response('{"deleted":true}');
  throw new Error('unexpected ' + url);
};
globalThis.__users = { admin: { id: 'u0', email: 'admin@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, bob: { id: 'u2', email: 'bob@x.com' }, cy: { id: 'u3', email: 'cy@x.com' } };
const now = new Date().toISOString();
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'admin@x.com', full_name: 'Ada Admin', role: 'admin', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'bob@x.com', full_name: 'Bob Buyer', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'cy@x.com', full_name: 'Cy Closer', role: 'user', brokerage_id: 'B1', extra: {} },
  ],
  channel: [{ id: 'c1', brokerage_id: 'B1', name: 'general', label: 'General', is_private: false, extra: {} }, { id: 'c2', brokerage_id: 'B1', name: 'leaders', label: 'Leaders', is_private: true, extra: {} }],
  channel_member: [{ id: 'cm1', brokerage_id: 'B1', channel_id: 'leaders', user_email: 'ann@x.com', extra: {} }],
  social_message: [
    { id: 'm1', brokerage_id: 'B1', channel: 'leaders', sender_email: 'ann@x.com', content: 'hey @Bob Buyer @Ada Admin', mentions: ['bob@x.com', 'admin@x.com'], created_date: now, extra: {} },
    { id: 'm2', brokerage_id: 'B1', channel: 'general', sender_email: 'ann@x.com', content: 'all hands @channel', mentions: ['channel'], created_date: now, extra: {} },
  ],
  group_chat: [{ id: 'g1', brokerage_id: 'B1', name: 'Deal team', members: [{ email: 'ann@x.com' }, { email: 'bob@x.com' }], extra: {} }],
};
const { POST } = await import('./fn.mjs');
const as = (tok) => async (name, body = {}) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const notes = () => globalThis.__db.notification || [];

// Mentions in a private channel: Bob isn't a member, so only the admin is notified.
let r = await as('bob')('chatNotify', { kind: 'channel', id: 'm1' });
assert.equal(r.status, 403, "can't trigger notifications for someone else's message");
r = await as('ann')('chatNotify', { kind: 'channel', id: 'm1' });
assert.equal(r.body.notified, 1, JSON.stringify(r.body));
assert.deepEqual(notes().map((n) => n.user_email), ['admin@x.com']);
assert.match(notes()[0].title, /mentioned you in #leaders/);
r = await as('ann')('chatNotify', { kind: 'channel', id: 'm1' });
assert.equal(r.body.notified, 0, 'only once per message');
r = await as('ann')('chatNotify', { kind: 'channel', id: 'm2' });
assert.equal(r.body.notified, 3, '@channel in a public channel notifies everyone else');
assert.ok(!calls.some((c) => c.url.includes('resend')), 'chat mentions are in-app only, no email spam');

// DM call: Ann calls Bob.
r = await as('ann')('callStart', { kind: 'dm', key: 'bob@x.com', video: false });
assert.equal(r.status, 200, JSON.stringify(r.body));
const c1 = r.body.call;
assert.equal(c1.status, 'ringing'); assert.equal(c1.kind, 'audio'); assert.equal(r.body.token, 'tok-Ann Agent');
assert.deepEqual(c1.invitees.map((i) => [i.email, i.status]), [['bob@x.com', 'ringing']]);
const roomReq = JSON.parse(calls.find((c) => c.url.endsWith('/v1/rooms')).init.body);
assert.equal(roomReq.privacy, 'private'); assert.equal(roomReq.properties.start_video_off, true);
assert.ok(globalThis.__db.direct_message.some((m) => m.content === `[call]${c1.id}|audio` && m.receiver_email === 'bob@x.com'), 'call card posted in the DM');
r = await as('cy')('callJoin', { callId: c1.id });
assert.equal(r.status, 403, 'outsiders cannot join a DM call');
r = await as('ann')('callStart', { kind: 'dm', key: 'bob@x.com' });
assert.equal(r.body.joined_existing, true, 'no duplicate call while one is ringing');
r = await as('bob')('callJoin', { callId: c1.id });
assert.equal(r.status, 200); assert.equal(r.body.call.status, 'active'); assert.equal(r.body.token, 'tok-Bob Buyer');
r = await as('bob')('callAction', { callId: c1.id, action: 'leave' });
assert.equal(r.body.call.status, 'active', 'still on while the caller is in');
r = await as('ann')('callAction', { callId: c1.id, action: 'leave' });
assert.equal(r.body.call.status, 'ended');
assert.ok(calls.some((c) => c.url.endsWith('/v1/rooms/room1') && c.init.method === 'DELETE'), 'room deleted when the call ends');
r = await as('bob')('callJoin', { callId: c1.id });
assert.equal(r.status, 410, 'ended calls cannot be joined');

// Group call declined by everyone = missed.
r = await as('ann')('callStart', { kind: 'group', key: 'g1', video: true });
const c2 = r.body.call;
assert.equal(c2.kind, 'video'); assert.deepEqual(c2.invitees.map((i) => i.email), ['bob@x.com']);
r = await as('cy')('callStart', { kind: 'group', key: 'g1' });
assert.equal(r.status, 403, 'only group members can call the group');
r = await as('bob')('callAction', { callId: c2.id, action: 'decline' });
assert.equal(r.body.call.status, 'missed');

// Channel huddle: anyone who can see the channel joins; private channel blocks others.
r = await as('bob')('callStart', { kind: 'channel', key: 'leaders' });
assert.equal(r.status, 403, 'not a member of the private channel');
r = await as('ann')('callStart', { kind: 'channel', key: 'general' });
const c3 = r.body.call;
assert.equal(c3.status, 'active');
assert.ok(globalThis.__db.social_message.some((m) => m.content === `[call]${c3.id}|audio` && m.channel === 'general'));
r = await as('cy')('callJoin', { callId: c3.id });
assert.equal(r.status, 200);
assert.ok(r.body.call.invitees.some((i) => i.email === 'cy@x.com' && i.status === 'joined'), 'joiners are tracked');
r = await as('ann')('callAction', { callId: c3.id, action: 'leave' });
assert.equal(r.body.call.status, 'active', 'huddle continues while someone is still in');
r = await as('cy')('callAction', { callId: c3.id, action: 'leave' });
assert.equal(r.body.call.status, 'ended');

// Unanswered call: caller cancels.
r = await as('bob')('callStart', { kind: 'dm', key: 'cy@x.com' });
r = await as('bob')('callAction', { callId: r.body.call.id, action: 'cancel' });
assert.equal(r.body.call.status, 'missed');

// No Daily key configured: a clear message.
delete process.env.DAILY_API_KEY;
r = await as('ann')('callStart', { kind: 'dm', key: 'cy@x.com' });
assert.equal(r.status, 400); assert.match(r.body.error, /DAILY_API_KEY/);

console.log('Messaging and calls: all checks passed');
