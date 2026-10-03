// Deal autopilot: deadline reminders go to the deal team (3 days, 1 day, and the morning after if
// not done) and to other parties with an email (the day before; closing 3 days and 1 day before),
// once each, at 8am; done deadlines, finished deals and deals with autopilot off are skipped; the
// brokerage can turn off party emails; everyone gets a 7am "due today" list.
import assert from 'node:assert/strict';
Object.assign(process.env, { NODE_ENV: 'test', SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', RESEND_API_KEY: 're', APP_URL: 'https://gurubroker.app' });
const emails = [];
globalThis.fetch = async (url, init) => { if (String(url).includes('resend')) { emails.push(JSON.parse(init.body)); return new Response('{"id":"e"}'); } throw new Error('unexpected ' + url); };
globalThis.__users = {};
const deal = (id, extra = {}) => ({ id, brokerage_id: 'B1', status: 'active', property_address: `${id} Elm St`, agent_email: 'ann@x.com', agent_name: 'Ann Agent', tc_email: 'tia@x.com', tc_name: 'Tia TC',
  inspection_date: '2026-10-06', closing_date: '2026-10-08', financing_contingency_date: '2026-10-04', completed_dates: [], ...extra, extra: {} });
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'tia@x.com', full_name: 'Tia TC', role: 'tc', brokerage_id: 'B1', timezone: 'America/Los_Angeles', extra: {} },
  ],
  brokerage: [{ id: 'B1', name: 'mygoodagent', extra: {} }],
  brokerage_settings: [{ id: 's1', brokerage_id: 'B1', extra: {} }],
  transaction: [
    deal('t1'),
    deal('t2', { completed_dates: ['closing_date', 'inspection_date', 'financing_contingency_date'] }),
    deal('t3', { status: 'closed' }),
    { ...deal('t4'), extra: { autopilot: { on: false } } },
  ],
  transaction_contact: [
    { id: 'c1', transaction_id: 't1', name: 'Bob Buyer', email: 'bob@x.com', role: 'buyer', is_client: true, extra: { portal_token: 'tok1' } },
    { id: 'c2', transaction_id: 't1', name: 'Larry Lender', email: 'larry@bank.com', role: 'lender', extra: {} },
    { id: 'c3', transaction_id: 't1', name: 'Tess Title', email: 'tess@title.com', role: 'title / closing attorney', extra: {} },
    { id: 'c4', transaction_id: 't1', name: 'Ike Inspector', email: 'ike@inspect.com', role: 'inspector', extra: {} },
    { id: 'c5', transaction_id: 't1', name: 'Sue Seller', role: 'seller', extra: {} },
  ],
  checklist: [{ id: 'cl1', brokerage_id: 'B1', subject_type: 'transaction', subject_id: 't1', items: [{ id: 'i1', title: 'Order home warranty', assignee_email: 'ann@x.com', due_date: '2026-10-05', status: 'open' }], extra: {} }],
  notification: [], app_secret: [],
};
const { POST } = await import('./fn.mjs');
const run = async (now) => { const r = await POST(new Request('https://gurubroker.app/api/fn/closingDateReminder', { method: 'POST', headers: { 'content-type': 'application/json', 'x-gbh-service': 'hs' }, body: JSON.stringify({ now }) })); return { status: r.status, body: await r.json() }; };
const notes = (email) => __db.notification.filter((n) => n.user_email === email);

// 7am Eastern: morning list for Ann (not Tia, who's in California), no reminders yet.
let r = await run('2026-10-05T11:00:00Z');
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.reminders, 0); assert.equal(r.body.digests, 1);
const list = notes('ann@x.com')[0];
assert.match(list.title, /Today on your deals: 1 overdue, 1 due today, 1 coming up/);
const listMail = emails.find((e) => e.to[0] === 'ann@x.com');
assert.match(listMail.html, /Financing contingency ends/); assert.match(listMail.html, /Order home warranty/); assert.match(listMail.html, /Home inspection/);
assert.ok(!/t2 Elm|t3 Elm/.test(listMail.html), 'done and closed deals stay out');
assert.equal((await run('2026-10-05T11:30:00Z')).body.digests, 0, 'once a day');
assert.equal(notes('tia@x.com').length, 0);

// 9am Eastern: the day's reminders.
emails.length = 0; __db.notification.length = 0;
r = await run('2026-10-05T13:00:00Z');
assert.equal(r.body.reminders, 3, JSON.stringify(r.body)); // inspection tomorrow, closing in 3 days, financing overdue
const ann = notes('ann@x.com').map((n) => n.title).sort();
assert.deepEqual(ann, ['Closing in 3 days · t1 Elm St', 'Home inspection tomorrow · t1 Elm St', 'Overdue: Financing contingency ends · t1 Elm St']);
assert.equal(notes('tia@x.com').length, 3, 'the TC too');
const teamMail = emails.filter((e) => ['ann@x.com', 'tia@x.com'].includes(e.to[0]));
assert.equal(teamMail.length, 4, 'emails for tomorrow and overdue; the 3-day heads-up is app/phone only');
const party = emails.filter((e) => !['ann@x.com', 'tia@x.com'].includes(e.to[0]));
assert.deepEqual(party.map((e) => e.to[0]).sort(), ['bob@x.com', 'bob@x.com', 'ike@inspect.com', 'larry@bank.com', 'tess@title.com']);
const bobInsp = party.find((e) => e.to[0] === 'bob@x.com' && /inspection/i.test(e.subject));
assert.equal(bobInsp.from, 'Ann Agent <noreply@gurubroker.app>'.replace('noreply@gurubroker.app', bobInsp.from.match(/<(.+)>/)[1]));
assert.equal(bobInsp.reply_to, 'ann@x.com'); assert.match(bobInsp.html, /portal\?t=tok1/, 'clients get their portal button');
assert.ok(!party.find((e) => e.to[0] === 'larry@bank.com').html.includes('portal'), 'others do not');
assert.ok(!party.some((e) => /\$|price/i.test(e.html)), 'no prices in party emails');
assert.equal(r.body.party_emails, 5);
const t1 = __db.transaction.find((t) => t.id === 't1');
assert.equal((t1.extra.autopilot_sent || t1.autopilot_sent).length, 5);
assert.ok((t1.extra.autopilot_log || t1.autopilot_log).some((l) => l.audience === 'parties' && l.to.includes('Larry Lender')));

// Same day again: nothing twice.
emails.length = 0;
r = await run('2026-10-05T15:00:00Z');
assert.equal(r.body.reminders, 0); assert.equal(r.body.party_emails, 0); assert.equal(emails.length, 0);

// Brokerage turns off party emails: next day only the team hears about closing.
__db.brokerage_settings[0].extra.autopilot_parties = false;
r = await run('2026-10-07T13:00:00Z');
assert.equal(r.body.party_emails, 0);
assert.ok(r.body.reminders >= 1);
// Contract terms like "10 days after acceptance" become real dates (business days skip weekends).
const { fillRelativeDates } = await import('../../../shared/autopilot.js');
const f = fillRelativeDates({ acceptance_date: '2026-10-02', closing_date: null, inspection_contingency_date: '2026-10-11' }, [
  { field: 'inspection_contingency_date', days: 10, from: 'acceptance' },
  { field: 'earnest_money_due_date', days: 3, from: 'acceptance', business_days: true },
  { field: 'closing_date', days: 30, from: 'acceptance' },
  { field: 'final_walkthrough_date', days: -1, from: 'closing' },
]);
assert.equal(f.dates.inspection_contingency_date, '2026-10-12', 'the AI was a day off; the code fixes it');
assert.equal(f.dates.earnest_money_due_date, '2026-10-07', 'Fri + 3 business days = Wed');
assert.equal(f.dates.closing_date, '2026-11-01'); assert.equal(f.dates.final_walkthrough_date, '2026-10-31', 'chained off the computed closing');
assert.ok(f.computed.includes('final_walkthrough_date'));
console.log('deal autopilot: all checks passed');
