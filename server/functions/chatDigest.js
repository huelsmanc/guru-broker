// Scheduled every morning: a short email to anyone with unread DMs, group messages or
// @mentions (people can turn it off in My Profile -> Notifications).
import { createClientFromRequest, appUrl } from '../lib/base44.js';
import { SendEmail } from '../lib/integrations.js';
import { esc } from '../lib/esign.js';

const lc = (e) => String(e || '').toLowerCase();
const snip = (c) => { c = String(c || ''); if (c.startsWith('[file]')) return 'Shared a file'; if (c.startsWith('[voice_memo]')) return 'Voice message'; if (c.startsWith('[call]')) return 'Call'; return c.slice(0, 120); };

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const E = base44.asServiceRole.entities;
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // ignore the last hour (they may be reading now)
    const floor = new Date(Date.now() - 3 * 864e5).toISOString();
    const users = (await E.User.filter({}, 'email', 10000)).filter((u) => u.brokerage_id && !u.suspended && u.notify_prefs?.daily_digest !== false);
    let sent = 0;
    for (const u of users) {
      const email = lc(u.email);
      const reads = await E.ChatReadState.filter({ user_email: email }, '-created_date', 2000);
      const lastRead = (kind, key) => reads.find((r) => r.kind === kind && r.conv_key === key)?.last_read_at || floor;
      const dms = (await E.DirectMessage.filter({ receiver_email: email, read: false, created_date: { $lt: cutoff, $gt: floor } }, '-created_date', 50));
      const mentions = (await E.SocialMessage.filter({ brokerage_id: u.brokerage_id, mentions: [email], created_date: { $lt: cutoff, $gt: floor } }, '-created_date', 50))
        .filter((m) => m.created_date > lastRead('channel', m.channel) && lc(m.sender_email) !== email);
      const groups = (await E.GroupChat.filter({ brokerage_id: u.brokerage_id }, '-created_date', 500)).filter((g) => (g.members || []).some((m) => lc(m.email) === email));
      const groupItems = [];
      for (const g of groups) {
        const ms = (await E.GroupMessage.filter({ group_id: g.id, created_date: { $gt: lastRead('group', g.id), $lt: cutoff } }, '-created_date', 20)).filter((m) => lc(m.sender_email) !== email);
        if (ms.length) groupItems.push({ g, count: ms.length, last: ms[0] });
      }
      const total = dms.length + mentions.length + groupItems.reduce((s, x) => s + x.count, 0);
      if (!total) continue;
      const byPerson = new Map();
      for (const d of dms) { const k = lc(d.sender_email); const x = byPerson.get(k) || { name: d.sender_name || k, count: 0, last: d }; x.count += 1; byPerson.set(k, x); }
      const row = (title, body, link) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee"><a href="${esc(appUrl() + link)}" style="color:#111827;text-decoration:none"><b>${esc(title)}</b><br><span style="color:#6b7280;font-size:13px">${esc(body)}</span></a></td></tr>`;
      const rows = [
        ...[...byPerson.entries()].map(([k, x]) => row(`${x.name} (${x.count})`, snip(x.last.content), `/DirectMessages?dm=${encodeURIComponent(k)}`)),
        ...groupItems.map((x) => row(`${x.g.name || 'Group'} (${x.count})`, `${x.last.sender_name || ''}: ${snip(x.last.content)}`, `/DirectMessages?group=${x.g.id}`)),
        ...mentions.slice(0, 10).map((m) => row(`@mention in #${m.channel}`, `${m.sender_name || m.sender_email}: ${snip(m.content)}`, `/SocialChat?channel=${encodeURIComponent(m.channel)}`)),
      ].join('');
      await SendEmail({
        to: email,
        subject: `You have ${total} unread message${total > 1 ? 's' : ''} in Go Broker Hub`,
        body: `<div style="font-family:Arial,sans-serif;max-width:560px;color:#1f2937"><p>Good morning ${esc((u.full_name || '').split(' ')[0] || '')},</p><p>Here's what's waiting for you:</p><table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p><a href="${esc(appUrl())}/DirectMessages" style="display:inline-block;margin-top:14px;padding:11px 22px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold">Open Go Broker Hub</a></p>
<p style="font-size:12px;color:#9ca3af">Turn this email off in My Profile → Notifications.</p></div>`,
      }).catch((e) => console.error('digest email', email, e.message));
      sent += 1;
    }
    return Response.json({ sent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
