// New (automation): push a new DM or group message to the people it's for.
import { createClientFromRequest } from '../lib/base44.js';
import { pushTo } from '../lib/push.js';
import { isClientContact, brandFor, clientEmail, esc } from '../lib/clientPortal.js';

async function emailClients(E, g, m, who, body) {
  const tx = await E.Transaction.get(g.client_transaction_id).catch(() => null);
  if (!tx) return;
  const contacts = (await E.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 200)).filter((c) => isClientContact(c) && c.portal_token);
  const now = Date.now();
  const due = contacts.filter((c) => now - new Date(c.portal_last_seen || 0) > 10 * 60_000 && now - new Date(c.portal_last_emailed || 0) > 30 * 60_000);
  if (!due.length) return;
  const brand = await brandFor(E, tx.brokerage_id);
  for (const c of due) {
    await clientEmail({ to: c.email, name: c.name, token: c.portal_token, brand, agentName: who, replyTo: m.sender_email,
      subject: `New message about ${tx.property_address}`,
      lines: [`<b>${esc(who)}</b> sent you a message:`, `<span style="display:block;padding:12px 14px;background:#f3f4f6;border-radius:8px">${esc(body)}</span>`, 'Reply in your client portal so the whole team sees it.'] });
    await E.TransactionContact.update(c.id, { portal_last_emailed: new Date().toISOString() });
  }
}

const lc = (e) => String(e || '').toLowerCase();
const preview = (c) => { c = String(c || ''); if (c.startsWith('[voice_memo]')) return '🎤 Voice message'; if (c.startsWith('[file]')) return '📎 Sent a file'; if (c.startsWith('[call]')) return null; return c.slice(0, 160); };

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    const m = event?.data;
    if (!m?.id || event.type !== 'create') return Response.json({ skipped: true });
    const body = preview(m.content);
    if (!body) return Response.json({ skipped: 'call card' }); // calls push separately
    const E = base44.asServiceRole.entities;
    const who = m.sender_name || m.sender_email;
    if (event.entity_name === 'DirectMessage') {
      const sent = await pushTo(E, [m.receiver_email], { title: who, body, url: `/DirectMessages?dm=${encodeURIComponent(lc(m.sender_email))}`, tag: `dm:${lc(m.sender_email)}`, kind: 'message' });
      return Response.json({ sent });
    }
    const [g] = await E.GroupChat.filter({ id: m.group_id }, '-created_date', 1);
    if (!g) return Response.json({ skipped: 'no group' });
    const to = (g.members || []).map((x) => lc(x.email)).filter((e) => e && e !== lc(m.sender_email));
    // Client chat: clients aren't app users, so they hear about new team messages by email
    // (only when they're not on their portal, and at most every 30 minutes).
    if (g.client_transaction_id && !(g.members || []).some((x) => x.is_client && lc(x.email) === lc(m.sender_email))) {
      await emailClients(E, g, m, who, body).catch((e) => console.error('client email', e.message));
    }
    const sent = await pushTo(E, to, { title: g.name || 'Group chat', body: `${who}: ${body}`, url: g.client_transaction_id ? `/Transactions/${g.client_transaction_id}?tab=clients` : `/DirectMessages?group=${g.id}`, tag: `group:${g.id}`, kind: 'message' });
    return Response.json({ sent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
