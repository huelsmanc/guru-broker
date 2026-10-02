// Back office end to end: plan -> preview -> finalize -> approve -> Payload payout -> paid,
// statements, reports, CDA, 1099, CEO thank-you, access rules.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app', PAYLOAD_SECRET_KEY: 'secret_key_test', PAYLOAD_PROCESSING_ID: 'acct_proc' });
const calls = [];
let payloadStatus = 'processing';
globalThis.fetch = async (url, init) => {
  url = String(url); calls.push({ url, init });
  if (url.includes('resend')) return new Response('{"id":"e"}');
  if (url.endsWith('/payment_activations')) return new Response(JSON.stringify({ id: 'pa_1', status: 'requested' }));
  if (url.includes('/payment_activations/pa_1')) return new Response(JSON.stringify({ id: 'pa_1', status: 'submitted', payment_method_id: 'pm_bank_1' }));
  if (url.endsWith('/transactions')) return new Response(JSON.stringify({ id: 'txn_1', status: payloadStatus }));
  if (url.includes('/transactions/txn_1')) return new Response(JSON.stringify({ id: 'txn_1', status: payloadStatus }));
  throw new Error('unexpected ' + url);
};
globalThis.__users = { boss: { id: 'u3', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, sam: { id: 'u6', email: 'sam@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'user', brokerage_id: 'B1', start_date: '2024-03-01', commission_plan_id: 'p1', sponsor_email: 'sam@x.com', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Bea Broker', role: 'admin', brokerage_id: 'B1', extra: {} },
    { id: 'u6', email: 'sam@x.com', full_name: 'Sam Sponsor', role: 'user', brokerage_id: 'B1', extra: {} },
  ],
  commission_plan: [{ id: 'p1', brokerage_id: 'B1', name: '80/20 $18k cap', is_default: true, config: { split: { agent_pct: 80 }, cap: { amount: 18000 }, fees: [{ id: 'tx', name: 'Transaction fee', type: 'flat', amount: 395 }], downline: { levels: [{ pct: 3.5 }] } }, extra: {} }],
  brokerage_settings: [{ id: 's1', brokerage_id: 'B1', brokerage_name: 'Guru Realty', extra: { ceo_name: 'Cody H', thank_you_video_url: 'https://youtu.be/dQw4w9WgXcQ', thank_you_message: 'Hi {first_name}, welcome home to {address}!' } }],
  transaction: [{ id: 't1', brokerage_id: 'B1', agent_email: 'ann@x.com', agent_name: 'Ann Agent', property_address: '12 Elm St', sale_price: 500000, commission_percentage: 2.5, commission_type: 'percentage', status: 'closed', closing_date: '2026-09-15', buyers: ['Carla Client'], extra: {} }],
  transaction_contact: [{ id: 'c1', brokerage_id: 'B1', transaction_id: 't1', agent_email: 'ann@x.com', name: 'Carla Client', email: 'carla@home.com', is_client: true, extra: {} }],
};
const { POST } = await import('./fn.mjs');
const as = (tok) => async (name, body = {}) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const svc = async (name, body = {}) => { const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'x-gbh-service': 'hs' }, body: JSON.stringify(body) })); return { status: r.status, body: await r.json() }; };

// Preview as the agent: 12,500 GCI, 80/20 -> 2,500 to brokerage, 395 fee, net 9,605; sponsor gets 3.5% of 2,500
let r = await as('ann')('commissionPreview', { transactionId: 't1' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.result.totals.gross, 12500);
assert.equal(r.body.result.agents[0].agent_net, 9605);
assert.deepEqual(r.body.result.agents[0].revshare.map((x) => [x.email, x.amount]), [['sam@x.com', 87.5]]);
assert.equal(r.body.agents[0].cap_year_start, '2026-03-01');

r = await as('ann')('commissionFinalize', { transactionId: 't1' });
assert.equal(r.status, 403, 'agents cannot finalize');
r = await as('boss')('commissionFinalize', { transactionId: 't1', input: { closed_date: '2026-09-15' } });
assert.equal(r.status, 200, JSON.stringify(r.body));
const payouts = globalThis.__db.payout.filter((p) => p.status !== 'void');
assert.deepEqual(payouts.map((p) => [p.kind, p.payee_email, p.amount]).sort(), [['agent', 'ann@x.com', 9605], ['revshare', 'sam@x.com', 87.5]]);
assert.ok(payouts.every((p) => p.status === 'pending_approval'));

// Cap year-to-date now includes this deal
r = await as('ann')('commissionPreview', { transactionId: 't1' });
assert.equal(r.body.agents[0].ytd.company_dollar, 0, 'same deal is excluded from its own year-to-date');

// Bank link
r = await as('ann')('bankLink', { action: 'invite' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const inviteBody = decodeURIComponent(calls.find((c) => c.url.endsWith('/payment_activations')).init.body);
assert.ok(inviteBody.includes('intent[type]=bank_account') && inviteBody.includes('send_to[0][email]=ann@x.com'), inviteBody);

// Send before approval is refused; approve; send without linked bank fails for sponsor
const agentPay = payouts.find((p) => p.kind === 'agent');
const sponsorPay = payouts.find((p) => p.kind === 'revshare');
r = await as('boss')('payoutAction', { payoutIds: [agentPay.id], action: 'send' });
assert.equal(r.body.results[0].ok, false);
r = await as('ann')('payoutAction', { payoutIds: [agentPay.id], action: 'approve' });
assert.equal(r.status, 403, 'agents cannot approve payouts');
r = await as('boss')('payoutAction', { payoutIds: [agentPay.id, sponsorPay.id], action: 'approve' });
assert.ok(r.body.results.every((x) => x.ok));
r = await svc('payoutSync'); // picks up Ann's linked bank
assert.equal(r.body.linked, 1);
r = await as('boss')('payoutAction', { payoutIds: [agentPay.id], action: 'send' });
assert.match(r.body.results[0].error, /received from title/, 'no direct deposit before the commission check arrives');
globalThis.__db.transaction.find((t) => t.id === 't1').commission_received_amount = 12500;
r = await as('boss')('payoutAction', { payoutIds: [agentPay.id, sponsorPay.id], action: 'send' });
assert.equal(r.body.results[0].ok, true, JSON.stringify(r.body));
assert.equal(r.body.results[1].ok, false); assert.match(r.body.results[1].error, /hasn't linked/);
const credit = decodeURIComponent(calls.find((c) => c.url.endsWith('/transactions')).init.body);
assert.ok(credit.includes('type=credit') && credit.includes('amount=9605.00') && credit.includes('payment_method_id=pm_bank_1') && credit.includes('processing_id=acct_proc'), credit);
assert.equal(calls.find((c) => c.url.endsWith('/transactions')).init.headers.Authorization, `Basic ${Buffer.from('secret_key_test:').toString('base64')}`);
r = await as('boss')('payoutAction', { payoutIds: [agentPay.id], action: 'send' });
assert.equal(r.body.results[0].ok, false, 'never sends twice');
assert.equal(calls.filter((c) => c.url.endsWith('/transactions')).length, 1);
payloadStatus = 'processed';
await svc('payoutSync');
assert.equal(globalThis.__db.payout.find((p) => p.id === agentPay.id).status, 'paid');
r = await as('boss')('payoutAction', { payoutIds: [sponsorPay.id], action: 'mark_paid', memo: 'check #1001' });
assert.ok(r.body.results[0].ok);

// Recalculating after money went out is blocked
r = await as('boss')('commissionFinalize', { transactionId: 't1' });
assert.equal(r.status, 409);

// Statements
r = await as('boss')('monthlyStatements', { month: '2026-09', send: true });
assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(r.body.statements >= 1);
assert.ok(globalThis.__storage['private-files/statements/ann@x.com/2026-09.pdf']);
r = await as('ann')('myStatements');
assert.equal(r.body.statements[0].month, '2026-09');
r = await as('ann')('myStatements', { email: 'sam@x.com' });
assert.equal(r.status, 403);

// Reports
for (const report of ['closed_sales', 'commissions', 'agent_production', 'cap_status', 'payouts', 'pipeline', 'offers', 'esign', 'licenses', 'activity']) {
  r = await as('boss')('reportsQuery', { report, from: '2026-01-01', to: '2026-12-31' });
  assert.equal(r.status, 200, `${report}: ${JSON.stringify(r.body)}`);
  assert.ok(Array.isArray(r.body.rows) && r.body.columns.length, report);
}
// Support chats report (the old Analytics page): reply times from the messages.
globalThis.__db.conversation = [
  { id: 'cv1', brokerage_id: 'B1', agent_email: 'ann@x.com', agent_name: 'Ann', category: 'contracts', status: 'resolved', title: 'Addendum question', created_date: '2026-05-01T14:00:00Z', extra: {} },
  { id: 'cv2', brokerage_id: 'B1', agent_email: 'ann@x.com', agent_name: 'Ann', category: 'general', status: 'active', created_date: '2026-05-02T14:00:00Z', extra: {} },
  { id: 'cv9', brokerage_id: 'B9', agent_email: 'eve@o.com', status: 'active', created_date: '2026-05-02T14:00:00Z', extra: {} },
];
globalThis.__db.message = [
  { id: 'm1', brokerage_id: 'B1', conversation_id: 'cv1', sender_role: 'agent', created_date: '2026-05-01T14:00:00Z', extra: {} },
  { id: 'm2', brokerage_id: 'B1', conversation_id: 'cv1', sender_role: 'ai', created_date: '2026-05-01T14:01:00Z', extra: {} },
  { id: 'm3', brokerage_id: 'B1', conversation_id: 'cv1', sender_role: 'broker', created_date: '2026-05-01T14:20:00Z', extra: {} },
];
r = await as('boss')('reportsQuery', { report: 'support_chats', from: '2026-01-01', to: '2026-12-31' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.rows.length, 2, 'own brokerage only');
const cv1 = r.body.rows.find((x) => x.title === 'Addendum question');
assert.deepEqual([cv1.first_reply, cv1.broker_reply, cv1.messages], [1, 20, 3]);
assert.deepEqual([r.body.summary.Resolved, r.body.summary.Active, r.body.summary['Avg first reply']], [1, 1, '1 min']);
r = await as('boss')('reportsQuery', { report: 'agent_production' });
assert.equal(r.body.rows[0].gci, 12500); assert.equal(r.body.rows[0].company_dollar, 2500);
r = await as('ann')('reportsQuery', { report: 'payouts' });
assert.equal(r.status, 403);

// CDA, 1099, CEO thank-you
r = await as('boss')('cdaGenerate', { transactionId: 't1' });
assert.equal(r.status, 200, JSON.stringify(r.body));
r = await as('boss')('export1099', { year: new Date().getUTCFullYear() });
assert.match(r.body.csv, /ann@x\.com/);
r = await as('boss')('ceoThankYou', { transactionId: 't1', preview: true });
assert.match(r.body.html, /img\.youtube\.com\/vi\/dQw4w9WgXcQ/); assert.match(r.body.html, /Hi Carla, welcome home to 12 Elm St!/);
r = await as('boss')('ceoThankYou', { transactionId: 't1' });
assert.equal(r.body.sent, 1);
assert.equal(calls.filter((c) => c.url.includes('resend')).map((c) => JSON.parse(c.init.body)).at(-1).to[0], 'carla@home.com');

// Checklists
r = await as('ann')('checklistAction', { action: 'templates' });
assert.ok(r.body.templates.length >= 7, JSON.stringify(r.body));
const buyerTpl = r.body.templates.find((t) => t.name === 'Buyer Checklist');
r = await as('ann')('checklistAction', { action: 'apply', subject_type: 'transaction', subject_id: 't1', template_id: buyerTpl.id });
assert.equal(r.status, 200, JSON.stringify(r.body));
const cl = r.body.checklist; const b2b = cl.items.find((i) => i.title === 'B2B');
r = await as('ann')('checklistAction', { action: 'submit', checklist_id: cl.id, item_id: b2b.id });
assert.equal(r.status, 400, 'needs a document first');
r = await as('ann')('checklistAction', { action: 'attach', checklist_id: cl.id, item_id: b2b.id, url: 'https://files/b2b.pdf', name: 'B2B.pdf' });
r = await as('ann')('checklistAction', { action: 'submit', checklist_id: cl.id, item_id: b2b.id });
assert.equal(r.body.checklist.items.find((i) => i.id === b2b.id).status, 'review_requested');
assert.ok(globalThis.__db.notification.some((n) => n.user_email === 'boss@x.com' && /Review requested: B2B/.test(n.title)));
r = await as('ann')('checklistAction', { action: 'approve', checklist_id: cl.id, item_id: b2b.id });
assert.equal(r.status, 403, 'agents cannot approve');
r = await as('boss')('checklistAction', { action: 'approve', checklist_id: cl.id, item_id: b2b.id, note: 'Looks good' });
assert.equal(r.body.checklist.items.find((i) => i.id === b2b.id).status, 'approved');
const task = cl.items.find((i) => !i.requires_document);
r = await as('ann')('checklistAction', { action: 'complete', checklist_id: cl.id, item_id: task.id });
assert.equal(r.body.checklist.items.find((i) => i.id === task.id).status, 'done');

// Two people changing the same checklist at the same moment: both changes are kept.
{
  const row = globalThis.__db.checklist.find((x) => x.id === cl.id);
  row.updated_date ||= '2026-10-01T00:00:00.000Z';
  const [x, y] = await Promise.all([
    as('ann')('checklistAction', { action: 'comment', checklist_id: cl.id, item_id: b2b.id, text: 'first at the same time' }),
    as('boss')('checklistAction', { action: 'comment', checklist_id: cl.id, item_id: task.id, text: 'second at the same time' }),
  ]);
  assert.equal(x.status, 200, JSON.stringify(x.body)); assert.equal(y.status, 200, JSON.stringify(y.body));
  const now = globalThis.__db.checklist.find((z) => z.id === cl.id).items;
  assert.ok(now.find((i) => i.id === b2b.id).comments.some((c) => c.text === 'first at the same time'), 'first kept');
  assert.ok(now.find((i) => i.id === task.id).comments.some((c) => c.text === 'second at the same time'), 'second kept');
  assert.equal(now.find((i) => i.id === b2b.id).status, 'approved', 'earlier approval kept');
}

// @mentions: only people who can see the deal are offered and notified
r = await as('ann')('checklistAction', { action: 'mentionable', checklist_id: cl.id });
assert.deepEqual(r.body.people.map((p) => p.email).sort(), ['boss@x.com'], JSON.stringify(r.body));
const before = globalThis.__db.notification.length;
r = await as('ann')('checklistAction', { action: 'comment', checklist_id: cl.id, item_id: b2b.id, text: 'Hey @Bea Broker can you look? cc @Sam Sponsor', mentions: ['boss@x.com', 'sam@x.com'] });
assert.equal(r.status, 200, JSON.stringify(r.body));
const c = r.body.checklist.items.find((i) => i.id === b2b.id).comments.at(-1);
assert.deepEqual(c.mentions.map((m) => m.email), ['boss@x.com'], 'sam is not on the deal');
const fresh = globalThis.__db.notification.slice(before);
assert.equal(fresh.length, 1); assert.equal(fresh[0].user_email, 'boss@x.com'); assert.match(fresh[0].title, /mentioned you on B2B/);
assert.match(fresh[0].action_url ?? fresh[0].extra?.action_url, /item=/);
assert.ok(calls.some((x) => x.url.includes('resend') && JSON.parse(x.init.body).to[0] === 'boss@x.com' && /mentioned you/.test(JSON.parse(x.init.body).html)), 'mention emailed');
r = await as('ann')('trackEvent', { event: 'mentionable', transaction_id: 't1' });
assert.deepEqual(r.body.people.map((p) => p.email), ['boss@x.com']);
r = await as('boss')('trackEvent', { event: 'comment', transaction_id: 't1', summary: 'Nice work @Ann Agent', mentions: ['ann@x.com'] });
assert.ok(globalThis.__db.notification.some((n) => n.user_email === 'ann@x.com' && /mentioned you/.test(n.title)));

// Sides: listing 0%, buying 2.5% of 800k with two agents 50/50
globalThis.__db.transaction.push({ id: 't2', brokerage_id: 'B1', agent_email: 'ann@x.com', property_address: '3905 Aquilla Dr', sale_price: 800000, status: 'active',
  sides: [{ side: 'listing', pct: 0, agents: [] }, { side: 'buying', pct: 2.5, agents: [{ email: 'ann@x.com', pct: 50 }, { email: 'sam@x.com', pct: 50 }] }], extra: {} });
r = await as('boss')('commissionPreview', { transactionId: 't2' });
assert.equal(r.body.result.totals.gross, 20000);
assert.deepEqual(r.body.result.agents.map((a) => [a.email, a.share]), [['ann@x.com', 10000], ['sam@x.com', 10000]]);

// Listing side has 2% typed in but no agent of ours on it: it's the other brokerage's, not counted.
r = await as('boss')('commissionPreview', { transactionId: 't2', input: { sides: [{ side: 'listing', pct: 2, agents: [] }, { side: 'buying', pct: 2, agents: [{ email: 'ann@x.com', pct: 100 }] }] } });
assert.equal(r.body.result.totals.gross, 16000, 'only our side counts');
assert.deepEqual(r.body.result.agents.map((a) => [a.email, a.share]), [['ann@x.com', 16000]]);

// My Commissions: agent sees own cap progress; can't look at someone else's
r = await as('ann')('myCommission', {});
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.cap, 18000); assert.equal(r.body.cap_year_start, '2026-03-01'); assert.equal(r.body.cap_year_end, '2027-03-01');
assert.ok(r.body.ytd.company_dollar > 0 && r.body.records.length === 1 && r.body.payouts.length >= 1, JSON.stringify(r.body));
r = await as('ann')('myCommission', { email: 'sam@x.com' });
assert.equal(r.status, 403);
r = await as('boss')('myCommission', { email: 'ann@x.com' });
assert.equal(r.status, 200);

// "Add automatically" templates go on new deals (matching deal type) and new users (onboarding)
const tpls = globalThis.__db.checklist_template;
tpls.find((t) => t.name === 'Buyer Checklist').is_default = true;
tpls.find((t) => t.name === 'Listing Checklist').is_default = true;
tpls.find((t) => t.kind === 'onboarding').is_default = true;
r = await as('ann')('applyDefaultChecklists', { event: { entity_name: 'Transaction', data: { id: 't9', brokerage_id: 'B1', agent_email: 'ann@x.com', deal_type: 'buyer' } } });
assert.equal(r.status, 403, 'automation is service-only');
r = await svc('applyDefaultChecklists', { event: { entity_name: 'Transaction', data: { id: 't9', brokerage_id: 'B1', agent_email: 'ann@x.com', deal_type: 'buyer' } } });
assert.equal(r.body.added, 1, JSON.stringify(r.body));
r = await svc('applyDefaultChecklists', { event: { entity_name: 'Transaction', data: { id: 't9', brokerage_id: 'B1', agent_email: 'ann@x.com', deal_type: 'buyer' } } });
assert.equal(r.body.added, 0, 'not added twice');
r = await svc('applyDefaultChecklists', { event: { entity_name: 'User', data: { id: 'u9', brokerage_id: 'B1', email: 'New@x.com' } } });
assert.equal(r.body.added, 1);
assert.ok(globalThis.__db.checklist.some((c) => c.subject_type === 'onboarding' && c.subject_id === 'new@x.com'));

// My day: open deals, pending commission from the real plan, deadlines, to-dos, admin queues.
globalThis.__db.transaction.find((t) => t.id === 't2').inspection_contingency_date = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
globalThis.__db.transaction.find((t) => t.id === 't2').closing_date = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
r = await as('ann')('checklistAction', { action: 'apply', subject_type: 'transaction', subject_id: 't2', template_id: buyerTpl.id });
r = await as('ann')('myDay', {});
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.deals, 1);
assert.ok(r.body.pending_net > 0, `pending ${r.body.pending_net}`);
assert.ok(r.body.deadlines.some((d) => d.label === 'Closing' && d.overdue), 'overdue closing flagged');
assert.ok(r.body.deadlines.some((d) => d.label === 'Inspection contingency' && !d.overdue));
assert.ok(r.body.todo.length > 0 && r.body.todo.every((t) => t.where === '3905 Aquilla Dr'), JSON.stringify(r.body.todo.slice(0, 2)));
assert.equal(r.body.cap.amount, 18000);
assert.equal(r.body.waiting, undefined, 'agents have no admin queues');
r = await as('boss')('myDay', {});
assert.ok(r.body.waiting && typeof r.body.waiting.payouts === 'number' && typeof r.body.waiting.docs === 'number', JSON.stringify(r.body.waiting));

console.log('Back office: all checks passed');
