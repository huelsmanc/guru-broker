// Client portal: buyers and sellers on a deal get their own link (/portal?t=...). The first
// time on a device they confirm with a 6-digit code emailed to them; after that the device
// keeps a signed session for 30 days. Everything the client sees goes through the server.
import crypto from 'node:crypto';
import { adminClient, appUrl } from './base44.js';
import { SendEmail } from './integrations.js';

const lc = (e) => String(e || '').toLowerCase().trim();
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64u = (b) => Buffer.from(b).toString('base64url');
export const SESSION_DAYS = 30;
export const randomToken = () => b64u(crypto.randomBytes(24));
export const hashCode = (code, salt) => crypto.createHash('sha256').update(`${salt}:${code}`).digest('hex');

let cachedKey = null;
async function sessionKey() {
  if (process.env.CLIENT_PORTAL_SECRET) return process.env.CLIENT_PORTAL_SECRET;
  if (cachedKey) return cachedKey;
  const db = adminClient();
  const read = async () => (await db.from('app_secret').select('value').eq('name', 'client_portal').maybeSingle()).data?.value?.key;
  const have = await read();
  if (have) return (cachedKey = have);
  const made = b64u(crypto.randomBytes(32));
  const { error } = await db.from('app_secret').insert({ name: 'client_portal', value: { key: made } });
  if (error) { const again = await read(); if (again) return (cachedKey = again); throw new Error('Could not set up the client portal'); }
  return (cachedKey = made);
}

/** Session for one client contact on one deal. `v` is the contact's link version, so a new link logs everyone out. */
export async function signSession({ contactId, txId, v }) {
  const body = b64u(JSON.stringify({ c: contactId, t: txId, v, e: Date.now() + SESSION_DAYS * 864e5 }));
  const sig = b64u(crypto.createHmac('sha256', await sessionKey()).update(body).digest());
  return `${body}.${sig}`;
}
export async function readSession(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const want = b64u(crypto.createHmac('sha256', await sessionKey()).update(body).digest());
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString());
    return s.e > Date.now() ? s : null;
  } catch { return null; }
}

export const maskEmail = (e) => { const [u, d] = lc(e).split('@'); return d ? `${u.slice(0, 2)}${'•'.repeat(Math.max(1, u.length - 2))}@${d}` : ''; };
export const isClientContact = (c) => !!(c && c.is_client && c.email);

/** The deal's client chat: agent, TC and co-agents plus the clients. Separate from the team's deal chat. */
export async function ensureClientChat(E, tx, { add } = {}) {
  const contacts = (await E.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200)).filter(isClientContact);
  const team = [...new Set([tx.agent_email, tx.tc_email, ...(tx.co_agents || []).map((a) => a?.email)].map(lc).filter(Boolean))];
  const users = await E.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 5000);
  const byEmail = new Map(users.map((u) => [lc(u.email), u]));
  const [existing] = await E.GroupChat.filter({ brokerage_id: tx.brokerage_id, client_transaction_id: tx.id }, '-created_date', 1);
  // Admins who opened it stay in it, like the team deal chat.
  const guests = [...new Set([...(existing?.members || []).filter((m) => m.added_as === 'guest').map((m) => lc(m.email)), ...(add ? [lc(add)] : [])])]
    .filter((e) => e && !team.includes(e) && byEmail.has(e));
  const members = [
    ...team.map((e) => { const u = byEmail.get(e); return { id: u?.id || null, email: e, full_name: u?.display_name || u?.full_name || e }; }),
    ...guests.map((e) => { const u = byEmail.get(e); return { id: u.id, email: e, full_name: u.display_name || u.full_name || e, added_as: 'guest' }; }),
    ...contacts.filter((c) => !team.includes(lc(c.email))).map((c) => ({ id: null, email: lc(c.email), full_name: c.name || c.email, is_client: true })),
  ];
  const name = `👥 ${String(tx.property_address || 'Deal').split(',')[0]} · Clients`;
  if (!existing) {
    return E.GroupChat.create({ brokerage_id: tx.brokerage_id, client_transaction_id: tx.id, name, auto_name: false, members, created_by_email: lc(tx.agent_email), created_by_name: 'Client chat', created_by: lc(tx.agent_email) });
  }
  const key = (ms) => JSON.stringify((ms || []).map((m) => lc(m.email)).sort());
  if (key(existing.members) === key(members) && existing.name === name) return existing;
  return E.GroupChat.update(existing.id, { members, name, auto_name: false });
}

export async function brandFor(E, brokerageId) {
  const [[settings], [brokerage]] = await Promise.all([
    E.BrokerageSettings.filter({ brokerage_id: brokerageId }, '-created_date', 1).catch(() => []),
    E.Brokerage.filter({ id: brokerageId }, '-created_date', 1).catch(() => []),
  ]);
  return { name: brokerage?.name || settings?.brokerage_name || 'Your brokerage', logo: settings?.logo_url || null, color: settings?.primary_color || null };
}

export const portalLink = (token) => `${appUrl()}/portal?t=${encodeURIComponent(token)}`;

/** A branded email to a client with one button into their portal. */
export function clientEmail({ to, name, subject, lines, token, brand, agentName, replyTo }) {
  const first = String(name || '').split(' ')[0] || 'there';
  const color = brand?.color || '#2563eb';
  return SendEmail({
    to, subject, from_name: agentName || brand?.name || 'Your agent', reply_to: replyTo,
    body: `<div style="font-family:Arial,sans-serif;max-width:560px;line-height:1.55;color:#1f2937">
${brand?.logo ? `<img src="${esc(brand.logo)}" alt="${esc(brand.name)}" style="max-height:44px;margin-bottom:12px">` : ''}
<p>Hi ${esc(first)},</p>
${lines.map((l) => `<p>${l}</p>`).join('\n')}
<p><a href="${esc(portalLink(token))}" style="display:inline-block;padding:12px 24px;background:${esc(color)};color:#fff;text-decoration:none;border-radius:8px;font-weight:bold">Open your client portal</a></p>
<p style="font-size:12px;color:#6b7280">This link is just for you. The first time you open it on a device, we'll email you a code to confirm it's you.</p>
${agentName ? `<p>${esc(agentName)}</p>` : ''}
</div>`,
  });
}
