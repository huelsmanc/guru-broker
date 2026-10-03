// AI document check: runs on a submitted checklist item, checks it against the item and the deal,
// saves the result on the item for the agent and the approver, tells the agent when something's
// off, and starts over when a new document is uploaded.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app', ANTHROPIC_API_KEY: 'sk-ant' });
let answer = null; const prompts = [];
globalThis.fetch = async (url, init) => {
  url = String(url);
  if (url.includes('anthropic')) {
    const body = JSON.parse(init.body);
    prompts.push(JSON.stringify(body.messages));
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', name: 'respond', input: answer }] }));
  }
  throw new Error('unexpected ' + url);
};
globalThis.__users = { ann: { id: 'u1', email: 'ann@x.com' }, cody: { id: 'u0', email: 'cody@x.com' }, zed: { id: 'u9', email: 'zed@y.com' } };
const ts = '2026-10-01T00:00:00Z';
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'cody@x.com', full_name: 'Cody Huelsman', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'zed@y.com', full_name: 'Zed', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  transaction: [{ id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '12 Elm St', sale_price: 450000, buyers: ['Bob Buyer'], closing_date: '2026-11-15', extra: {} }],
  checklist: [{ id: 'cl1', brokerage_id: 'B1', subject_type: 'transaction', subject_id: 't1', status: 'review', updated_date: ts, extra: {},
    items: [
      { id: 'insp', title: 'Inspection Contingency Addendum', requires_document: true, status: 'review_requested', document_url: '/api/file?p=scoped%2FB1%2Ftx%2Ft1%2Faddendum.pdf', document_name: 'addendum.pdf', uploaded_by: 'ann@x.com', history: [] },
      { id: 'word', title: 'Agency disclosure', requires_document: true, status: 'review_requested', document_url: '/api/file?p=scoped%2FB1%2Ftx%2Ft1%2Fdisclosure.docx', uploaded_by: 'ann@x.com', history: [] },
    ] }],
  notification: [],
};
globalThis.__storage = { 'private-files/scoped/B1/tx/t1/addendum.pdf': new Uint8Array([1]), 'private-files/scoped/B1/tx/t1/disclosure.docx': new Uint8Array([1]) };
globalThis.__rls = { checklist: (r, viewer) => r.brokerage_id === (viewer.email === 'zed@y.com' ? 'B2' : 'B1') };
const { POST } = await import('./fn.mjs');
const call = async (tok, body) => { const r = await POST(new Request('https://gurubroker.app/api/fn/docReview', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };
const item = (id) => __db.checklist[0].items.find((i) => i.id === id);

// Something's off: wrong-ish facts and a missing initial. The agent is told right away.
answer = { document_type: 'Inspection Contingency Addendum', matches_item: true, summary: 'Addendum extending the inspection period.', issues: [{ severity: 'high', description: 'Seller initials missing on page 2', page: 2 }], mismatches: [{ field: 'Price', document_value: '$445,000', deal_value: '$450,000' }] };
let r = await call('ann', { checklist_id: 'cl1', item_id: 'insp', auto: true });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(item('insp').ai_review.verdict, 'needs_attention');
assert.equal(item('insp').ai_review.issues[0].page, 2);
assert.match(prompts[0], /Inspection Contingency Addendum/); assert.match(prompts[0], /12 Elm St/); assert.match(prompts[0], /450000/);
assert.match(prompts[0], /addendum\.pdf/, 'the AI gets a readable link to the private file');
const n = __db.notification.find((x) => x.user_email === 'ann@x.com');
assert.match(n.title, /AI check: 2 things to look at/); assert.match(n.description, /Seller initials missing/);

// Saved result is reused (no second AI call) unless asked to run again.
await call('cody', { checklist_id: 'cl1', item_id: 'insp' });
assert.equal(prompts.length, 1);
answer = { document_type: 'Inspection Contingency Addendum', matches_item: true, summary: 'Complete.', issues: [{ severity: 'low', description: 'Page numbers missing' }], mismatches: [] };
r = await call('cody', { checklist_id: 'cl1', item_id: 'insp', force: true });
assert.equal(r.body.review.verdict, 'looks_complete', 'low-only notes still look complete');
assert.equal(__db.notification.length, 1, 'no alert on a manual run');

// Wrong document entirely.
answer = { document_type: 'Lead Paint Disclosure', matches_item: false, matches_note: 'This is the lead paint disclosure', summary: 'x', issues: [], mismatches: [] };
r = await call('cody', { checklist_id: 'cl1', item_id: 'insp', force: true });
assert.equal(r.body.review.verdict, 'needs_attention'); assert.equal(r.body.review.matches_item, false);

// Files the AI can't read are marked, not guessed at.
r = await call('ann', { checklist_id: 'cl1', item_id: 'word', auto: true });
assert.equal(r.body.review.verdict, 'unreadable'); assert.equal(prompts.length, 3);

// Other brokerages can't run it on this checklist.
assert.equal((await call('zed', { checklist_id: 'cl1', item_id: 'insp' })).status, 404);

// A new upload clears the old result.
const back = await POST(new Request('https://gurubroker.app/api/fn/checklistAction', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ann' }, body: JSON.stringify({ action: 'attach', checklist_id: 'cl1', item_id: 'insp', url: 'https://files.example/new.pdf', name: 'new.pdf' }) }));
assert.equal(back.status, 200);
assert.equal(item('insp').ai_review, undefined);
console.log('AI document check: all checks passed');
