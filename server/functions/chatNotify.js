// New: in-app notifications for @mentions in channels, group chats and threads.
// Called by the sender's app right after a message is saved. Everything is checked here:
// the message must be the caller's, recent, and only people who can see it are notified.
// Each message notifies once.
import { createClientFromRequest } from '../lib/base44.js';
import { notifyPeople, isAdminRole } from '../lib/team.js';

const ENTITY = { channel: 'SocialMessage', group: 'GroupMessage', thread: 'ThreadReply' };
const lc = (e) => String(e || '').toLowerCase();
const snippet = (c) => (String(c || '').startsWith('[') ? 'sent an attachment' : String(c).slice(0, 160));

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const myEmail = lc(me.email);
    const { kind, id } = await req.json();
    if (!ENTITY[kind] || !id) return Response.json({ error: 'kind and id required' }, { status: 400 });
    const msg = await base44.entities[ENTITY[kind]].get(id).catch(() => null); // caller's own access rules
    if (!msg || lc(msg.sender_email) !== myEmail) return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (msg.notified_at || Date.now() - new Date(msg.created_date).getTime() > 10 * 60 * 1000) return Response.json({ notified: 0 });
    const E = base44.asServiceRole.entities;
    const people = (await E.User.filter({ brokerage_id: me.brokerage_id }, 'full_name', 5000)).filter((u) => !u.suspended);
    const byEmail = new Map(people.map((u) => [lc(u.email), u]));
    const mentions = (Array.isArray(msg.mentions) ? msg.mentions : []).map(lc);
    const name = me.display_name || me.full_name || me.email;
    let audience = []; let title = ''; let link = '';

    if (kind === 'channel' || kind === 'thread') {
      let channelName = msg.channel;
      let parent = null;
      if (kind === 'thread') {
        [parent] = await E.SocialMessage.filter({ id: msg.message_id }, '-created_date', 1);
        if (!parent) return Response.json({ notified: 0 });
        channelName = parent.channel;
      }
      const [ch] = await E.Channel.filter({ brokerage_id: me.brokerage_id, name: channelName }, '-created_date', 1);
      const members = new Set((await E.ChannelMember.filter({ brokerage_id: me.brokerage_id, channel_id: channelName }, '-created_date', 5000)).map((m) => lc(m.user_email)));
      const canSee = (u) => isAdminRole(u.role) || (ch && !ch.is_private) || members.has(lc(u.email));
      let wanted = mentions.includes('channel') ? people.map((u) => lc(u.email)) : mentions;
      if (kind === 'thread') {
        // Thread followers: the person who started it and everyone who replied.
        const replies = await E.ThreadReply.filter({ message_id: parent.id }, 'created_date', 500);
        wanted = [...wanted, lc(parent.sender_email), ...replies.map((r) => lc(r.sender_email))];
      }
      audience = [...new Set(wanted)].filter((e) => e !== myEmail && byEmail.has(e) && canSee(byEmail.get(e)));
      title = kind === 'thread' ? `${name} replied in a thread in #${channelName}` : mentions.includes('channel') ? `${name} notified #${channelName}` : `${name} mentioned you in #${channelName}`;
      link = `/SocialChat?channel=${encodeURIComponent(channelName)}${kind === 'thread' ? `&thread=${parent.id}` : ''}`;
    } else {
      const [g] = await E.GroupChat.filter({ id: msg.group_id }, '-created_date', 1);
      const inGroup = new Set((g?.members || []).map((m) => lc(m.email)));
      audience = [...new Set(mentions)].filter((e) => e !== myEmail && inGroup.has(e));
      title = `${name} mentioned you in ${g?.name || 'a group chat'}`;
      link = `/DirectMessages?group=${msg.group_id}`;
    }

    await E[ENTITY[kind]].update(id, { notified_at: new Date().toISOString() });
    const notified = await notifyPeople(E, { brokerageId: me.brokerage_id, people: audience.map((e) => ({ email: e })), title, message: snippet(msg.content),
      link, referenceId: id, referenceType: 'Message', email: false });
    return Response.json({ notified });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
