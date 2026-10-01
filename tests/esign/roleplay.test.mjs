// Voice role-play: the character's private brief never reaches the browser; calls are graded and
// saved to the agent; nobody else can finish someone's call.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', OPENAI_API_KEY: 'sk-oa', ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'anthropic' });
const sent = [];
let secretFailures = 0;
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = init.body ? JSON.parse(init.body) : null; sent.push({ url, body, headers: init.headers });
  if (url.includes('/realtime/client_secrets')) {
    if (secretFailures-- > 0) return new Response(JSON.stringify({ error: { message: 'Invalid model' } }), { status: 400 });
    return new Response(JSON.stringify({ value: 'ek_test', expires_at: 1 }));
  }
  if (url.includes('anthropic')) return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: {
    score: 74, outcome: 'partial', headline: 'Good discovery, soft close.', motivation_uncovered: true, asked_for_goal: false,
    categories: { rapport: 8, discovery: 8, objection_handling: 7, value: 6, closing: 4 }, strengths: ['Asked why it did not sell'], moments: [{ quote: 'so yeah', issue: 'No ask', try_instead: 'Can I come by Thursday at 4?' }], next_drill: 'Close for the appointment twice.' } }] }));
  throw new Error('unexpected ' + url);
};
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' }, bob: { id: 'u2', email: 'bob@x.com' } };
globalThis.__db = { profiles: [
  { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} },
  { id: 'u2', email: 'bob@x.com', full_name: 'Bob', role: 'user', brokerage_id: 'B1', extra: {} },
] };
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/salesRoleplay', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));

let r = await call('ann', { action: 'scenarios' });
assert.equal(r.status, 200);
assert.ok(r.body.scenarios.length >= 6);
assert.ok(!JSON.stringify(r.body).includes('Hidden motivation'), 'hidden motivations stay on the server');
assert.ok(!JSON.stringify(r.body).includes('Charlotte'));

secretFailures = 1; // first model name rejected -> falls back to the next
r = await call('ann', { action: 'start', scenario: 'expired', difficulty: 'tough' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.client_secret, 'ek_test');
assert.ok(!JSON.stringify(r.body).includes('Charlotte'), 'brief not sent to the browser');
const mints = sent.filter((x) => x.url.includes('client_secrets'));
assert.equal(mints.length, 2, 'retried with another model');
const sess = mints[1].body.session;
assert.match(sess.instructions, /Charlotte/); assert.match(sess.instructions, /Tough/);
assert.equal(sess.type, 'realtime'); assert.equal(sess.audio.output.voice, 'coral');
assert.ok(sess.audio.input.transcription.model);
assert.equal(mints[1].headers.Authorization, 'Bearer sk-oa');
const id = r.body.session_id;
assert.equal(globalThis.__db.roleplay_session[0].status, 'live');

r = await call('bob', { action: 'finish', session_id: id, transcript: [] });
assert.equal(r.status, 404, "can't finish someone else's call");

const transcript = [
  { role: 'prospect', text: 'This is Linda.' },
  { role: 'agent', text: 'Hi Linda, um, I saw your home came off the market. What do you think kept it from selling?' },
  { role: 'prospect', text: 'The last agent never called me back.' },
  { role: 'agent', text: 'That is frustrating. Where are you hoping to be by spring?' },
  { role: 'prospect', text: 'Well, my husband starts a job in Charlotte in March.' },
  { role: 'agent', text: 'Got it, so yeah.' },
  { role: 'system', text: 'ignored' },
];
r = await call('ann', { action: 'finish', session_id: id, transcript, duration_seconds: 185 });
assert.equal(r.status, 200, JSON.stringify(r.body));
const saved = r.body.session;
assert.equal(saved.status, 'scored'); assert.equal(saved.score, 74); assert.equal(saved.duration_seconds, 185);
assert.equal(saved.transcript.length, 6, 'only agent/prospect lines kept');
assert.equal(saved.scorecard.stats.questions, 2);
assert.equal(saved.scorecard.stats.filler_detail.um, 1, 'counts fillers');
const grading = sent.find((x) => x.url.includes('anthropic'));
assert.match(JSON.stringify(grading.body), /Charlotte/, 'grader knows the hidden motivation');

r = await call('ann', { action: 'start', scenario: 'fsbo' });
r = await call('ann', { action: 'finish', session_id: r.body.session_id, transcript: [{ role: 'agent', text: 'hi' }] });
assert.equal(r.body.session.status, 'too_short');
assert.equal(r.body.session.score, null);
console.log('voice role-play: all checks passed');
