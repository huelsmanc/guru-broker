// AI contract filling: the intake questions are written from the form once, cached on the form,
// only for people who can see the form; the agent's answers reach the box filler.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant', AI_PROVIDER: 'anthropic' });
const llm = [];
globalThis.fetch = async (url, init = {}) => {
  url = String(url); const body = JSON.parse(init.body || '{}'); llm.push(body);
  const prompt = JSON.stringify(body);
  if (prompt.includes('every piece of information the AGENT must supply')) return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: {
    form_summary: 'Connecticut residential purchase agreement.',
    questions: [
      { key: 'Buyer Names', label: 'Buyer name(s)', group: 'Parties', type: 'names', source: 'buyers' },
      { key: 'price', label: 'Purchase price', group: 'Price', type: 'money', source: 'purchase_price' },
      { key: 'price', label: 'dup', group: 'Price', type: 'money', source: 'none' },
      { key: 'fin', label: 'Financing', group: 'Financing', type: 'choice', options: ['Conventional', 'FHA', 'Cash'], source: 'financing_type' },
      { key: 'weird', label: 'Odd type', group: 'Other', type: 'spaceship', source: 'not_a_fact' },
    ] } }] }));
  if (prompt.includes('blank lines and boxes found in the document')) return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: { assignments: [{ id: 'c1', type: 'fill', signer_index: 0, label: 'Price', value: '$470,000.00' }] } }] }));
  throw new Error('unexpected ' + url);
};
globalThis.__users = { boss: { id: 'u3', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, eve: { id: 'u9', email: 'eve@o.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@o.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  contract_form: [{ id: 'cf1', brokerage_id: 'B1', name: 'CT Purchase Agreement', document_url: 'x', fields: [], extra: {} }],
};
globalThis.__rls = { contract_form: (row, u) => (u.email === 'eve@o.com' ? row.brokerage_id === 'B2' : row.brokerage_id === 'B1') };
const { POST } = await import('./fn.mjs');
const call = (tok, name, body) => POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const text = 'PURCHASE AND SALE AGREEMENT. Buyer: ________ Seller: ________ Purchase price $________ '.repeat(10);

let r = await call('eve', 'contractIntake', { form_id: 'cf1', text });
assert.equal(r.status, 404, 'other brokerage cannot use the form');
r = await call('ann', 'contractIntake', { form_id: 'cf1', text: 'too short' });
assert.equal(r.status, 422, 'scanned/empty forms explain themselves');
r = await call('ann', 'contractIntake', { form_id: 'cf1', text });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.questions.map((q) => q.key), ['buyer_names', 'price', 'fin', 'weird'], 'keys cleaned, duplicates dropped');
assert.equal(r.body.questions[3].type, 'text'); assert.equal(r.body.questions[3].source, 'none');
assert.deepEqual(r.body.questions[2].options, ['Conventional', 'FHA', 'Cash']);
assert.equal(globalThis.__db.contract_form[0].extra.intake.questions.length, 4, 'saved on the form');
const calls = llm.length;
r = await call('boss', 'contractIntake', { form_id: 'cf1', text });
assert.equal(llm.length, calls, 'second time comes from the saved copy, no AI call');
r = await call('boss', 'contractIntake', { form_id: 'cf1', text, force: true });
assert.equal(llm.length, calls + 1, 'rewrite on request');

// The filler gets the agent's answers.
r = await call('ann', 'aiAssignFields', { title: 'CT PA', candidates: [{ id: 'c1', page: 1, context: 'Purchase price $____' }], signers: [], facts: { buyers: ['Alex Peck'], intake: [{ label: 'Purchase price', value: '$470,000' }, { label: 'Empty', value: '' }] } });
assert.equal(r.status, 200, JSON.stringify(r.body));
const sent = JSON.stringify(llm.at(-1));
assert.match(sent, /answers_from_agent/); assert.match(sent, /470,000/); assert.doesNotMatch(sent, /"Empty"/);
console.log('contract intake: all checks passed');
