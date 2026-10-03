// Imports, shared by the in-app Import page and the command-line scripts.
//  - Brokermint users: logins, profiles, teams, recruiters, TCs.
//  - Brokermint commission history: closed deals and what each agent paid toward their cap.
//  - Cap starting balances typed in by hand.
//  - Base44 data exports (any table), with files copied off Base44 (deal files kept private).
// Everything is limited to one brokerage, except a full Base44 import by the super admin.

import { adminClient, appUrl } from './base44.js';
import { sendInvite, ownMailReady } from './inviteMail.js';
import { SCHEMA } from '../../src/api/schema.generated.js';
import { capYearStart, r2 } from '../../shared/commission.js';
import { normalizeRole, ROLES } from '../../shared/permissions.generated.js';
import { scopeFolder, storePrivate } from './files.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const now = () => new Date().toISOString();

// ---------------------------------------------------------------------------------------
// Logins

async function profileByEmail(db, email) {
  return (await db.from('profiles').select('*').eq('email', lc(email)).maybeSingle()).data || null;
}

/** Finds or creates the login for an email. Returns { id, created }. */
export async function ensureLogin(db, email, { name, invite, ...opts } = {}) {
  const existing = await profileByEmail(db, email);
  if (existing) return { id: existing.id, created: false, profile: existing };
  const redirectTo = `${appUrl()}/reset-password?welcome=1&next=%2FDashboard`;
  const res = invite
    ? (ownMailReady()
      ? await sendInvite(db, { email: lc(email), redirectTo, fullName: name || '', brokerageId: opts.brokerageId, inviter: opts.inviter }).then((d) => ({ data: d, error: null }), (error) => ({ data: null, error }))
      : await db.auth.admin.inviteUserByEmail(lc(email), { data: { full_name: name || '' }, redirectTo }))
    : await db.auth.admin.createUser({ email: lc(email), email_confirm: true, user_metadata: { full_name: name || '' } });
  if (res.error) {
    // Already has a login but no profile row yet (rare): find it.
    if (/already|registered|exists/i.test(res.error.message)) {
      for (let page = 1; page <= 20; page += 1) {
        const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
        const hit = (data?.users || []).find((u) => lc(u.email) === lc(email));
        if (hit) return { id: hit.id, created: false };
        if (!data?.users?.length) break;
      }
    }
    throw new Error(res.error.message);
  }
  return { id: res.data.user.id, created: true };
}

/** Roles an importer may hand out. Nobody gets super admin; only owners/super admins make owners. */
export function allowedRole(role, actor) {
  if (role === 'super_admin') return actor?.role === 'super_admin' ? 'super_admin' : 'agent';
  const r = ROLES[normalizeRole(String(role || '').toLowerCase())] ? normalizeRole(String(role || '').toLowerCase()) : 'agent';
  if (r === 'owner' && !(actor?.role === 'super_admin' || normalizeRole(actor?.role) === 'owner')) return 'broker';
  return r;
}

const isOwnerOrSuper = (actor) => actor?.role === 'super_admin' || normalizeRole(actor?.role) === 'owner';

/** Why an import may not touch this existing person (null = fine). */
export function blockedReason(current, actor, brokerageId, { full } = {}) {
  if (!current) return null;
  if (current.role === 'super_admin' && actor?.role !== 'super_admin') return 'Is a platform admin';
  if (!full && current.brokerage_id && current.brokerage_id !== brokerageId && actor?.role !== 'super_admin') return 'Already belongs to another brokerage';
  return null;
}

/**
 * The role someone ends up with. Imports never change: the importer's own role, a super
 * admin's role, or (unless an owner is importing) an owner's role. A file without a role
 * keeps the person's current one.
 */
export function roleFor(current, wanted, email, actor) {
  if (current?.role && (lc(email) === lc(actor?.email) || current.role === 'super_admin')) return current.role;
  if (current?.role && normalizeRole(current.role) === 'owner' && !isOwnerOrSuper(actor)) return current.role;
  if (!wanted) return current?.role || 'agent';
  return allowedRole(wanted, actor);
}

/** Marks a write as part of an import, so the database skips notifications and activity rows for it. */
export const importRun = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// What a Brokermint user row may set on a profile.
const PERSON_FIELDS = ['first_name', 'last_name', 'full_name', 'display_name', 'phone', 'personal_company', 'birthday', 'start_date',
  'address', 'city', 'state', 'zip', 'alternate_name', 'annual_cap', 'license_state', 'license_number', 'license_expiration', 'licenses', 'suspended'];
const filled = (v) => v != null && v !== '' && !(Array.isArray(v) && !v.length);

// ---------------------------------------------------------------------------------------
// Brokermint users

export async function importPeople({ people, brokerageId, invite, actor }) {
  const db = adminClient();
  const results = [];
  const run = importRun();
  const { data: teamRows } = await db.from('team').select('*').eq('brokerage_id', brokerageId);
  const teams = new Map((teamRows || []).map((t) => [lc(t.name), t]));
  for (const p of people) {
    const email = lc(p.email);
    if (!email || !email.includes('@')) { results.push({ email, ok: false, error: 'No email' }); continue; }
    try {
      const existing = await profileByEmail(db, email);
      const why = blockedReason(existing, actor, brokerageId);
      if (why) { results.push({ email, ok: false, error: why }); continue; }
      const login = existing ? { id: existing.id, created: false, profile: existing } : await ensureLogin(db, email, { name: p.name, invite, brokerageId, inviter: [actor?.display_name, actor?.full_name].find((v) => v && !String(v).includes('@')) || '' });
      const current = login.profile || (await db.from('profiles').select('*').eq('id', login.id).maybeSingle()).data;
      const why2 = blockedReason(current, actor, brokerageId);
      if (why2) { results.push({ email, ok: false, error: why2 }); continue; }
      let team = null;
      if (p.teamName) {
        team = teams.get(lc(p.teamName));
        if (!team) {
          team = (await db.from('team').insert({ brokerage_id: brokerageId, name: p.teamName, extra: {} }).select('*').single()).data;
          if (team) teams.set(lc(p.teamName), team);
        }
      }
      // Only fields Brokermint has a value for; blanks don't wipe what's already here.
      const prof = Object.fromEntries(Object.entries(p.profile || {}).filter(([k, v]) => PERSON_FIELDS.includes(k) && filled(v)));
      const patch = {
        ...prof,
        role: roleFor(current, p.profile?.role, email, actor),
        brokerage_id: brokerageId,
        team_id: team?.id || current?.team_id || null,
        extra: { ...(current?.extra || {}), imported: true, imported_from: 'brokermint', import_run: run },
      };
      const { error } = await db.from('profiles').update(patch).eq('id', login.id);
      if (error) throw new Error(error.message);
      if (team && patch.role === 'team_leader' && !team.leader_email) {
        await db.from('team').update({ leader_email: email }).eq('id', team.id);
        team.leader_email = email;
      }
      results.push({ email, ok: true, created: login.created, role: patch.role, team: team?.name || null });
    } catch (err) {
      results.push({ email, ok: false, error: err.message });
    }
  }
  return results;
}

/** Recruiters ("Downline") and TCs are given by name in Brokermint; link them to people. */
export async function linkPeople({ links, brokerageId }) {
  const db = adminClient();
  const { data: people } = await db.from('profiles').select('id,email,full_name,display_name,alternate_name,first_name,last_name').eq('brokerage_id', brokerageId);
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const find = (name) => {
    const n = clean(String(name).includes(',') ? String(name).split(',').reverse().join(' ') : name);
    return (people || []).find((p) => [p.full_name, p.display_name, p.alternate_name, `${p.first_name || ''} ${p.last_name || ''}`].some((x) => x && clean(x) === n)) || (people || []).find((p) => lc(p.email) === lc(name));
  };
  let linked = 0; const missing = [];
  for (const l of links) {
    const me = (people || []).find((p) => lc(p.email) === lc(l.email));
    if (!me) continue;
    const patch = {};
    if (l.recruiter) { const r = find(l.recruiter); if (r && r.id !== me.id) patch.sponsor_email = lc(r.email); else if (!r) missing.push(`${l.email}: recruiter "${l.recruiter}"`); }
    if (l.tcName && !/^n\/?a$|^none$/i.test(l.tcName)) { const t = find(l.tcName); if (t) patch.tc_email = lc(t.email); else missing.push(`${l.email}: TC "${l.tcName}"`); }
    if (Object.keys(patch).length) { await db.from('profiles').update(patch).eq('id', me.id); linked += 1; }
  }
  return { linked, missing };
}

// ---------------------------------------------------------------------------------------
// Brokermint commission history and cap starting balances

async function peopleMap(db, brokerageId) {
  const { data } = await db.from('profiles').select('*').eq('brokerage_id', brokerageId);
  return new Map((data || []).map((p) => [lc(p.email), p]));
}

const lines = (gci, cd, net, extra = []) => [
  ...(gci != null ? [{ label: 'Gross commission (GCI)', amount: r2(gci) }] : []),
  { label: 'Paid to brokerage', amount: -r2(cd) },
  ...extra,
  ...(net != null ? [{ label: 'Agent net', amount: r2(net), total: true }] : []),
];

/**
 * rows: [{ agent_email, closed_date, company_dollar, gci, agent_net, property, price, units, revshare, ref }]
 * Creates a paid commission record per row (counts toward that agent's cap year), and with
 * createTransactions, a closed deal per transaction so reports include the history.
 */
export async function importHistory({ rows, brokerageId, createTransactions, batchId, actor }) {
  const db = adminClient();
  const run = importRun();
  const people = await peopleMap(db, brokerageId);
  const keyOf = (r) => `${r.ref ? `ref:${r.ref}` : `${lc(r.property)}|${r.closed_date}`}|${lc(r.agent_email)}`;
  const groupOf = (r) => (r.ref ? `ref:${r.ref}` : `${lc(r.property)}|${r.closed_date}`);
  const keys = rows.map(keyOf);
  const { data: existing } = await db.from('commission_record').select('id, extra').eq('brokerage_id', brokerageId).in('extra->>import_key', keys);
  const seen = new Set((existing || []).map((e) => e.extra?.import_key));
  // Deals: one per transaction (several agents on a deal share it).
  const txByGroup = new Map();
  if (createTransactions) {
    const groups = [...new Set(rows.map(groupOf))];
    const { data: txs } = await db.from('transaction').select('id, extra, agent_email, co_agents').eq('brokerage_id', brokerageId).in('extra->>import_key', groups);
    for (const t of txs || []) txByGroup.set(t.extra.import_key, t);
  }
  const perDealAgents = new Map();
  for (const r of rows) { const g = groupOf(r); perDealAgents.set(g, [...new Set([...(perDealAgents.get(g) || []), lc(r.agent_email)])]); }
  let created = 0; let skipped = 0; const errors = [];
  for (const r of rows) {
    const email = lc(r.agent_email);
    const person = people.get(email);
    if (!person) { errors.push(`${email}: not in this brokerage`); continue; }
    const key = keyOf(r);
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    const g = groupOf(r);
    let tx = txByGroup.get(g);
    if (createTransactions && !tx) {
      const agents = perDealAgents.get(g);
      const ins = {
        brokerage_id: brokerageId, status: 'closed', closed_date: r.closed_date, closing_date: r.closed_date,
        property_address: r.property || 'Imported deal', sale_price: r.price ?? null,
        agent_email: agents[0], agent_name: people.get(agents[0])?.display_name || people.get(agents[0])?.full_name || agents[0],
        co_agents: agents.slice(1).map((e) => ({ email: e, name: people.get(e)?.full_name || e })),
        extra: { imported: true, imported_from: 'brokermint', import_key: g, import_batch: batchId, import_run: run, mls_ref: r.ref || null },
        created_by: lc(actor.email),
      };
      const { data, error } = await db.from('transaction').insert(ins).select('id, extra').single();
      if (error) { errors.push(`${r.property || r.ref}: ${error.message}`); continue; }
      tx = data; txByGroup.set(g, tx);
    }
    const share = 1 / (perDealAgents.get(g)?.length || 1);
    const units = r.units != null ? Number(r.units) : share;
    const capStart = capYearStart(person.cap_start_date || person.start_date, new Date(`${r.closed_date}T12:00:00Z`));
    const net = r.agent_net != null ? r.agent_net : (r.gci != null ? r.gci - r.company_dollar : null);
    const rec = {
      brokerage_id: brokerageId, transaction_id: tx?.id || null, agent_email: email,
      agent_name: person.display_name || person.full_name || email, property_address: r.property || null,
      closed_date: r.closed_date, cap_year_start: capStart, sale_price: r.price ?? null, status: 'paid',
      gross_share: r.gci ?? null, company_dollar: r2(r.company_dollar), agent_net: net != null ? r2(net) : null,
      fees: 0, team_lead: 0, revshare_total: r.revshare ? r2(r.revshare) : 0,
      calc: { source: 'brokermint', units_share: units, volume_share: (Number(r.price) || 0) * share, agent: { lines: lines(r.gci, r.company_dollar, net) } },
      approved_by: lc(actor.email), approved_at: now(),
      extra: { imported: true, import_key: key, import_batch: batchId, import_run: run },
      created_by: lc(actor.email),
    };
    const { error } = await db.from('commission_record').insert(rec);
    if (error) errors.push(`${email} ${r.closed_date}: ${error.message}`); else created += 1;
  }
  return { created, skipped, errors };
}

export async function undoImport({ batchId, brokerageId }) {
  const db = adminClient();
  const { data: recs } = await db.from('commission_record').select('id').eq('brokerage_id', brokerageId).eq('extra->>import_batch', batchId);
  const { data: txs } = await db.from('transaction').select('id').eq('brokerage_id', brokerageId).eq('extra->>import_batch', batchId);
  for (const [table, list] of [['commission_record', recs || []], ['transaction', txs || []]]) {
    for (let i = 0; i < list.length; i += 200) {
      const { error } = await db.from(table).delete().eq('brokerage_id', brokerageId).in('id', list.slice(i, i + 200).map((x) => x.id));
      if (error) throw new Error(error.message);
    }
  }
  return { records: (recs || []).length, deals: (txs || []).length };
}

/** Past history imports, newest first, for the Undo list. */
export async function listImports({ brokerageId }) {
  const db = adminClient();
  const { data } = await db.from('commission_record').select('extra, created_date, agent_email, company_dollar').eq('brokerage_id', brokerageId).eq('extra->>imported', 'true');
  const by = new Map();
  for (const r of data || []) {
    const b = r.extra?.import_batch; if (!b) continue;
    const x = by.get(b) || { batchId: b, records: 0, agents: new Set(), company_dollar: 0, at: r.created_date, opening: !!r.extra?.opening };
    x.records += 1; x.agents.add(r.agent_email); x.company_dollar += Number(r.company_dollar) || 0;
    by.set(b, x);
  }
  return [...by.values()].map((x) => ({ ...x, agents: x.agents.size, company_dollar: r2(x.company_dollar) })).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/**
 * What each agent has already paid toward their cap this cap year in Brokermint, entered
 * by hand. One record per agent per cap year (saving again replaces it).
 */
export async function setStartingBalance({ email, values, brokerageId, actor }) {
  const db = adminClient();
  const person = (await peopleMap(db, brokerageId)).get(lc(email));
  if (!person) throw Object.assign(new Error('Not in this brokerage'), { status: 404 });
  const capStart = capYearStart(person.cap_start_date || person.start_date, new Date());
  const key = `opening|${lc(email)}|${capStart}`;
  await db.from('commission_record').delete().eq('brokerage_id', brokerageId).eq('extra->>import_key', key);
  const cd = Number(values.company_dollar) || 0;
  const gci = values.gci === '' || values.gci == null ? null : Number(values.gci);
  if (!cd && !gci && !Number(values.units) && !Number(values.revshare)) return { removed: true, cap_year_start: capStart };
  const rec = {
    brokerage_id: brokerageId, agent_email: lc(email), agent_name: person.display_name || person.full_name || email,
    property_address: 'Starting balance (carried over from Brokermint)', closed_date: capStart, cap_year_start: capStart,
    status: 'paid', gross_share: gci, company_dollar: r2(cd), agent_net: gci != null ? r2(gci - cd) : null,
    fees: 0, team_lead: 0, revshare_total: r2(Number(values.revshare) || 0),
    calc: { source: 'opening_balance', opening: true, units_share: Number(values.units) || 0, volume_share: Number(values.volume) || 0, agent: { lines: lines(gci, cd, gci != null ? gci - cd : null) } },
    approved_by: lc(actor.email), approved_at: now(),
    extra: { imported: true, opening: true, import_key: key, import_batch: `opening-${capStart}`, import_run: importRun() },
    created_by: lc(actor.email),
  };
  const { error } = await db.from('commission_record').insert(rec);
  if (error) throw new Error(error.message);
  return { saved: true, cap_year_start: capStart };
}

// ---------------------------------------------------------------------------------------
// Base44 exports

const DROP = new Set(['openai_api_key']);
const USER_REFS = ['agent_id', 'sender_id', 'receiver_id', 'account_owner_id', 'user_id', 'to_id', 'from_id'];
const SYSTEM = ['id', 'created_date', 'updated_date', 'created_by'];

export function isBase44FileUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && (/(^|\.)base44\.(app|com)$/i.test(x.hostname) || (/\.supabase\.co$/i.test(x.hostname) && /base44/i.test(x.pathname)));
  } catch { return false; }
}

/** Which private folder a record's files belong in (null = public, e.g. headshots and logos). */
async function folderFor(db, entity, row, brokerageId) {
  const b = row.brokerage_id || brokerageId;
  if (!b) return null;
  try {
    switch (entity) {
      case 'Transaction': return scopeFolder(b, { kind: 'tx', id: row.id });
      case 'ESignDocument': case 'ESignSubmission': case 'ESignTemplate':
        return row.transaction_id ? scopeFolder(b, { kind: 'tx', id: row.transaction_id }) : scopeFolder(b, { kind: 'misc' });
      case 'DirectMessage': return scopeFolder(b, { kind: 'dm', emails: [row.sender_email, row.receiver_email] });
      case 'GroupMessage': return scopeFolder(b, { kind: 'group', id: row.group_id });
      case 'SocialMessage': return scopeFolder(b, { kind: 'channel', name: row.channel });
      case 'ThreadReply': {
        const { data } = await db.from('social_message').select('channel').eq('id', row.message_id).maybeSingle();
        return data ? scopeFolder(b, { kind: 'channel', name: data.channel }) : scopeFolder(b, { kind: 'misc' });
      }
      case 'GeneratedContract': case 'CMAsReport': case 'FileRepository': case 'Message': case 'Conversation': case 'SignatureData':
        return scopeFolder(b, { kind: 'misc' });
      default: return null;
    }
  } catch { return null; }
}

const outOfTime = () => Object.assign(new Error('Out of time'), { outOfTime: true });

async function rehost(db, url, folder, cache, report) {
  const k = `${folder || 'public'}|${url}`;
  if (cache.has(k)) return cache.get(k);
  let out = url;
  // Stop before the server's time limit; the row is sent again in the next batch.
  const left = (report.hardLimit || Infinity) - Date.now();
  if (left < 3000) throw outOfTime();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), Math.min(20000, left - 1000));
    let res; let bytes;
    try {
      res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      bytes = new Uint8Array(await res.arrayBuffer());
    } finally { clearTimeout(t); }
    if (Date.now() > (report.hardLimit || Infinity) - 1500) throw outOfTime();
    if (bytes.length > 50 * 1024 * 1024) throw new Error('over 50 MB');
    const type = res.headers.get('content-type') || 'application/octet-stream';
    const name = decodeURIComponent(new URL(url).pathname.split('/').pop() || 'file').replace(/^[0-9a-f-]{20,}_/i, '');
    if (folder) out = await storePrivate(folder, name, bytes, type);
    else {
      const path = `imported/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${name.replace(/[^\w.-]+/g, '_').slice(-80)}`;
      const { error } = await db.storage.from('public-files').upload(path, bytes, { contentType: type });
      if (error) throw new Error(error.message);
      out = db.storage.from('public-files').getPublicUrl(path).data.publicUrl;
    }
    report.copied += 1;
  } catch (err) {
    if (err.outOfTime || Date.now() > (report.hardLimit || Infinity) - 1500) throw outOfTime();
    report.failedFiles.push(`${url} (${err.message})`);
  }
  cache.set(k, out);
  return out;
}

async function walk(db, value, folder, cache, report) {
  if (typeof value === 'string') {
    if (isBase44FileUrl(value)) return rehost(db, value, folder, cache, report);
    if (value.startsWith('/') && /\.(pdf|png|jpe?g|docx?)$/i.test(value)) report.privateBase44.push(value);
    // Chat messages hold "[file]<url>|type|name".
    const m = value.match(/^\[(file|voice_memo)\](https:[^|]+)(.*)$/);
    if (m && isBase44FileUrl(m[2])) return `[${m[1]}]${await rehost(db, m[2], folder, cache, report)}${m[3]}`;
    return value;
  }
  if (Array.isArray(value)) { const out = []; for (const v of value) out.push(await walk(db, v, folder, cache, report)); return out; }
  if (value && typeof value === 'object') { const out = {}; for (const [k, v] of Object.entries(value)) out[k] = await walk(db, v, folder, cache, report); return out; }
  return value;
}

function toRow(entity, rec, userIdMap) {
  const def = SCHEMA[entity];
  const cols = new Set(def.columns);
  const typed = new Set(def.typed || []);
  const row = { extra: {} };
  for (const [k, v0] of Object.entries(rec)) {
    if (DROP.has(k) || k.startsWith('_')) continue;
    let v = v0;
    if (USER_REFS.includes(k) && userIdMap.has(v)) v = userIdMap.get(v);
    if (cols.has(k)) row[k] = v === '' && typed.has(k) ? null : v;
    else row.extra[k] = v;
  }
  for (const k of SYSTEM) if (rec[k] == null) delete row[k];
  return row;
}

/**
 * Imports one batch of one Base44 table. `brokerageId` limits everything to that brokerage
 * (null only for the super admin's full import). Stops early near the time limit and says
 * how many rows it got through, so the page can send the rest.
 */
export async function importBase44Batch({ entity, rows, brokerageId, actor, copyFiles = true, deadline = Date.now() + 45000, hardLimit = deadline + 10000 }) {
  const db = adminClient();
  const full = actor.role === 'super_admin' && !brokerageId;
  const report = { entity, imported: 0, skipped: 0, processed: 0, copied: 0, failedFiles: [], privateBase44: [], notes: [] };
  // Rows start until `deadline`; copying a row's files stops at `hardLimit` (the row is then
  // left for the next batch).
  Object.defineProperty(report, 'hardLimit', { value: hardLimit, enumerable: false });
  const cache = new Map();
  const run = importRun();
  if (entity !== 'User' && !SCHEMA[entity]) { report.notes.push(`No "${entity}" table in the new app; skipped.`); report.processed = rows.length; report.skipped = rows.length; return report; }

  if (entity === 'User') {
    for (const u0 of rows) {
      if (Date.now() > deadline) break;
      report.processed += 1;
      const email = lc(u0.email);
      if (!email) { report.skipped += 1; continue; }
      if (!full && u0.brokerage_id && u0.brokerage_id !== brokerageId) { report.skipped += 1; continue; }
      try {
        const existing = await profileByEmail(db, email);
        const why = blockedReason(existing, actor, brokerageId, { full });
        if (why) { report.skipped += 1; report.notes.push(`${email}: ${why}`); continue; }
        const login = existing ? { id: existing.id, created: false, profile: existing } : await ensureLogin(db, email, { name: u0.full_name });
        const current = login.profile || (await db.from('profiles').select('*').eq('id', login.id).maybeSingle()).data;
        const u = copyFiles ? await walk(db, u0, null, cache, report) : u0;
        const { id, created_by, email: _e, ...rest } = u;
        const row = toRow('User', rest, new Map());
        row.extra = { ...(current?.extra || {}), ...row.extra, legacy_id: u0.id, imported: true, imported_from: 'base44', import_run: run };
        row.role = roleFor(current, row.role, email, actor);
        if (!full) row.brokerage_id = brokerageId;
        const { error } = await db.from('profiles').update(row).eq('id', login.id);
        if (error) throw new Error(error.message);
        report.imported += 1;
      } catch (err) {
        if (err.outOfTime) { report.processed -= 1; break; }
        report.skipped += 1; report.notes.push(`${email}: ${err.message}`);
      }
    }
    return report;
  }

  const def = SCHEMA[entity];
  const hasBrokerage = def.columns.includes('brokerage_id');
  if (!full && !hasBrokerage && entity !== 'Brokerage') {
    report.processed = rows.length; report.skipped = rows.length;
    report.notes.push(`${entity} isn't tied to a brokerage; only the super admin's full import brings it over.`);
    return report;
  }
  // Old Base44 user ids -> new login ids.
  const refs = [...new Set(rows.flatMap((r) => USER_REFS.map((k) => r[k]).filter(Boolean)))];
  const userIdMap = new Map();
  if (refs.length) {
    const { data } = await db.from('profiles').select('id, extra').in('extra->>legacy_id', refs);
    for (const p of data || []) userIdMap.set(p.extra.legacy_id, p.id);
  }
  // Never overwrite another brokerage's records.
  const ids = rows.map((r) => r.id).filter(Boolean);
  const owner = new Map();
  if (!full && ids.length) {
    const { data } = await db.from(def.table).select(hasBrokerage ? 'id, brokerage_id' : 'id').in('id', ids);
    for (const e of data || []) owner.set(e.id, entity === 'Brokerage' ? e.id : e.brokerage_id);
  }
  const out = [];
  for (const r0 of rows) {
    if (Date.now() > deadline) break;
    report.processed += 1;
    if (!full) {
      if (entity === 'Brokerage' && r0.id !== brokerageId) { report.skipped += 1; continue; }
      if (hasBrokerage && r0.brokerage_id && r0.brokerage_id !== brokerageId) { report.skipped += 1; continue; }
      if (owner.has(r0.id) && owner.get(r0.id) != null && owner.get(r0.id) !== brokerageId) { report.skipped += 1; continue; }
    }
    const r1 = { ...r0, ...(!full && hasBrokerage ? { brokerage_id: brokerageId } : {}) };
    // The platform decides a brokerage's status and owner, not its data file.
    if (!full && entity === 'Brokerage') { delete r1.status; delete r1.account_owner_id; }
    let r = r1;
    if (copyFiles) {
      try { r = await walk(db, r1, await folderFor(db, entity, r1, brokerageId), cache, report); }
      catch (err) { if (err.outOfTime) { report.processed -= 1; break; } throw err; }
    }
    const row = toRow(entity, r, userIdMap);
    row.extra = { ...(row.extra || {}), imported: true, import_run: run };
    out.push(row);
  }
  for (let i = 0; i < out.length; i += 200) {
    const { error } = await db.from(def.table).upsert(out.slice(i, i + 200), { onConflict: 'id' });
    if (error) { report.notes.push(`${entity}: ${error.message}`); report.skipped += out.slice(i, i + 200).length; } else report.imported += out.slice(i, i + 200).length;
  }
  return report;
}
