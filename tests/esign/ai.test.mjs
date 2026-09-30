// AI features with a fake model: request shapes, structured output, offer -> transaction.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-oai', AI_PROVIDER: 'anthropic', SIGNING_TOKEN_SECRET: 't' });
const calls = [];
let failAnthropic = false;
globalThis.fetch = async (url, init) => {
  url = String(url);
  const body = init?.body ? JSON.parse(init.body) : null;
  calls.push({ url, body });
  if (url.includes('resend')) return new Response('{"id":"e"}');
  if (url.includes('anthropic')) {
    if (failAnthropic) return new Response('{"error":{"message":"overloaded"}}', { status: 529 });
    if (body.tool_choice) {
      const schema = body.tools[0].input_schema;
      const input = schema.properties.assignments ? { assignments: [{ id: 'c0', type: 'signature', signer_index: 0 }] }
        : schema.properties.score ? { score: 72, headline: 'Two items need attention', items: [{ severity: 'critical', title: 'Inspection deadline passed', detail: 'Due yesterday', suggested_task: 'Get inspection waiver signed' }] }
        : { document_type: 'Purchase and Sale Agreement', summary: 'x', buyers: ['Bob'], sellers: ['Sue'], purchase_price: 450000, dates: { closing_date: '2026-11-15' }, contingencies: [], issues: [] };
      return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input }] }));
    }
    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'Offer to Purchase - 12 Elm St\n...' }] }));
  }
  if (url.includes('openai')) return new Response(JSON.stringify({ output_text: 'Offer to Purchase - from OpenAI' }));
  throw new Error('unexpected ' + url);
};
globalThis.__users = { tok: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [{ id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', extra: {} },
             { id: 'u2', email: 'tc@x.com', full_name: 'Tina TC', role: 'user', brokerage_id: 'B1', extra: {} }],
  brokerage_settings: [{ id: 's1', brokerage_id: 'B1', extra: { default_tc_email: 'tc@x.com', default_tc_name: 'Tina TC' } }],
  offer: [{ id: 'o1', brokerage_id: 'B1', agent_email: 'ann@x.com', agent_name: 'Ann Agent', property_address: '12 Elm St', city: 'Hartford', state: 'CT',
            offer_price: 440000, earnest_money: 10000, financing_type: 'conventional', inspection_days: 10, financing_days: 21, closing_date: '2026-11-15',
            buyers: [{ name: 'Bob', email: 'bob@x.com' }], sellers: [{ name: 'Sue' }], status: 'sent', extra: {} }],
};
const { POST } = await import('./fn.mjs');
const call = async (name, body) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer tok' }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const svc = async (name, body = {}) => { const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

let r = await call('aiOfferDraft', { property_address: '12 Elm St', offer_price: 440000, buyers: [{ name: 'Bob' }] });
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.offer_text, /Offer to Purchase/);
const req = calls.find((c) => c.url.includes('anthropic')).body;
assert.ok(req.model && req.max_tokens && req.messages[0].content.at(-1).text.includes('Bob'), 'prompt includes buyer');

r = await call('aiScanDocument', { file_url: 'https://files/contract.pdf' });
assert.equal(r.status, 200); assert.equal(r.body.result.purchase_price, 450000);
const scanReq = calls.filter((c) => c.url.includes('anthropic')).at(-1).body;
assert.equal(scanReq.messages[0].content[0].type, 'document', 'PDF sent as a document');

failAnthropic = true;
r = await call('aiOfferDraft', { property_address: '12 Elm St', offer_price: 440000 });
assert.equal(r.status, 200); assert.match(r.body.offer_text, /OpenAI/, 'falls back to ChatGPT when Claude fails');
failAnthropic = false;

globalThis.__db.checklist_template = [
  { id: 'ct1', brokerage_id: 'B1', name: 'Buyer Checklist', kind: 'transaction', deal_type: 'buyer', items: [{ id: 'i1', title: 'Fully Executed Purchase Agreement', requires_document: true, form_url: 'https://files/far-bar.pdf', form_name: 'FAR/BAR As-Is' }, { id: 'i2', title: 'Schedule inspection' }], extra: {} },
  { id: 'ctX', brokerage_id: 'OTHER', name: 'Not ours', kind: 'transaction', items: [], extra: {} },
];
r = await call('offerAccepted', { offerId: 'o1', templateIds: ['ctX'] });
assert.equal(r.status, 400, "can't use another brokerage's checklist");
assert.equal((globalThis.__db.transaction || []).length, 0, 'nothing created on a bad pick');
r = await call('offerAccepted', { offerId: 'o1', acceptanceDate: '2026-10-01', finalPrice: 445000, templateIds: ['ct1'] });
assert.equal(r.status, 200, JSON.stringify(r.body));
const tx = globalThis.__db.transaction[0];
assert.equal(tx.sale_price, 445000);
assert.equal(tx.tc_email, 'tc@x.com');
assert.equal(tx.inspection_contingency_date, '2026-10-11');
assert.equal(tx.financing_contingency_date, '2026-10-22');
assert.deepEqual(tx.buyers, ['Bob']);
const cls = globalThis.__db.checklist.filter((c) => c.subject_id === tx.id);
assert.equal(cls.length, 1, 'the checklist the agent picked');
assert.equal(cls[0].name, 'Buyer Checklist'); assert.equal(cls[0].subject_email, 'ann@x.com');
assert.equal(cls[0].items[0].form_url, 'https://files/far-bar.pdf', 'preloaded form carried over');
assert.equal(cls[0].items[0].status, 'open');
assert.equal(tx.extra?.offer_id ?? tx.offer_id, 'o1');
r = await svc('applyDefaultChecklists', { event: { entity_name: 'Transaction', data: { ...tx, offer_id: 'o1' } } });
assert.equal(r.body.skipped, 'agent chose checklists');
assert.equal(globalThis.__db.offer[0].status, 'accepted');
assert.ok(globalThis.__db.notification.some((n) => n.user_email === 'tc@x.com'));
assert.ok(calls.some((c) => c.url.includes('resend') && c.body.to[0] === 'tc@x.com'), 'TC emailed');
r = await call('offerAccepted', { offerId: 'o1' });
assert.equal(r.body.status, 'exists', 'second click does not duplicate');

r = await call('aiFileCheck', { transactionId: tx.id });
assert.equal(r.status, 200); assert.equal(r.body.result.score, 72);

console.log('AI features: all checks passed');

// ---- Roles, broker review, send to listing agent
globalThis.__db.profiles.push(
  { id: 'u3', email: 'boss@x.com', full_name: 'Bea Broker', role: 'admin', brokerage_id: 'B1', duties: [], extra: {} },
  { id: 'u4', email: 'comp@x.com', full_name: 'Cal Compliance', role: 'user', brokerage_id: 'B1', duties: ['compliance'], extra: {} },
  { id: 'u5', email: 'tc2@x.com', full_name: 'Tom TC', role: 'user', brokerage_id: 'B1', duties: ['tc'], extra: {} },
);
globalThis.__users.boss = { id: 'u3', email: 'boss@x.com' };
globalThis.__db.brokerage_settings[0].extra = {}; // no default TC -> automatic
globalThis.__db.transaction.push({ id: 'busy1', brokerage_id: 'B1', status: 'active', tc_email: 'tc@x.com', extra: {} });
globalThis.__db.profiles.find((p) => p.email === 'tc@x.com').duties = ['tc'];
globalThis.__db.offer.push({ id: 'o2', brokerage_id: 'B1', agent_email: 'ann@x.com', agent_name: 'Ann Agent', property_address: '9 Oak Ave', offer_price: 300000,
  listing_agent_email: 'la@other.com', listing_agent_name: 'Lee Lister', document_url: 'https://files/original.pdf', buyers: [{ name: 'Bob' }], status: 'draft', extra: {} });
const before = calls.length;
const as = (tok) => async (name, body) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
globalThis.fetch = ((orig) => async (url, init) => (String(url).includes('original.pdf') ? new Response(Buffer.from('%PDF-1.4 test')) : orig(url, init)))(globalThis.fetch);

r = await as('tok')('offerReview', { offerId: 'o2', action: 'request', note: 'Check the escalation clause' });
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.notified, 2, 'admin + compliance notified');
r = await as('tok')('offerReview', { offerId: 'o2', action: 'approve' });
assert.equal(r.status, 403, 'agents cannot approve');
r = await as('boss')('offerReview', { offerId: 'o2', action: 'changes', note: 'Raise EMD' });
assert.equal(r.status, 200);
assert.equal(globalThis.__db.offer.find((o) => o.id === 'o2').extra.review_status, 'changes_requested');

r = await as('tok')('offerSend', { offerId: 'o2', message: 'Hi Lee <3' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const sent = calls.filter((c) => c.url.includes('resend')).at(-1).body;
assert.deepEqual(sent.to, ['la@other.com']); assert.ok(sent.cc.includes('ann@x.com')); assert.equal(sent.reply_to, 'ann@x.com');
assert.ok(sent.attachments[0].filename.endsWith('.pdf')); assert.ok(sent.html.includes('Hi Lee &lt;3'));
assert.equal(globalThis.__db.offer.find((o) => o.id === 'o2').status, 'submitted');

r = await as('tok')('offerAccepted', { offerId: 'o2' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.tc.email, 'tc2@x.com', 'least-loaded TC picked automatically');
const notes = globalThis.__db.notification.filter((n) => n.reference_id === r.body.transaction_id).map((n) => n.user_email).sort();
assert.deepEqual(notes, ['comp@x.com', 'tc2@x.com']);
console.log('Roles, review and send: all checks passed');
