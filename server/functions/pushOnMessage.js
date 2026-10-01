// New (automation): push a new DM or group message to the people it's for.
import { createClientFromRequest } from '../lib/base44.js';
import { pushTo } from '../lib/push.js';

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
    const sent = await pushTo(E, to, { title: g.name || 'Group chat', body: `${who}: ${body}`, url: `/DirectMessages?group=${g.id}`, tag: `group:${g.id}`, kind: 'message' });
    return Response.json({ sent });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
