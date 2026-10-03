// Follow Up Boss: the brokerage's shared account, connected once by its owner.
//   - Settings and the owner's API key live in the server-only app_secret table; the key is
//     encrypted there, so a copy of the database alone doesn't reveal it.
//   - Every request carries Guru Broker's registered system name and key (Vercel: FUB_SYSTEM,
//     FUB_SYSTEM_KEY) plus the account's API key.
import crypto from 'node:crypto';
import { adminClient } from './base44.js';
import { leastLoadedTc, notifyPeople } from './team.js';

export const FUB_API = 'https://api.followupboss.com/v1';
export const DEFAULTS = {
  contract_stages: ['Under Contract', 'Pending'],
  closed_stage: 'Closed',
  flex_sources: ['Zillow Flex'],
  flex_pct: 35,
};
const lc = (e) => String(e || '').toLowerCase().trim();

// ---------------------------------------------------------------- the key, encrypted at rest
function secretKey() {
  const base = process.env.SECRETS_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!base) throw new Error('Server secrets are not set up.');
  return Buffer.from(crypto.hkdfSync('sha256', base, 'guru-broker', 'fub-api-key', 32));
}
export function sealKey(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', secretKey(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64')).join('.');
}
export function openKey(sealed) {
  const [iv, tag, enc] = String(sealed || '').split('.').map((s) => Buffer.from(s, 'base64'));
  const d = crypto.createDecipheriv('aes-256-gcm', secretKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}

// ---------------------------------------------------------------- settings per brokerage
const row = (bid) => `fub:${bid}`;
export async function getConfig(brokerageId) {
  if (!brokerageId) return null;
  const { data } = await adminClient().from('app_secret').select('value').eq('name', row(brokerageId)).maybeSingle();
  return data?.value ? { ...DEFAULTS, ...data.value } : null;
}
export async function saveConfig(brokerageId, value) {
  const { error } = await adminClient().from('app_secret').upsert({ name: row(brokerageId), value }, { onConflict: 'name' });
  if (error) throw new Error(error.message);
}
export async function removeConfig(brokerageId) {
  await adminClient().from('app_secret').delete().eq('name', row(brokerageId));
}
export async function connectedBrokerages() {
  const { data } = await adminClient().from('app_secret').select('name, value').like('name', 'fub:%');
  return (data || []).map((r) => ({ brokerageId: r.name.slice(4), cfg: { ...DEFAULTS, ...r.value } })).filter((x) => x.cfg.api_key);
}

// ---------------------------------------------------------------- requests
export const systemReady = () => !!(process.env.FUB_SYSTEM && process.env.FUB_SYSTEM_KEY);

export async function fub(apiKey, path, { method = 'GET', body } = {}) {
  if (!systemReady()) throw Object.assign(new Error('Follow Up Boss isn\'t set up on the server yet (FUB_SYSTEM and FUB_SYSTEM_KEY in Vercel).'), { status: 400 });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const res = await fetch(`${FUB_API}${path}`, {
      method,
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'X-System': process.env.FUB_SYSTEM,
        'X-System-Key': process.env.FUB_SYSTEM_KEY,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429 && attempt < 2) {
      const wait = Math.min(5, Number(res.headers.get('retry-after')) || 2);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = res.status === 401 ? 'Follow Up Boss didn\'t accept that API key.' : data?.errorMessage || data?.message || `Follow Up Boss answered ${res.status}`;
      throw Object.assign(new Error(msg), { status: res.status === 401 ? 400 : 502, fubStatus: res.status });
    }
    return data;
  }
  throw Object.assign(new Error('Follow Up Boss is busy right now. Try again in a minute.'), { status: 503 });
}
export const fubFor = (cfg) => (path, opts) => fub(openKey(cfg.api_key), path, opts);

/** Webhooks are signed with Guru Broker's system key: HMAC-SHA256 of the base64 of the raw body. */
export function validSignature(raw, signature) {
  if (!process.env.FUB_SYSTEM_KEY || !signature) return false;
  const want = crypto.createHmac('sha256', process.env.FUB_SYSTEM_KEY).update(Buffer.from(raw, 'utf8').toString('base64')).digest('hex');
  const a = Buffer.from(want); const b = Buffer.from(String(signature));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------- people → deals
export const personUrl = (id) => `https://app.followupboss.com/2/people/view/${id}`;
const first = (list, key = 'value') => (Array.isArray(list) ? (list.find((x) => x?.isPrimary) || list[0])?.[key] : '') || '';
export const personSummary = (p) => ({
  id: p.id, name: p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unnamed', stage: p.stage || '', source: p.source || '',
  email: first(p.emails), phone: first(p.phones), assigned_to: p.assignedTo || '', assigned_user_id: p.assignedUserId != null ? String(p.assignedUserId) : '', url: personUrl(p.id),
  last_activity: p.lastActivity || p.updated || null, created: p.created || null, price: Number(p.price) || null, tags: Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
});

export function isFlex(p, cfg) {
  const words = (cfg.flex_sources || DEFAULTS.flex_sources).map(lc).filter(Boolean);
  const hay = [p.source, ...(Array.isArray(p.tags) ? p.tags : [])].map(lc);
  return words.some((w) => hay.some((h) => h.includes(w)));
}

/** The Guru Broker agent a Follow Up Boss person is assigned to (by the user's email, or a manual match). */
export function agentEmailFor(p, cfg) {
  const id = String(p.assignedUserId || '');
  return lc((cfg.user_map || {})[id] || '');
}

function addressOf(p, deal) {
  if (deal?.name && /\d/.test(deal.name)) return deal.name;
  const a = (Array.isArray(p.addresses) ? p.addresses : []).find((x) => x?.street);
  if (a) return [a.street, a.city, [a.state, a.code].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return '';
}
const sideOf = (p) => (/seller|listing/i.test(String(p.type || '')) ? 'listing' : 'buyer');

/**
 * Opens a Guru Broker deal for a person who reached an "Under Contract" stage, once.
 * Returns { tx } when made, { skipped: reason } otherwise.
 */
export async function openDealFor({ E, cfg, brokerageId, person, call, pickTc, notify }) {
  const existing = await E.Transaction.filter({ brokerage_id: brokerageId, fub_person_id: String(person.id) }, '-created_date', 1).catch(() => []);
  if (existing.length) return { skipped: 'already open', tx: existing[0] };
  const email = agentEmailFor(person, cfg);
  if (!email) return { skipped: 'agent not matched', person: personSummary(person) };
  const [agent] = await E.User.filter({ email }, '-created_date', 1);
  if (!agent || agent.brokerage_id !== brokerageId || agent.suspended) return { skipped: 'agent not in brokerage', person: personSummary(person) };

  let deal = null;
  try { deal = (await call(`/deals?personId=${person.id}&limit=1&sort=-created`))?.deals?.[0] || null; } catch { /* deals are optional */ }
  const s = personSummary(person);
  const side = sideOf(person);
  const flex = isFlex(person, cfg);
  const tc = await pickTc(agent);
  const address = addressOf(person, deal);
  const now = new Date().toISOString();
  const tx = await E.Transaction.create({
    brokerage_id: brokerageId,
    property_address: address || `Address needed: ${s.name}`,
    agent_email: lc(agent.email), agent_name: agent.display_name || agent.full_name || agent.email,
    tc_email: tc?.email || null, tc_name: tc?.name || null,
    buyers: side === 'buyer' ? [s.name] : [], sellers: side === 'listing' ? [s.name] : [],
    sale_price: Number(deal?.price || person.price) || null,
    status: 'active', deal_type: side, transaction_type: 'purchase',
    referral: flex ? { type: 'pct', amount: Number(cfg.flex_pct) || DEFAULTS.flex_pct, to: 'Zillow Flex' } : null,
    updates: [{ id: Date.now().toString(), message: `Opened from Follow Up Boss: ${s.name} moved to "${person.stage}".${flex ? ` Zillow Flex referral (${Number(cfg.flex_pct) || DEFAULTS.flex_pct}%) added to the commission.` : ''}${address ? '' : ' Add the property address.'}`, milestone: 'Under Contract', posted_by: 'Follow Up Boss', posted_at: now }],
    // extra
    fub_person_id: String(person.id), fub_source: person.source || '', lead_source: person.source || '',
  });
  await E.TransactionContact.create({
    brokerage_id: brokerageId, transaction_id: tx.id, agent_email: lc(agent.email), role: side === 'listing' ? 'Seller' : 'Buyer',
    name: s.name, email: s.email || null, phone: s.phone || null, is_client: true,
  }).catch(() => {});
  await notify?.(agent, tx, s, flex, !!address);
  return { tx };
}

/** Tells Follow Up Boss a deal closed: the person's stage and price, plus a note with the details. */
export async function writeClosing({ call, cfg, tx }) {
  const id = tx.fub_person_id;
  if (!id) return { skipped: 'not linked' };
  const price = Number(tx.sale_price) || null;
  await call(`/people/${encodeURIComponent(id)}`, { method: 'PUT', body: { stage: cfg.closed_stage || DEFAULTS.closed_stage, ...(price ? { price } : {}) } });
  const date = tx.closed_date || tx.closing_date || new Date().toISOString().slice(0, 10);
  await call('/notes', { method: 'POST', body: { personId: Number(id) || id, subject: 'Closed in Guru Broker', body: `Closed on ${date}${price ? ` at $${price.toLocaleString('en-US')}` : ''}. Property: ${tx.property_address || 'n/a'}.`, isHtml: false } });
  return { ok: true };
}

/** Picks a TC the same way accepted offers do: the agent's TC, the brokerage default, else the least busy. */
export const tcPicker = (E, brokerageId) => async (agent) => {
  const [settings] = await E.BrokerageSettings.filter({ brokerage_id: brokerageId }, '-created_date', 1).catch(() => []);
  const pick = agent?.tc_email || settings?.default_tc_email;
  if (pick) {
    const [u] = await E.User.filter({ email: lc(pick) }, '-created_date', 1).catch(() => []);
    return { email: lc(pick), name: u?.display_name || u?.full_name || settings?.default_tc_name || pick };
  }
  return leastLoadedTc(E, brokerageId).catch(() => null);
};
export const notifier = (E, brokerageId) => async (agent, tx, s, flex, hasAddress) => {
  const people = [{ email: agent.email, full_name: agent.full_name }];
  if (tx.tc_email && lc(tx.tc_email) !== lc(agent.email)) people.push({ email: tx.tc_email });
  await notifyPeople(E, {
    brokerageId, people, email: false, link: `/Transactions/${tx.id}`, referenceId: tx.id, referenceType: 'Transaction',
    title: `New deal from Follow Up Boss: ${s.name}`,
    message: `${s.name} moved to Under Contract, so the deal was opened here${flex ? ' with the Zillow Flex referral' : ''}.${hasAddress ? '' : ' Add the property address.'}`,
  }).catch(() => {});
};


const clipTo = (v, n) => String(v ?? '').slice(0, n);
export const PERSON_FIELDS = 'id,name,firstName,lastName,emails,phones,stage,source,tags,type,price,addresses,assignedUserId,assignedTo,lastActivity,created';
/** A person and their latest notes, calls and texts, newest first. */
export async function personWithActivity(call, id, limit = 15) {
  const pid = encodeURIComponent(id);
  const [p, notes, calls, texts] = await Promise.all([
    call(`/people/${pid}?fields=${PERSON_FIELDS}`).catch(() => null),
    call(`/notes?personId=${pid}&limit=10&sort=-created`).catch(() => ({})),
    call(`/calls?personId=${pid}&limit=10&sort=-created`).catch(() => ({})),
    call(`/textMessages?personId=${pid}&limit=10&sort=-created`).catch(() => ({})),
  ]);
  // Follow Up Boss hides some bodies from apps ("* Body is hidden for privacy reasons *"). Those
  // aren't shown here; they're counted so the page can point to Follow Up Boss instead.
  const hiddenBody = (t) => !String(t || '').trim() || /hidden for privacy/i.test(String(t));
  let hidden = 0; let hiddenAt = null;
  const keep = (a, body) => { if (!hiddenBody(body)) return true; hidden += 1; if (a.at && (!hiddenAt || a.at > hiddenAt)) hiddenAt = a.at; return false; };
  const activity = [
    ...(notes?.notes || []).map((n) => ({ a: { kind: 'note', at: n.created, by: n.createdBy || '', text: clipTo(n.subject ? `${n.subject}: ${n.body || ''}` : n.body, 400) }, body: n.subject || n.body })),
    ...(calls?.calls || []).map((c) => ({ a: { kind: 'call', at: c.created, by: c.userName || '', text: clipTo(`${c.isIncoming ? 'Incoming' : 'Outgoing'} call${c.duration ? `, ${Math.round(c.duration / 60)} min` : ''}${c.note && !hiddenBody(c.note) ? `: ${c.note}` : ''}`, 400) }, body: 'call' })),
    ...(texts?.textmessages || texts?.textMessages || []).map((x) => ({ a: { kind: 'text', at: x.created, by: x.isIncoming ? (p?.name || 'Client') : (x.userName || 'Agent'), text: clipTo(x.message, 400) }, body: x.message })),
  ].filter(({ a, body }) => a.at && keep(a, body)).map(({ a }) => a)
    .sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
  return { p, activity, hidden: { count: hidden, last: hiddenAt } };
}
