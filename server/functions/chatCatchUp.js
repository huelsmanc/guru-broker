// New: "Catch me up" - an AI summary of what you missed in a channel, DM, group or thread.
// Reads messages with the caller's own access rules, so it can only summarize what they can see.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

const lc = (e) => String(e || '').toLowerCase();
const line = (m, nameOf) => {
  const c = String(m.content || '');
  const text = c.startsWith('[file]') ? `[shared a file: ${c.slice(6).split('|')[2] || 'file'}]` : c.startsWith('[voice_memo]') ? '[voice message]' : c.startsWith('[call]') ? '[started a call]' : c;
  return `[${new Date(m.created_date).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}] ${nameOf(m.sender_email, m.sender_name)}: ${text.slice(0, 1200)}`;
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const myEmail = lc(me.email);
    const body = await req.json();
    const { kind, key } = body;
    let { since } = body;
    const E = base44.entities; // caller's own access
    const recent = !!body.recent; // "Summarize the recent conversation" (nothing new to catch up on)
    if (recent) since = null;
    else if (!since) {
      const [rs] = await E.ChatReadState.filter({ kind: kind === 'thread' ? 'thread' : kind, conv_key: key }, '-created_date', 1).catch(() => []);
      since = rs?.last_read_at;
    }
    const floor = new Date(Date.now() - 7 * 864e5).toISOString();
    since = recent ? floor : (!since || since < floor ? new Date(Date.now() - 864e5).toISOString() : since);
    const after = { $gt: since };
    let msgs = [];
    if (kind === 'channel') msgs = await E.SocialMessage.filter({ brokerage_id: me.brokerage_id, channel: key, created_date: after }, 'created_date', 400);
    else if (kind === 'group') msgs = await E.GroupMessage.filter({ group_id: key, created_date: after }, 'created_date', 400);
    else if (kind === 'thread') msgs = await E.ThreadReply.filter({ message_id: key, created_date: after }, 'created_date', 400);
    else if (kind === 'dm') {
      const [a, b] = await Promise.all([
        E.DirectMessage.filter({ sender_email: myEmail, receiver_email: lc(key), created_date: after }, 'created_date', 300),
        E.DirectMessage.filter({ sender_email: lc(key), receiver_email: myEmail, created_date: after }, 'created_date', 300),
      ]);
      msgs = [...a, ...b].sort((x, y) => String(x.created_date).localeCompare(String(y.created_date)));
    } else return Response.json({ error: 'Unknown conversation' }, { status: 400 });

    if (recent) msgs = msgs.slice(-60);
    const fromOthers = recent ? msgs : msgs.filter((m) => lc(m.sender_email) !== myEmail);
    if (fromOthers.length < 2) return Response.json({ count: fromOthers.length, summary: null, since });
    const people = await base44.asServiceRole.entities.User.filter({ brokerage_id: me.brokerage_id }, 'full_name', 5000);
    const names = new Map(people.map((u) => [lc(u.email), u.display_name || u.full_name]));
    const nameOf = (e, fallback) => (lc(e) === myEmail ? 'Me' : names.get(lc(e)) || fallback || e);
    const summary = await InvokeLLM({
      max_tokens: 1500,
      system: 'You summarize team chat for a busy real estate agent or broker. Be brief and concrete: names, addresses, dates, amounts. Never invent anything not in the messages.',
      prompt: `I'm ${me.full_name || me.email} ("Me" below). Summarize what I missed in these ${msgs.length} messages.\n\n${msgs.map((m) => line(m, nameOf)).join('\n')}`,
      response_json_schema: {
        type: 'object',
        properties: {
          tldr: { type: 'string', description: '1-3 sentences' },
          for_me: { type: 'array', items: { type: 'string' }, description: 'Questions or requests aimed at me, or things I should respond to' },
          decisions: { type: 'array', items: { type: 'string' } },
          action_items: { type: 'array', items: { type: 'object', properties: { who: { type: 'string' }, what: { type: 'string' }, when: { type: ['string', 'null'] } }, required: ['who', 'what'] } },
        },
        required: ['tldr', 'for_me', 'decisions', 'action_items'],
      },
    });
    return Response.json({ count: fromOthers.length, summary, since });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
