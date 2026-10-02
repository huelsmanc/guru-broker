// Training classes: answers never reach learners, grading happens on the server, only admins
// edit, AI drafts a class (outline, lessons, quiz), and a pass earns a broker-signed certificate.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'anthropic' });
const calls = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const body = init.body ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  if (url.includes('api.anthropic.com')) {
    const prompt = body.messages[0].content.at(-1).text;
    const tool = (input) => Response.json({ content: [{ type: 'tool_use', name: 'respond', input }] });
    if (prompt.startsWith('Plan a short training class')) return tool({ title: 'Fair Housing Basics', description: 'The essentials.', minutes: 30, lessons: [{ title: 'Protected classes', points: ['seven federal classes'] }, { title: 'Advertising', points: ['no steering words'] }] });
    if (prompt.startsWith('Write lesson')) return Response.json({ content: [{ type: 'text', text: `Body for ${prompt.match(/Lesson title: (.*)/)[1]}\nKey takeaway: be fair.` }] });
    if (prompt.includes('multiple-choice quiz questions')) return tool({ questions: [
      { question: 'How many federal protected classes?', options: ['5', '6', '7', '8'], correct_index: 2, explanation: 'Seven.' },
      { question: 'Steering is', options: ['legal', 'illegal'], correct_index: 1, explanation: 'Illegal.' },
    ] });
    throw new Error('unexpected prompt ' + prompt.slice(0, 60));
  }
  throw new Error('unexpected ' + url);
};
globalThis.__users = { owner: { id: 'u0', email: 'owner@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, eve: { id: 'u9', email: 'eve@y.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'owner@x.com', full_name: 'Olivia Owner', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', display_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@y.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  brokerage: [{ id: 'B1', name: 'Good Realty', extra: {} }],
  brokerage_settings: [{ id: 's1', brokerage_id: 'B1', broker_name: 'Olivia Owner', primary_color: '#6a9e35', extra: {} }],
  compliance_training: [], compliance_question: [], compliance_attempt: [],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/training', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));

// AI draft of a class: outline, then lessons and the quiz.
let r = await call('owner', { action: 'draft', kind: 'class', topic: 'fair housing', lessons: 2, questions: 2 });
assert.equal(r.status, 200, JSON.stringify(r.body));
const d = r.body.draft;
assert.equal(d.kind, 'class'); assert.equal(d.lessons.length, 2); assert.match(d.lessons[1].body, /Body for Advertising/);
assert.equal(d.questions.length, 2); assert.equal(d.questions[0].options[2].is_correct, true); assert.equal(d.minutes, 30);
// Agents can't draft, save or delete.
assert.equal((await call('ann', { action: 'draft', kind: 'quiz', topic: 'x' })).status, 403);
assert.equal((await call('ann', { action: 'save', training: { title: 'x' }, questions: [] })).status, 403);

// Save checks the questions.
r = await call('owner', { action: 'save', training: { ...d, passing_score: 100 }, questions: [{ question_text: 'Q', options: [{ text: 'a', is_correct: true }, { text: 'b', is_correct: true }] }] });
assert.equal(r.status, 400); assert.match(r.body.error, /exactly one correct/);
r = await call('owner', { action: 'save', training: { ...d, passing_score: 100 }, questions: d.questions });
assert.equal(r.status, 200, JSON.stringify(r.body));
const tid = r.body.training.id;
assert.equal(__db.compliance_question.length, 2);

// Taking it: no answers in what learners get.
r = await call('ann', { action: 'start', training_id: tid });
assert.equal(r.status, 200);
assert.equal(r.body.training.kind, 'class'); assert.equal(r.body.training.lessons.length, 2);
assert.ok(!JSON.stringify(r.body).includes('is_correct'), 'answers hidden');
const [q1, q2] = r.body.questions;
assert.deepEqual(q1.options, ['5', '6', '7', '8']);
// Another brokerage can't open it.
assert.equal((await call('eve', { action: 'start', training_id: tid })).status, 404);

// Must answer everything; wrong answer fails (needs 100%).
assert.equal((await call('ann', { action: 'submit', training_id: tid, answers: { [q1.id]: 2 } })).status, 400);
r = await call('ann', { action: 'submit', training_id: tid, answers: { [q1.id]: 2, [q2.id]: 0 } });
assert.equal(r.body.passed, false); assert.equal(r.body.score, 50); assert.equal(r.body.results[1].correct_index, 1);
const failId = r.body.attempt_id;
assert.equal((await call('ann', { action: 'certificate', attempt_id: failId })).status, 400);
r = await call('ann', { action: 'submit', training_id: tid, answers: { [q1.id]: 2, [q2.id]: 1 } });
assert.equal(r.body.passed, true); assert.equal(r.body.score, 100);
const passId = r.body.attempt_id;
const saved = __db.compliance_attempt.find((a) => a.id === passId);
assert.equal(saved.agent_email, 'ann@x.com'); assert.match(saved.certificate_no, /^\d{4}-[A-Z0-9]+$/);

// Broker's signature: admin only, PNG only.
assert.equal((await call('ann', { action: 'set_signer', name: 'x' })).status, 403);
assert.equal((await call('owner', { action: 'set_signer', name: 'O', signature: 'data:image/svg+xml;base64,AAAA' })).status, 400);
const png = `data:image/png;base64,${readFileSync(new URL('./sig.png', import.meta.url)).toString('base64')}`;
r = await call('owner', { action: 'set_signer', name: 'Olivia Owner', title: 'Broker of Record', signature: png });
assert.equal(r.status, 200); assert.match(r.body.signature_url, /scoped%2FB1%2Fuser%2Fu0%2F/);

// Certificate: the agent's own, saved in their private folder, made once.
r = await call('ann', { action: 'certificate', attempt_id: passId });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.match(r.body.url, /scoped%2FB1%2Fuser%2Fu1%2F/);
const key = Object.keys(globalThis.__storage).find((k) => k.includes('/user/u1/') && k.endsWith('.pdf'));
const pdfText = Buffer.from(globalThis.__storage[key]).toString('latin1');
assert.ok(pdfText.startsWith('%PDF'), 'a PDF');
assert.equal((await call('ann', { action: 'certificate', attempt_id: passId })).body.url, r.body.url, 'reused');
// Admin can get it too; another brokerage can't.
assert.equal((await call('owner', { action: 'certificate', attempt_id: passId })).status, 200);
assert.equal((await call('eve', { action: 'certificate', attempt_id: passId })).status, 404);

// Admin editing: answers included; delete removes questions.
r = await call('owner', { action: 'get', training_id: tid });
assert.equal(r.body.questions[1].options[1].is_correct, true);
assert.equal((await call('owner', { action: 'delete', training_id: tid })).status, 200);
assert.equal(__db.compliance_question.length, 0); assert.equal(__db.compliance_training.length, 0);
assert.equal(__db.compliance_attempt.length, 2, 'attempts and certificates kept');
console.log('training classes and certificates: all checks passed');
