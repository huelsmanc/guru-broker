// Culture → Shout-outs: saves a shout-out and tells the person who got it (in the app and on their
// phone). The shout-out is saved with the giver's own access; names come from the profiles here.
import { createClientFromRequest } from '../lib/base44.js';
import { notifyPeople } from '../lib/team.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const nameOf = (u) => [u?.display_name, u?.full_name].map((v) => String(v || '').trim()).find((v) => v && !v.includes('@')) || String(u?.email || '').split('@')[0];
const CATEGORIES = new Set(['teamwork', 'client_service', 'sales', 'leadership', 'creativity', 'persistence', 'other']);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.brokerage_id) return Response.json({ error: 'Not signed in' }, { status: 401 });
    const { to_email, message = '', category = 'teamwork', is_anonymous = false } = await req.json().catch(() => ({}));
    const E = base44.asServiceRole.entities;
    const [to] = await E.User.filter({ email: lc(to_email) }, '-created_date', 1);
    if (!to || to.brokerage_id !== me.brokerage_id) return Response.json({ error: 'Pick someone on your team' }, { status: 400 });
    if (lc(to.email) === lc(me.email)) return Response.json({ error: "You can't shout yourself out" }, { status: 400 });
    const text = String(message).trim().slice(0, 1000);
    if (!text) return Response.json({ error: 'Add a message' }, { status: 400 });

    const rec = await base44.entities.Recognition.create({
      brokerage_id: me.brokerage_id, from_email: lc(me.email), from_name: nameOf(me),
      to_email: lc(to.email), to_name: nameOf(to), message: text,
      category: CATEGORIES.has(category) ? category : 'other', is_anonymous: !!is_anonymous,
    });
    const from = is_anonymous ? 'Someone on your team' : nameOf(me);
    await notifyPeople(E, {
      brokerageId: me.brokerage_id, people: [to],
      title: `${from} gave you a shout-out 🎉`,
      message: text.length > 140 ? `${text.slice(0, 137)}…` : text,
      link: '/Culture?tab=recognition', referenceId: rec.id, referenceType: 'Recognition',
      email: false, // in the app and on their phone
    }).catch((e) => console.error('shout-out notify failed', e.message));
    return Response.json({ recognition: rec });
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
};
