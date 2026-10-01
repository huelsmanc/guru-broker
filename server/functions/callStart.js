// New: start a voice or video call from a DM, group chat, channel (a "huddle") or a
// scheduled call. Creates a private Daily room, rings the other people, and posts a
// call card in the conversation.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole } from '../lib/team.js';
import { createRoom, meetingToken } from '../lib/daily.js';
import { pushTo } from '../lib/push.js';

const lc = (e) => String(e || '').toLowerCase();

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const myEmail = lc(me.email);
    const { kind, key, video = false } = await req.json();
    const E = base44.asServiceRole.entities;
    const people = (await E.User.filter({ brokerage_id: me.brokerage_id }, 'full_name', 5000)).filter((u) => !u.suspended);
    const byEmail = new Map(people.map((u) => [lc(u.email), u]));
    const nameOf = (e) => byEmail.get(lc(e))?.display_name || byEmail.get(lc(e))?.full_name || e;
    let invitees = []; let title = '';

    if (kind === 'dm') {
      if (!byEmail.has(lc(key)) || lc(key) === myEmail) return Response.json({ error: 'Person not found' }, { status: 404 });
      invitees = [lc(key)]; title = nameOf(key);
    } else if (kind === 'group') {
      const [g] = await E.GroupChat.filter({ id: key }, '-created_date', 1);
      const members = (g?.members || []).map((m) => lc(m.email));
      if (!g || g.brokerage_id !== me.brokerage_id || !members.includes(myEmail)) return Response.json({ error: 'Not allowed' }, { status: 403 });
      invitees = members.filter((e) => e !== myEmail); title = g.name || 'Group call';
    } else if (kind === 'channel') {
      const [ch] = await E.Channel.filter({ brokerage_id: me.brokerage_id, name: key }, '-created_date', 1);
      const member = (await E.ChannelMember.filter({ brokerage_id: me.brokerage_id, channel_id: key, user_email: myEmail }, '-created_date', 1)).length > 0;
      if (!ch || (ch.is_private && !member && !isAdminRole(me.role))) return Response.json({ error: 'Not allowed' }, { status: 403 });
      invitees = []; title = `#${ch.label || key}`; // huddle: people join from the card in the channel
    } else if (kind === 'scheduled') {
      const [sc] = await E.ScheduledCall.filter({ id: key }, '-created_date', 1);
      if (!sc || sc.brokerage_id !== me.brokerage_id || (lc(sc.agent_email) !== myEmail && !isAdminRole(me.role))) return Response.json({ error: 'Not allowed' }, { status: 403 });
      // The agent rings the brokerage admins; an admin rings the agent.
      invitees = lc(sc.agent_email) === myEmail ? people.filter((u) => isAdminRole(u.role) && lc(u.email) !== myEmail).map((u) => lc(u.email)) : [lc(sc.agent_email)];
      title = sc.topic || 'Scheduled call';
    } else {
      return Response.json({ error: 'Unknown conversation' }, { status: 400 });
    }

    // Already a live call here? Join it instead of starting a second one.
    const live = (await E.Call.filter({ brokerage_id: me.brokerage_id, conversation_kind: kind, conversation_key: kind === 'dm' ? [myEmail, lc(key)].sort().join('|') : key }, '-created_date', 1))
      .find((c) => ['ringing', 'active'].includes(c.status) && Date.now() - new Date(c.created_date).getTime() < 4 * 3600 * 1000);
    if (live) {
      const token = await meetingToken({ room: live.room_name, name: nameOf(myEmail), userId: me.id, owner: lc(live.created_by_email) === myEmail, video });
      return Response.json({ call: live, token, joined_existing: true });
    }

    const room = await createRoom({ video });
    const call = await E.Call.create({
      brokerage_id: me.brokerage_id, room_name: room.name, room_url: room.url, kind: video ? 'video' : 'audio', title,
      created_by_email: myEmail, created_by_name: nameOf(myEmail),
      invitees: invitees.map((e) => ({ email: e, name: nameOf(e), status: 'ringing' })),
      conversation_kind: kind, conversation_key: kind === 'dm' ? [myEmail, lc(key)].sort().join('|') : key,
      status: invitees.length ? 'ringing' : 'active', started_at: new Date().toISOString(), created_by: myEmail,
    });

    // Call card in the conversation.
    const content = `[call]${call.id}|${call.kind}`;
    const sender = { brokerage_id: me.brokerage_id, sender_email: myEmail, sender_name: nameOf(myEmail), sender_photo: me.headshot || '', content, reactions: [], created_by: myEmail };
    if (kind === 'dm') await E.DirectMessage.create({ ...sender, sender_id: me.id, receiver_email: lc(key), receiver_id: byEmail.get(lc(key))?.id || null, receiver_name: nameOf(key), read: false });
    if (kind === 'group') await E.GroupMessage.create({ ...sender, group_id: key, mentions: [] });
    if (kind === 'channel') await E.SocialMessage.create({ ...sender, channel: key, mentions: [], call_id: call.id });

    // Ring phones too (the app shows the answer screen when opened from the notification).
    if (invitees.length) {
      await pushTo(E, invitees, { title: `${nameOf(myEmail)} is calling`, body: `${video ? 'Video' : 'Voice'} call${kind === 'dm' ? '' : ` · ${title}`}. Tap to answer.`, url: `/Dashboard?call=${call.id}`, tag: `call:${call.id}`, kind: 'call' }, { ttl: 45, urgency: 'high' }).catch(() => {});
    }
    const token = await meetingToken({ room: room.name, name: nameOf(myEmail), userId: me.id, owner: true, video });
    return Response.json({ call, token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
