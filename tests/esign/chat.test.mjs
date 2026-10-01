// Messaging and calls: mention notifications go only to people who can see the message,
// and calls (Daily.co, faked here) ring, answer, decline and end correctly.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', DAILY_API_KEY: 'dk', ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'anthropic' });
const calls = [];
let roomN = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url); calls.push({ url, init });
  if (url.includes('resend')) return new Response('{"id":"e"}');
  if (url.endsWith('/v1/rooms') && init.method === 'POST') { roomN += 1; return new Response(JSON.stringify({ name: `room${roomN}`, url: `https://guru.daily.co/room${roomN}` })); }
  if (url.endsWith('/v1/meeting-tokens')) return new Response(JSON.stringify({ token: `tok-${JSON.parse(init.body).properties.user_name}` }));
  if (url.includes('/v1/rooms/') && init.method === 'DELETE') return new Response('{"deleted":true}');
  if (url.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: { tldr: 'Team planning the open house.', for_me: ['Ann asked you to bring signs'], decisions: ['Open house Sat 1-3'], action_items: [{ who: 'Bob', what: 'Order flyers' }] } }] }));
  if (url.startsWith('https://push.example/')) return new Response('', { status: url.endsWith('gone') ? 410 : 201 });
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

// Deal chat: created on first open with the deal's people; follows TC/co-agent changes; admins join as guests.
process.env.DAILY_API_KEY = 'dk';
globalThis.__db.transaction = [{ id: 't1', brokerage_id: 'B1', property_address: '12 Elm St, Hartford, CT 06101', agent_email: 'ann@x.com', tc_email: 'bob@x.com', co_agents: [], extra: {} }];
r = await as('ann')('dealChat', { transactionId: 't1' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const g = r.body.group;
assert.equal(g.transaction_id, 't1'); assert.equal(g.name, '🏠 12 Elm St');
assert.deepEqual(g.members.map((m) => m.email).sort(), ['ann@x.com', 'bob@x.com']);
r = await as('ann')('dealChat', { transactionId: 't1' });
assert.equal(r.body.group.id, g.id, 'one chat per deal');
const svcCall = async (name, body) => { const res = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: JSON.stringify(body) })); return { status: res.status, body: await res.json() }; };
const t1 = globalThis.__db.transaction[0];
t1.tc_email = 'cy@x.com'; t1.co_agents = [];
await svcCall('dealChatSync', { event: { data: { ...t1 } } });
assert.deepEqual(globalThis.__db.group_chat.find((x) => x.id === g.id).members.map((m) => m.email).sort(), ['ann@x.com', 'cy@x.com'], 'new TC in, old TC out');
r = await as('admin')('dealChat', { transactionId: 't1' });
const ms = r.body.group.members;
assert.ok(ms.some((m) => m.email === 'admin@x.com' && m.added_as === 'guest'), 'admin joins as guest');
await svcCall('dealChatSync', { event: { data: { ...t1, co_agents: [{ email: 'bob@x.com' }] } } });
assert.deepEqual(globalThis.__db.group_chat.find((x) => x.id === g.id).members.map((m) => m.email).sort(), ['admin@x.com', 'ann@x.com', 'bob@x.com', 'cy@x.com'], 'guest stays, co-agent added');
r = await as('ann')('callStart', { kind: 'group', key: g.id });
assert.equal(r.status, 200, 'deal chats can call too');

// Push: a new DM reaches the receiver's phone; dead subscriptions are cleaned up; calls ring phones.
const { makeVapidKeys } = await import('../../../server/lib/push.js');
const vk = makeVapidKeys(); process.env.VAPID_PUBLIC_KEY = vk.publicKey; process.env.VAPID_PRIVATE_KEY = vk.privateKey;
const crypto = await import('node:crypto');
const ua = crypto.createECDH('prime256v1'); const keys = { p256dh: ua.generateKeys().toString('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
globalThis.__db.push_subscription = [
  { id: 'ps1', user_email: 'bob@x.com', endpoint: 'https://push.example/bob', ...keys, extra: {} },
  { id: 'ps2', user_email: 'bob@x.com', endpoint: 'https://push.example/gone', ...keys, extra: {} },
  { id: 'ps3', user_email: 'cy@x.com', endpoint: 'https://push.example/cy', ...keys, extra: {} },
];
const svc2 = async (name, body) => { const res = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: JSON.stringify(body) })); return { status: res.status, body: await res.json() }; };
r = await svc2('pushOnMessage', { event: { type: 'create', entity_name: 'DirectMessage', data: { id: 'dmx', sender_email: 'ann@x.com', sender_name: 'Ann Agent', receiver_email: 'bob@x.com', content: 'Lunch?' } } });
assert.equal(r.body.sent, 1, JSON.stringify(r.body));
const pushCall = calls.find((c) => c.url === 'https://push.example/bob');
assert.equal(pushCall.init.headers['Content-Encoding'], 'aes128gcm'); assert.match(pushCall.init.headers.Authorization, /^vapid t=.+, k=/);
assert.ok(!globalThis.__db.push_subscription.some((x) => x.id === 'ps2'), 'expired subscription removed');
r = await svc2('pushOnMessage', { event: { type: 'create', entity_name: 'GroupMessage', data: { id: 'gmx', group_id: 'g1', sender_email: 'ann@x.com', sender_name: 'Ann Agent', content: 'hi team' } } });
assert.equal(r.body.sent, 1, 'group members except the sender');
const before = calls.filter((c) => c.url === 'https://push.example/cy').length;
r = await as('ann')('callStart', { kind: 'dm', key: 'cy@x.com', video: true });
assert.equal(r.status, 200, JSON.stringify(r.body));
const ring = calls.filter((c) => c.url === 'https://push.example/cy');
assert.equal(ring.length, before + 1, 'incoming call rings the phone');
assert.equal(ring.at(-1).init.headers.Urgency, 'high');

// Catch me up: summarizes only what's new since last read; nothing new -> no AI call.
const old = new Date(Date.now() - 3 * 3600e3).toISOString();
globalThis.__db.social_message.push(
  { id: 'n1', brokerage_id: 'B1', channel: 'general', sender_email: 'bob@x.com', sender_name: 'Bob Buyer', content: 'Open house Sat 1-3?', mentions: [], created_date: new Date().toISOString(), extra: {} },
  { id: 'n2', brokerage_id: 'B1', channel: 'general', sender_email: 'admin@x.com', sender_name: 'Ada Admin', content: '@Cy Closer bring the signs', mentions: ['cy@x.com'], created_date: new Date().toISOString(), extra: {} },
);
const aiBefore = calls.filter((c) => c.url.includes('anthropic')).length;
r = await as('cy')('chatCatchUp', { kind: 'channel', key: 'general', since: old });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.summary.tldr, 'Team planning the open house.');
const aiReq = JSON.parse(calls.filter((c) => c.url.includes('anthropic')).at(-1).init.body);
assert.match(JSON.stringify(aiReq.messages), /Bob Buyer: Open house Sat 1-3/);
r = await as('cy')('chatCatchUp', { kind: 'channel', key: 'general', since: new Date().toISOString() });
assert.equal(r.body.summary, null);
assert.equal(calls.filter((c) => c.url.includes('anthropic')).length, aiBefore + 1, 'no AI call when nothing is new');

// Morning digest: Cy has an unread @mention from over an hour ago; Bob turned the digest off.
globalThis.__db.social_message.push({ id: 'n3', brokerage_id: 'B1', channel: 'general', sender_email: 'admin@x.com', sender_name: 'Ada Admin', content: '@Cy Closer call the lender', mentions: ['cy@x.com'], created_date: new Date(Date.now() - 2 * 3600e3).toISOString(), extra: {} });
globalThis.__db.direct_message.push({ id: 'dd1', brokerage_id: 'B1', sender_email: 'ann@x.com', sender_name: 'Ann Agent', receiver_email: 'bob@x.com', content: 'ping', read: false, created_date: new Date(Date.now() - 2 * 3600e3).toISOString(), extra: {} });
globalThis.__db.profiles.find((p) => p.email === 'bob@x.com').extra.notify_prefs = { daily_digest: false };
const emailsBefore = calls.filter((c) => c.url.includes('resend')).length;
r = await svc2('chatDigest', {});
assert.equal(r.status, 200, JSON.stringify(r.body));
const digests = calls.filter((c) => c.url.includes('resend')).slice(emailsBefore).map((c) => JSON.parse(c.init.body));
assert.ok(digests.some((d) => d.to[0] === 'cy@x.com' && /call the lender/.test(d.html)), 'Cy gets a digest');
assert.ok(!digests.some((d) => d.to[0] === 'bob@x.com'), 'Bob opted out');
r = await as('ann')('chatDigest', {});
assert.equal(r.status, 403, 'digest is scheduled-only');

console.log('Messaging and calls: all checks passed');
