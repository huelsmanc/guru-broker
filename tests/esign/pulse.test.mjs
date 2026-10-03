// Agent pulse: drifting agents are flagged from app use, deals versus their usual pace, unfinished
// training, overdue onboarding and Follow Up Boss lead activity; admins only; check-ins quiet alerts;
// the weekly job alerts admins; the app's daily ping records activity.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => { throw new Error('unexpected ' + url); };
const ago = (d) => new Date(Date.now() - d * 864e5).toISOString();
globalThis.__users = { cody: { id: 'u0', email: 'cody@x.com' }, ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__authUsers = [{ id: 'u2', email: 'bob@x.com', last_sign_in_at: ago(40) }, { id: 'u1', email: 'ann@x.com', last_sign_in_at: ago(1) }];
const deal = (email, d) => ({ id: `t${Math.random()}`, brokerage_id: 'B1', agent_email: email, created_date: ago(d), extra: {} });
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'cody@x.com', full_name: 'Cody Huelsman', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', start_date: ago(400).slice(0, 10), extra: {} },
    { id: 'u2', email: 'bob@x.com', full_name: 'Bob Slowing', role: 'agent', brokerage_id: 'B1', start_date: ago(500).slice(0, 10), extra: {} },
    { id: 'u3', email: 'new@x.com', full_name: 'Nia New', role: 'agent', brokerage_id: 'B1', start_date: ago(20).slice(0, 10), extra: {} },
    { id: 'u4', email: 'gone@x.com', full_name: 'Gone Guy', role: 'agent', brokerage_id: 'B1', suspended: true, extra: {} },
  ],
  transaction: [deal('ann@x.com', 10), deal('ann@x.com', 40), deal('ann@x.com', 120), deal('bob@x.com', 100), deal('bob@x.com', 150), deal('bob@x.com', 200), deal('bob@x.com', 250)],
  compliance_training: [{ id: 'tr1', brokerage_id: 'B1', title: 'Fair Housing 2026', created_date: ago(60) }, { id: 'tr2', brokerage_id: 'B1', title: 'New this week', created_date: ago(3) }],
  compliance_attempt: [{ id: 'a1', brokerage_id: 'B1', agent_email: 'ann@x.com', training_id: 'tr1', passed: true }],
  checklist: [{ id: 'cl1', brokerage_id: 'B1', subject_type: 'onboarding', subject_email: 'bob@x.com', items: [{ id: 'i1', title: 'W-9', due_date: ago(5).slice(0, 10), status: 'open' }], extra: {} }],
  brokerage: [{ id: 'B1', name: 'mygoodagent', extra: {} }],
  app_secret: [], notification: [],
};
const { POST } = await import('./fn.mjs');
const call = async (tok, body, headers = {}) => { const r = await POST(new Request('https://gurubroker.app/api/fn/agentPulse', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

assert.equal((await call('ann', { action: 'list' })).status, 403, 'agents never see it');
let r = await call('cody', { action: 'list' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const by = Object.fromEntries(r.body.agents.map((a) => [a.email, a]));
assert.ok(!by['gone@x.com'] && !by['cody@x.com'], 'suspended agents and admins are left out');
const bob = by['bob@x.com'];
assert.equal(bob.level, 'at_risk');
assert.deepEqual(bob.signals.map((s) => s.key).sort(), ['deals', 'idle', 'onboarding', 'training']);
assert.match(bob.signals.find((s) => s.key === 'idle').text, /in 40 days/);
assert.match(bob.signals.find((s) => s.key === 'deals').text, /No new deals in 90 days \(4 in the 9 months before\)/);
assert.match(bob.signals.find((s) => s.key === 'training').text, /Fair Housing 2026/);
assert.equal(by['ann@x.com'].level, 'steady'); assert.equal(by['ann@x.com'].signals.length, 0);
assert.equal(by['new@x.com'].signals.length, 0, 'brand-new agents are not judged on deals or training');
assert.equal(r.body.agents[0].email, 'bob@x.com', 'most at risk first');

// The app's daily ping counts as being active.
await call('ann', { action: 'ping' });
assert.ok(__db.profiles.find((p) => p.email === 'ann@x.com').extra.last_active_at || __db.profiles.find((p) => p.email === 'ann@x.com').last_active_at);

// Weekly job alerts admins, and a check-in keeps that agent out of the next alert.
r = await call(null, { scan: true }, { 'x-gbh-service': 'hs' });
assert.equal(r.body.alerted, 1);
const n = __db.notification.find((x) => x.user_email === 'cody@x.com');
assert.match(n.title, /1 agent may be drifting/); assert.match(n.description, /Bob/); assert.equal(n.action_url, '/AgentPulse');
assert.ok(!__db.notification.some((x) => x.user_email === 'ann@x.com'), 'agents are not told');
assert.equal((await call(null, { scan: true })).status, 403, 'only the scheduled job can scan');
r = await call('cody', { action: 'check_in', email: 'bob@x.com', note: 'Coffee Tuesday, he is busy with family' });
assert.equal(r.status, 200);
__db.notification.length = 0;
r = await call(null, { scan: true }, { 'x-gbh-service': 'hs' });
assert.equal(r.body.alerted, 0, 'checked in: no alert for 30 days');
r = await call('cody', { action: 'list' });
assert.equal(r.body.agents.find((a) => a.email === 'bob@x.com').checkin.note, 'Coffee Tuesday, he is busy with family');
console.log('agent pulse: all checks passed');
