// Import page: Brokermint people (roles kept safe, other brokerages untouched), Brokermint
// cap history (deduped, cap years, undo), starting balances feeding the cap, and Base44
// tables (scoped to the brokerage, files copied, deal files private).
import assert from 'node:assert/strict';
import { parseCsv, brokermintPerson, autoMapHistory, buildHistory } from '../../../shared/importers.js';

Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => {
  url = String(url);
  if (url.includes('missing')) return new Response('nope', { status: 404 });
  if (url.includes('base44.app')) return new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': url.endsWith('.png') ? 'image/png' : 'application/pdf' } });
  throw new Error(`unexpected ${url}`);
};
globalThis.__users = {
  boss: { id: 'u3', email: 'boss@x.com' }, brk: { id: 'u4', email: 'brk@x.com' }, acct: { id: 'u5', email: 'acct@x.com' },
  ann: { id: 'u1', email: 'ann@x.com' }, eve: { id: 'u9', email: 'eve@other.com' }, sa: { id: 'u0', email: 'sa@x.com' },
};
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'sa@x.com', full_name: 'Sam Admin', role: 'super_admin', brokerage_id: null, extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', phone: '555-0000', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u4', email: 'brk@x.com', full_name: 'Bree Broker', role: 'broker', brokerage_id: 'B1', extra: {} },
    { id: 'u5', email: 'acct@x.com', full_name: 'Al Accounting', role: 'office_admin', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@other.com', full_name: 'Eve', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  brokerage: [{ id: 'B1', name: 'Guru', status: 'active', account_owner_id: 'u3', extra: {} }, { id: 'B2', name: 'Other Realty', status: 'active', extra: {} }],
  commission_plan: [{ id: 'p1', brokerage_id: 'B1', name: '80/20 $20k cap', is_default: true, config: { split: { agent_pct: 80 }, cap: { amount: 20000 } }, extra: {} }],
  transaction: [{ id: 'b2tx', brokerage_id: 'B2', property_address: 'Theirs', extra: {} }],
};
const db = globalThis.__db;
const { POST } = await import('./fn.mjs');
const as = (tok) => async (name, body = {}) => {
  const r = await POST(new Request(`https://gurubroker.app/api/fn/${name}`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) }));
  return { status: r.status, body: await r.json() };
};
const prof = (email) => db.profiles.find((p) => p.email === email);

// ---------------------------------------------------------------------------------------
// Brokermint users

const usersCsv = `First Name,Last Name,Email,Role,Team,Anniversary Date,Annual Cap,Downline,TC,Phone,State of licensure,License #,License expiration,Status
Stacy,Smith,Stacy@X.com,Agent,Smith Team,03/15/2021,"$18,000",Ann Lee,Tina Coord,555-1111,CT,RES.123,12/31/2026,Active
Tina,Coord,tina@x.com,Transaction Coordinator,,01/02/2020,,,,,,,,Active
Ann,Lee,ann@x.com,Team Leader,Smith Team,06/01/2019,,,,,,,,Active
Boss,Person,boss@x.com,Agent,,,,,,,,,,Active
Eve,Other,eve@other.com,Agent,,,,,,,,,,Active
Sam,Admin,sa@x.com,Agent,,,,,,,,,,Active
Olive,Owner,olive@x.com,Owner,,,,,,,,,,Active
Gone,Person,gone@x.com,Agent,,,,,,,,,,Inactive
No,Role,norole@x.com,,,,,,,,,,,Active
No,Email,,Agent,,,,,,,,,,Active`;
const people = parseCsv(usersCsv).rows.map(brokermintPerson).filter((p) => p.email);
assert.equal(people.length, 9);
assert.equal(people[0].email, 'stacy@x.com');
assert.deepEqual(people[0].profile.licenses, [{ state: 'CT', number: 'RES.123', expiration: '2026-12-31' }]);
assert.equal(people.find((p) => p.email === 'norole@x.com').profile.role, null, 'no role in the file');

let r = await as('ann')('importPeople', { action: 'import', people });
assert.equal(r.status, 403, 'agents cannot import');
r = await as('acct')('importPeople', { action: 'import', people });
assert.equal(r.status, 403, 'only the owner or broker imports people');
r = await as('sa')('importPeople', { action: 'import', people });
assert.equal(r.status, 400, 'super admin must pick a brokerage');

r = await as('boss')('importPeople', { action: 'import', invite: true, people });
assert.equal(r.status, 200, JSON.stringify(r.body));
const res = Object.fromEntries(r.body.results.map((x) => [x.email, x]));
assert.equal(res['stacy@x.com'].ok, true); assert.equal(res['stacy@x.com'].created, true);
assert.equal(res['tina@x.com'].role, 'tc');
assert.equal(res['ann@x.com'].role, 'team_leader');
assert.equal(res['boss@x.com'].role, 'owner', "the importer's own role never changes");
assert.equal(res['eve@other.com'].ok, false); assert.match(res['eve@other.com'].error, /another brokerage/);
assert.equal(res['sa@x.com'].ok, false); assert.match(res['sa@x.com'].error, /platform admin/);
assert.equal(prof('sa@x.com').role, 'super_admin'); assert.equal(prof('sa@x.com').brokerage_id, null);
assert.equal(prof('eve@other.com').brokerage_id, 'B2');
assert.equal(res['olive@x.com'].role, 'owner', 'an owner may add owners');
assert.equal(prof('norole@x.com').role, 'user', 'no role in the file: new people are agents');
const stacy = prof('stacy@x.com');
assert.equal(stacy.brokerage_id, 'B1'); assert.equal(stacy.start_date, '2021-03-15'); assert.equal(stacy.annual_cap, 18000);
assert.equal(stacy.license_number, 'RES.123'); assert.equal(stacy.license_expiration, '2026-12-31'); assert.equal(stacy.phone, '555-1111');
assert.equal(stacy.extra.imported, true); assert.ok(stacy.extra.import_run, 'import writes are marked so the database skips notifications');
assert.equal(prof('gone@x.com').suspended, true);
assert.equal(prof('ann@x.com').phone, '555-0000', 'blank cells keep what is already there');
assert.equal(prof('ann@x.com').full_name, 'Ann Lee');
const teams = db.team.filter((t) => t.brokerage_id === 'B1');
assert.equal(teams.length, 1, 'one team, made once');
assert.equal(stacy.team_id, teams[0].id); assert.equal(prof('ann@x.com').team_id, teams[0].id);
assert.equal(teams[0].leader_email, 'ann@x.com');
const invited = (globalThis.__invites || []).map((i) => i.email).sort();
assert.deepEqual(invited, ['gone@x.com', 'norole@x.com', 'olive@x.com', 'stacy@x.com', 'tina@x.com'], 'only new people get invites');
assert.match(globalThis.__invites[0].redirectTo, /^https:\/\/gurubroker\.app\/reset-password/);

// Running it again updates instead of duplicating.
r = await as('boss')('importPeople', { action: 'import', people });
assert.equal(r.body.results.filter((x) => x.created).length, 0);
assert.equal(db.profiles.filter((p) => p.email === 'stacy@x.com').length, 1);

// A broker can't make owners or change an owner's role.
r = await as('brk')('importPeople', { action: 'import', people: parseCsv(`Email,Role,First Name,Last Name
olive2@x.com,Owner,Olive,Two
boss@x.com,Agent,Boss,Person
brk@x.com,Agent,Bree,Broker
tina@x.com,,Tina,Coord`).rows.map(brokermintPerson) });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(prof('olive2@x.com').role, 'broker');
assert.equal(prof('boss@x.com').role, 'owner');
assert.equal(prof('brk@x.com').role, 'broker');
assert.equal(prof('tina@x.com').role, 'tc', 'no role in the file keeps the current role');

// Extra fields from the page are ignored (no changing ids, emails or permissions).
r = await as('boss')('importPeople', { action: 'import', people: [{ email: 'ann@x.com', name: 'Ann Lee', profile: { id: 'hijack', email: 'boss@x.com', permissions: { 'tx.all': true }, role: 'team_leader' } }] });
assert.equal(r.status, 200);
assert.ok(prof('ann@x.com')); assert.equal(prof('ann@x.com').id, 'u1'); assert.equal(prof('ann@x.com').permissions, undefined);

// Recruiters ("Downline") and TCs by name.
r = await as('boss')('importPeople', { action: 'link', links: people.map((p) => ({ email: p.email, recruiter: p.recruiter, tcName: p.tcName })).concat([{ email: 'tina@x.com', recruiter: 'Nobody Here' }]) });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(prof('stacy@x.com').sponsor_email, 'ann@x.com');
assert.equal(prof('stacy@x.com').tc_email, 'tina@x.com');
assert.deepEqual(r.body.missing, ['tina@x.com: recruiter "Nobody Here"']);

// ---------------------------------------------------------------------------------------
// Brokermint cap history

globalThis.__users.stacy = { id: prof('stacy@x.com').id, email: 'stacy@x.com' };
globalThis.__users.tina = { id: prof('tina@x.com').id, email: 'tina@x.com' };
const historyCsv = `Transaction ID,Property Address,Closing Date,Agent,Sale Price,GCI,Company Dollar,Agent Net
T-100,1 Main St,2026-04-10,Stacy Smith,"$500,000","$15,000","$3,000","$12,000"
T-100,1 Main St,2026-04-10,"Lee, Ann","$500,000","$5,000","$1,000","$4,000"
T-101,2 Oak Ave,03/01/2021,stacy@x.com,"$300,000","$9,000","$1,800","$7,200"
T-102,3 Pine Rd,2026-02-01,Unknown Person,"$100,000","$3,000","$600","$2,400"
T-103,4 Elm Ct,2026-05-05,Tina Coord,"$100,000","$3,000",,"$3,000"
,,,,,,TOTAL,`;
const parsed = parseCsv(historyCsv);
const map = autoMapHistory(parsed.headers);
assert.deepEqual(map, { agent: 'Agent', closed_date: 'Closing Date', company_dollar: 'Company Dollar', gci: 'GCI', agent_net: 'Agent Net', property: 'Property Address', price: 'Sale Price', ref: 'Transaction ID' });
const b1 = db.profiles.filter((p) => p.brokerage_id === 'B1');
let built = buildHistory(parsed.rows, map, b1);
assert.deepEqual(built.unmatched, [{ name: 'Unknown Person', count: 1 }]);
assert.deepEqual(built.problems, ['Row 6: no brokerage amount']);
assert.equal(built.rows.length, 3);
built = buildHistory(parsed.rows, map, b1, { 'Unknown Person': 'TINA@x.com' });
assert.equal(built.rows.length, 4, 'picking the agent by hand brings the row in');
assert.equal(built.rows[3].agent_email, 'tina@x.com');

r = await as('ann')('importHistory', { action: 'import', batchId: 'bm-test1', rows: built.rows });
assert.equal(r.status, 403);
r = await as('acct')('importHistory', { action: 'import', batchId: 'bad id!', rows: built.rows });
assert.equal(r.status, 400);
r = await as('acct')('importHistory', { action: 'import', batchId: 'bm-test1', createTransactions: true, rows: built.rows });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body, { created: 4, skipped: 0, errors: [] });
const recs = (email) => db.commission_record.filter((x) => x.agent_email === email);
const s100 = recs('stacy@x.com').find((x) => x.closed_date === '2026-04-10');
assert.equal(s100.cap_year_start, '2026-03-15'); assert.equal(s100.company_dollar, 3000); assert.equal(s100.status, 'paid');
assert.equal(s100.calc.units_share, 0.5, 'two agents on the deal share it');
assert.equal(recs('stacy@x.com').find((x) => x.closed_date === '2021-03-01').cap_year_start, '2020-03-15', 'before her anniversary: the previous cap year');
assert.equal(recs('ann@x.com')[0].cap_year_start, '2025-06-01');
assert.equal(recs('tina@x.com')[0].cap_year_start, '2026-01-02');
const deals = db.transaction.filter((t) => t.extra?.import_batch === 'bm-test1');
assert.equal(deals.length, 3, 'one deal per transaction');
const t100 = deals.find((t) => t.property_address === '1 Main St');
assert.equal(t100.status, 'closed'); assert.equal(t100.agent_email, 'stacy@x.com'); assert.deepEqual(t100.co_agents.map((a) => a.email), ['ann@x.com']);
assert.equal(s100.transaction_id, t100.id);
assert.ok(t100.extra.imported && t100.extra.import_run);

r = await as('acct')('importHistory', { action: 'import', batchId: 'bm-test2', createTransactions: true, rows: built.rows });
assert.deepEqual(r.body, { created: 0, skipped: 4, errors: [] }, 'running the same file again adds nothing');
assert.equal(db.transaction.filter((t) => t.extra?.imported_from === 'brokermint').length, 3);

r = await as('eve')('importHistory', { action: 'import', batchId: 'bm-eve', rows: built.rows });
assert.equal(r.body.created, 0); assert.match(r.body.errors[0], /not in this brokerage/);

// Her cap this year counts the Brokermint money.
r = await as('stacy')('myCommission');
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.cap_year_start, '2026-03-15');
assert.equal(r.body.ytd.company_dollar, 3000);
assert.equal(r.body.cap, 18000, 'her own annual cap from Brokermint');
assert.equal(r.body.remaining, 15000);

// The imported deal's commission was paid in Brokermint: it can't be saved again here.
r = await as('boss')('commissionFinalize', { transactionId: t100.id });
assert.equal(r.status, 409, JSON.stringify(r.body));
assert.equal(db.payout?.length || 0, 0);

r = await as('acct')('importHistory', { action: 'list' });
assert.equal(r.body.imports.length, 1);
assert.equal(r.body.imports[0].batchId, 'bm-test1'); assert.equal(r.body.imports[0].records, 4); assert.equal(r.body.imports[0].agents, 3);
assert.equal(r.body.imports[0].company_dollar, 6400);

// Undo removes that import's records and deals only.
db.commission_record.push({ id: 'keep', brokerage_id: 'B1', agent_email: 'ann@x.com', status: 'approved', company_dollar: 10, cap_year_start: '2025-06-01', extra: {} });
r = await as('eve')('importHistory', { action: 'undo', batchId: 'bm-test1' });
assert.deepEqual(r.body, { records: 0, deals: 0 }, "another brokerage can't undo it");
r = await as('acct')('importHistory', { action: 'undo', batchId: 'bm-test1' });
assert.deepEqual(r.body, { records: 4, deals: 3 });
assert.equal(db.commission_record.length, 1); assert.equal(db.commission_record[0].id, 'keep');
assert.equal(db.transaction.filter((t) => t.extra?.imported_from === 'brokermint').length, 0);
assert.ok(db.transaction.find((t) => t.id === 'b2tx'));

// ---------------------------------------------------------------------------------------
// Starting balances (typed in by hand)

r = await as('acct')('importHistory', { action: 'balance', email: 'tina@x.com', values: { company_dollar: '4500', gci: '30000', units: '6' } });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body, { saved: true, cap_year_start: '2026-01-02' });
r = await as('acct')('importHistory', { action: 'balance', email: 'tina@x.com', values: { company_dollar: '5000', gci: '31000', units: '7' } });
assert.equal(recs('tina@x.com').length, 1, 'saving again replaces it');
r = await as('tina')('myCommission');
assert.equal(r.body.ytd.company_dollar, 5000); assert.equal(r.body.ytd.gci, 31000); assert.equal(r.body.ytd.units, 7);
r = await as('acct')('importHistory', { action: 'balances' });
const tinaRow = r.body.agents.find((a) => a.email === 'tina@x.com');
assert.equal(tinaRow.paid, 5000); assert.equal(tinaRow.cap, 20000); assert.deepEqual(tinaRow.opening, { company_dollar: 5000, gci: 31000, units: 7, revshare: 0 });
assert.ok(!r.body.agents.some((a) => a.email === 'gone@x.com'), 'suspended people are left out');
r = await as('acct')('importHistory', { action: 'balance', email: 'eve@other.com', values: { company_dollar: '1' } });
assert.equal(r.status, 404);
r = await as('acct')('importHistory', { action: 'balance', email: 'tina@x.com', values: { company_dollar: '' } });
assert.equal(r.body.removed, true); assert.equal(recs('tina@x.com').length, 0);

// ---------------------------------------------------------------------------------------
// Base44 tables

r = await as('acct')('importBase44', { entity: 'Transaction', rows: [] });
assert.equal(r.status, 403, 'owner or broker only');
r = await as('boss')('importBase44', { entity: 'User', copyFiles: true, rows: [
  { id: 'legacyU1', email: 'Stacy@x.com', full_name: 'Stacy Smith', role: 'admin', brokerage_id: 'B1', headshot: 'https://base44.app/api/apps/a1/files/public/h1/headshot.png', created_date: '2023-02-02T00:00:00.000Z' },
  { id: 'legacyU2', email: 'sa@x.com', role: 'user' },
  { id: 'legacyU3', email: 'newbie@x.com', full_name: 'New Bie', role: 'super_admin', brokerage_id: 'B1' },
  { id: 'legacyU4', email: 'eve@other.com', role: 'user' },
  { id: 'legacyU5', email: 'x@x.com', brokerage_id: 'B2' },
  { id: 'legacyU6', email: 'boss@x.com', role: 'user', brokerage_id: 'B1' },
] });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.imported, 3); assert.equal(r.body.skipped, 3); assert.equal(r.body.processed, 6);
assert.equal(prof('stacy@x.com').role, 'office_admin');
assert.match(prof('stacy@x.com').headshot, /^https:\/\/storage\.test\/public-files\/imported\/.+headshot\.png$/, 'headshots stay public');
assert.equal(prof('stacy@x.com').extra.legacy_id, 'legacyU1');
assert.equal(prof('newbie@x.com').role, 'agent', 'nobody becomes a platform admin from a file');
assert.equal(prof('boss@x.com').role, 'owner');
assert.equal(prof('sa@x.com').role, 'super_admin');
assert.equal(prof('eve@other.com').brokerage_id, 'B2');
assert.equal(prof('x@x.com'), undefined);

r = await as('boss')('importBase44', { entity: 'Transaction', copyFiles: true, rows: [
  { id: 'b44tx1', brokerage_id: 'B1', property_address: '9 Elm', status: 'active', agent_email: 'stacy@x.com', agent_id: 'legacyU1', created_date: '2024-01-01T00:00:00.000Z',
    documents: [{ name: 'psa.pdf', url: 'https://base44.app/api/apps/a1/files/public/d1/psa.pdf' }, { name: 'gone.pdf', url: 'https://base44.app/api/apps/a1/files/public/d9/missing.pdf' }] },
  { id: 'b44tx2', brokerage_id: 'B2', property_address: 'Not ours' },
  { id: 'b2tx', property_address: 'Hijack' },
] });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.imported, 1); assert.equal(r.body.skipped, 2); assert.equal(r.body.copied, 1); assert.equal(r.body.failedFiles.length, 1);
const tx1 = db.transaction.find((t) => t.id === 'b44tx1');
assert.equal(tx1.brokerage_id, 'B1'); assert.equal(tx1.created_date, '2024-01-01T00:00:00.000Z'); assert.ok(tx1.extra.imported && tx1.extra.import_run);
assert.match(tx1.documents[0].url, /^\/api\/file\?p=scoped%2FB1%2Ftx%2Fb44tx1%2F[a-z0-9]+-[a-z0-9]+-psa\.pdf$/, 'deal files go to the deal\'s private folder');
assert.ok(globalThis.__storage[`private-files/${decodeURIComponent(tx1.documents[0].url.split('p=')[1])}`]);
assert.equal(tx1.documents[1].url, 'https://base44.app/api/apps/a1/files/public/d9/missing.pdf', 'files that fail keep their old link');
assert.equal(tx1.agent_id ?? tx1.extra.agent_id, prof('stacy@x.com').id, 'old Base44 user ids point at the new logins');
assert.equal(db.transaction.find((t) => t.id === 'b2tx').property_address, 'Theirs', "another brokerage's record is never overwritten");
assert.ok(!db.transaction.find((t) => t.id === 'b44tx2'));

r = await as('boss')('importBase44', { entity: 'DirectMessage', rows: [
  { id: 'dm1', brokerage_id: 'B1', sender_email: 'ann@x.com', receiver_email: 'stacy@x.com', read: true, content: '[file]https://base44.app/api/apps/a1/files/public/d2/pic.png|image/png|pic.png' },
] });
const dm = db.direct_message.find((m) => m.id === 'dm1');
assert.match(dm.content, /^\[file\]\/api\/file\?p=scoped%2FB1%2Fdm%2F[^|]+\|image\/png\|pic\.png$/, 'chat files go to the conversation\'s private folder');

r = await as('boss')('importBase44', { entity: 'Brokerage', rows: [{ id: 'B1', name: 'Guru Realty', status: 'suspended', account_owner_id: 'legacyU3' }, { id: 'B2', name: 'Hijack' }] });
assert.equal(r.body.imported, 1);
const B1 = db.brokerage.find((b) => b.id === 'B1');
assert.equal(B1.name, 'Guru Realty'); assert.equal(B1.status, 'active'); assert.equal(B1.account_owner_id, 'u3');
assert.equal(db.brokerage.find((b) => b.id === 'B2').name, 'Other Realty');

r = await as('boss')('importBase44', { entity: 'IdeaPadNote', rows: [{ id: 'n1' }] });
assert.equal(r.body.imported, 0); assert.equal(r.body.processed, 1); assert.match(r.body.notes[0], /only the super admin/);
r = await as('boss')('importBase44', { entity: 'Nope', rows: [{ id: 'n1' }] });
assert.match(r.body.notes[0], /No "Nope" table/);

// "All brokerages" is the super admin's alone.
r = await as('boss')('importBase44', { entity: 'Transaction', all_brokerages: true, rows: [{ id: 'b44tx9', brokerage_id: 'B2', property_address: 'Far away' }] });
assert.equal(r.body.imported, 0);
r = await as('sa')('importBase44', { entity: 'Transaction', all_brokerages: true, rows: [{ id: 'b44tx9', brokerage_id: 'B2', property_address: 'Far away' }] });
assert.equal(r.body.imported, 1);
assert.equal(db.transaction.find((t) => t.id === 'b44tx9').brokerage_id, 'B2');

// Big imports: copying a row's files stops before the server's time limit, and that row is
// left for the next batch instead of being skipped.
const { importBase44Batch } = await import('./importers.mjs');
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => (String(url).includes('slow') ? new Promise((resolve, reject) => {
  const t = setTimeout(() => resolve(new Response(new Uint8Array([1]))), 30000);
  init?.signal?.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('aborted'), { name: 'AbortError' })); });
}) : realFetch(url, init));
const start = Date.now();
const rep = await importBase44Batch({ entity: 'Transaction', brokerageId: 'B1', actor: { role: 'owner', email: 'boss@x.com' }, deadline: start + 1000, hardLimit: start + 3500, rows: [
  { id: 'slow1', brokerage_id: 'B1', property_address: 'Slow', documents: [{ url: 'https://base44.app/api/apps/a1/files/public/s/slow.pdf' }] },
  { id: 'slow2', brokerage_id: 'B1', property_address: 'Next' },
] });
assert.ok(Date.now() - start < 3500, 'stops before the limit');
assert.equal(rep.processed, 0, 'the unfinished row is sent again next time');
assert.equal(rep.imported, 0); assert.equal(rep.failedFiles.length, 0);
assert.ok(!db.transaction.find((t) => t.id === 'slow1'));
assert.equal(JSON.parse(JSON.stringify(rep)).hardLimit, undefined);
globalThis.fetch = realFetch;

console.log('Imports: all checks passed');
