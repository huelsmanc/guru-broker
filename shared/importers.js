// Reading import files. Used in the browser (preview and column mapping on the Import page)
// and on the server and command-line scripts, so everyone reads files the same way.

/** CSV text -> { headers, rows } where rows are objects keyed by the original headers. */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const out = [];
  let row = []; let field = ''; let q = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i += 1; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) out.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((x) => x !== '')) out.push(row); }
  const [head = [], ...body] = out;
  const headers = head.map((h, i) => String(h).trim() || `Column ${i + 1}`);
  return { headers, rows: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) };
}

/** Base44 CSV cells hold JSON for lists/objects and "true"/"false" for yes/no. */
export function cleanBase44Values(r) {
  const out = {};
  for (const [k, v] of Object.entries(r)) {
    if (typeof v !== 'string') { out[k] = v; continue; }
    const t = v.trim();
    if (t === '') { out[k] = null; continue; }
    if ((t.startsWith('[') && t.endsWith(']')) || (t.startsWith('{') && t.endsWith('}'))) {
      try { out[k] = JSON.parse(t); continue; } catch { /* keep text */ }
    }
    if (t === 'true' || t === 'false') { out[k] = t === 'true'; continue; }
    out[k] = v;
  }
  return out;
}

/** Base44 export file contents (CSV or JSON) -> array of records. */
export function readBase44File(name, text) {
  const t = String(text || '').replace(/^﻿/, '');
  if (/\.json$/i.test(name) || /^\s*[[{]/.test(t)) {
    const data = JSON.parse(t);
    return (Array.isArray(data) ? data : data.data || data.items || data.records || []).map(cleanBase44Values);
  }
  return parseCsv(t).rows.map(cleanBase44Values);
}

export const normKey = (k) => String(k || '').trim().toLowerCase().replace(/[^a-z0-9#()]+/g, ' ').trim();

export function parseMoney(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/[$\s]/g, ''));
  const n = Number(s.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || s.replace(/[^0-9]/g, '') === '') return null;
  return neg ? -n : n;
}

/** Dates as Brokermint and spreadsheets write them -> YYYY-MM-DD (US month/day order). */
export function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? (Number(m[3]) > 70 ? `19${m[3]}` : `20${m[3]}`) : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------------------
// Brokermint users export (Settings -> Users -> export)

const ROLE = {
  'team leader': 'team_leader', 'team lead': 'team_leader', tc: 'tc', 'transaction coordinator': 'tc', owner: 'owner', broker: 'broker',
  'office administrator': 'office_admin', 'office admin': 'office_admin', admin: 'office_admin', administrator: 'office_admin', agent: 'agent',
};

/** One row of the Brokermint users CSV -> what we import. */
export function brokermintPerson(raw) {
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [normKey(k), String(v ?? '').trim()]));
  const pick = (...names) => { for (const n of names) if (r[n]) return r[n]; return ''; };
  const email = pick('email', 'e mail', 'email address').toLowerCase();
  const first = pick('first name'); const last = pick('last name');
  const name = pick('name', 'full name') || `${first} ${last}`.trim();
  const licenses = [];
  for (const n of ['', ' (2)', ' (3)', ' (4)']) {
    const st = pick(`state of licensure${n}`); const num = pick(`license #${n}`, `license${n}`, `license number${n}`);
    const exp = parseDate(pick(`license expiration${n}`, `license expiration date${n}`));
    if ((st && st.toLowerCase() !== 'not selected') || num) licenses.push({ state: st.toLowerCase() === 'not selected' ? '' : st, number: num, expiration: exp });
  }
  const status = pick('status', 'active');
  return {
    email, name,
    teamName: pick('team'),
    recruiter: pick('downline', 'recruited by', 'sponsor', 'recruiter'),
    tcName: pick('tc', 'transaction coordinator'),
    profile: {
      first_name: first || null, last_name: last || null, full_name: name, display_name: name,
      // No role in the file: people keep the role they have (new people start as agents).
      role: ROLE[pick('role').toLowerCase()] || (pick('role') ? 'agent' : null),
      phone: pick('phone', 'mobile phone', 'cell phone') || null, personal_company: pick('personal company') || null,
      birthday: parseDate(pick('birthday')), start_date: parseDate(pick('anniversary date', 'anniversary', 'start date', 'join date')),
      address: pick('address') || null, city: pick('city') || null, state: pick('state') || null, zip: pick('zip', 'zip code') || null,
      alternate_name: pick('alternate name') || null,
      annual_cap: parseMoney(pick('annual cap', 'cap')),
      license_state: licenses[0]?.state || null, license_number: licenses[0]?.number || null, license_expiration: licenses[0]?.expiration || null,
      licenses,
      suspended: /inactive|disabled|deactivated|archived/i.test(status),
    },
  };
}

// ---------------------------------------------------------------------------------------
// Brokermint commission history (any transactions / commission report export)

export const HISTORY_FIELDS = [
  ['agent', 'Agent (name or email)', true, ['agent', 'agent name', 'member', 'user', 'agent email', 'listing agent', 'buyer agent', 'name']],
  ['closed_date', 'Closing date', true, ['closing date', 'close date', 'closed date', 'actual closing date', 'settlement date', 'date closed', 'closed', 'closing']],
  ['company_dollar', 'Paid to brokerage (counts toward cap)', true, ['company dollar', 'brokerage split', 'brokerage commission', 'company commission', 'company', 'paid to brokerage', 'broker split', 'broker commission', 'office split', 'cap contribution', 'brokerage income', 'brokerage']],
  ['gci', "Agent's gross commission (GCI)", false, ['gci', 'agent gci', 'gross commission', 'commission', 'gross', 'total commission', 'agent gross', 'commission amount']],
  ['agent_net', "Agent's net", false, ['agent net', 'net to agent', 'agent payout', 'net commission', 'agent commission', 'net', 'payout']],
  ['property', 'Property address', false, ['address', 'property', 'property address', 'street address', 'transaction', 'transaction name', 'title']],
  ['price', 'Sale price', false, ['sale price', 'sales price', 'price', 'purchase price', 'sold price', 'closed price', 'close price', 'volume']],
  ['units', 'Units / sides', false, ['units', 'unit', 'sides', 'side count']],
  ['revshare', 'Revenue share paid on this deal', false, ['revenue share', 'revshare', 'rev share']],
  ['ref', 'Transaction ID (avoids duplicates)', false, ['transaction id', 'id', 'transaction #', 'transaction number', 'file #', 'file number', 'deal id']],
];

/** Guess which column is which. Returns { field: header }. */
export function autoMapHistory(headers) {
  const used = new Set();
  const map = {};
  for (const [field, , , synonyms] of HISTORY_FIELDS) {
    const hit = synonyms.map((s) => headers.find((h) => !used.has(h) && normKey(h) === s)).find(Boolean)
      // Looser match ("Closing Date (Actual)") only for multi-word names, so "Agent Net" isn't taken as the agent.
      || synonyms.filter((s) => s.includes(' ')).map((s) => headers.find((h) => !used.has(h) && normKey(h).includes(s))).find(Boolean);
    if (hit) { map[field] = hit; used.add(hit); }
  }
  return map;
}

/** Match an agent written as an email or a name ("Stacy Smith", "Smith, Stacy") to a person. */
export function matchAgent(value, people) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return null;
  const byEmail = people.find((p) => String(p.email || '').toLowerCase() === v);
  if (byEmail) return byEmail;
  const flip = v.includes(',') ? v.split(',').map((x) => x.trim()).reverse().join(' ') : v;
  const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
  const target = clean(flip);
  return people.find((p) => [p.full_name, p.display_name, p.alternate_name, `${p.first_name || ''} ${p.last_name || ''}`].some((n) => n && clean(n) === target)) || null;
}

/** Mapped rows -> clean history rows, with problems listed. */
export function buildHistory(rows, map, people, overrides = {}) {
  const out = []; const problems = []; const unmatched = new Map();
  rows.forEach((r, i) => {
    const get = (f) => (map[f] ? r[map[f]] : '');
    const agentRaw = get('agent');
    const pick = overrides[agentRaw || '(blank)'] ? String(overrides[agentRaw || '(blank)']).toLowerCase() : '';
    const person = pick ? people.find((p) => String(p.email || '').toLowerCase() === pick) : matchAgent(agentRaw, people);
    const closed = parseDate(get('closed_date'));
    const cd = parseMoney(get('company_dollar'));
    if (!agentRaw && !closed) return; // blank/total lines
    if (!person) { unmatched.set(agentRaw || '(blank)', (unmatched.get(agentRaw || '(blank)') || 0) + 1); return; }
    if (!closed) { problems.push(`Row ${i + 2}: no closing date`); return; }
    if (cd == null) { problems.push(`Row ${i + 2}: no brokerage amount`); return; }
    out.push({
      agent_email: String(person.email).toLowerCase(), agent_name: person.display_name || person.full_name || person.email,
      closed_date: closed, company_dollar: cd, gci: parseMoney(get('gci')), agent_net: parseMoney(get('agent_net')),
      property: get('property') || null, price: parseMoney(get('price')), units: parseMoney(get('units')),
      revshare: parseMoney(get('revshare')), ref: get('ref') || null,
    });
  });
  return { rows: out, problems, unmatched: [...unmatched.entries()].map(([name, count]) => ({ name, count })) };
}
