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

r = await call('offerAccepted', { offerId: 'o1', acceptanceDate: '2026-10-01', finalPrice: 445000 });
assert.equal(r.status, 200, JSON.stringify(r.body));
const tx = globalThis.__db.transaction[0];
assert.equal(tx.sale_price, 445000);
assert.equal(tx.tc_email, 'tc@x.com');
assert.equal(tx.inspection_contingency_date, '2026-10-11');
assert.equal(tx.financing_contingency_date, '2026-10-22');
assert.deepEqual(tx.buyers, ['Bob']);
assert.ok(tx.checklist.length >= 10);
assert.equal(globalThis.__db.offer[0].status, 'accepted');
assert.ok(globalThis.__db.notification.some((n) => n.user_email === 'tc@x.com'));
assert.ok(calls.some((c) => c.url.includes('resend') && c.body.to[0] === 'tc@x.com'), 'TC emailed');
r = await call('offerAccepted', { offerId: 'o1' });
assert.equal(r.body.status, 'exists', 'second click does not duplicate');

r = await call('aiFileCheck', { transactionId: tx.id });
assert.equal(r.status, 200); assert.equal(r.body.result.score, 72);

console.log('AI features: all checks passed');
