// New: answer or join a call. Returns a meeting token only to people allowed in it.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole } from '../lib/team.js';
import { meetingToken } from '../lib/daily.js';

const lc = (e) => String(e || '').toLowerCase();

export async function canJoin(E, me, call) {
  const myEmail = lc(me.email);
  if (!call || call.brokerage_id !== me.brokerage_id) return false;
  if (lc(call.created_by_email) === myEmail || (call.invitees || []).some((i) => lc(i.email) === myEmail)) return true;
  if (call.conversation_kind === 'channel') {
    const [ch] = await E.Channel.filter({ brokerage_id: me.brokerage_id, name: call.conversation_key }, '-created_date', 1);
    if (!ch) return false;
    if (!ch.is_private || isAdminRole(me.role)) return true;
    return (await E.ChannelMember.filter({ brokerage_id: me.brokerage_id, channel_id: call.conversation_key, user_email: myEmail }, '-created_date', 1)).length > 0;
  }
  if (call.conversation_kind === 'group') {
    const [g] = await E.GroupChat.filter({ id: call.conversation_key }, '-created_date', 1);
    return !!g && (g.members || []).some((m) => lc(m.email) === myEmail);
  }
  return false;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const myEmail = lc(me.email);
    const { callId, video } = await req.json();
    const E = base44.asServiceRole.entities;
    const [call] = await E.Call.filter({ id: callId }, '-created_date', 1);
    if (!(await canJoin(E, me, call))) return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (['ended', 'missed'].includes(call.status)) return Response.json({ error: 'This call has ended' }, { status: 410 });
    const at = new Date().toISOString();
    const listed = (call.invitees || []).some((i) => lc(i.email) === myEmail);
    const invitees = listed || lc(call.created_by_email) === myEmail
      ? (call.invitees || []).map((i) => (lc(i.email) === myEmail ? { ...i, status: 'joined', joined_at: at } : i))
      : [...(call.invitees || []), { email: myEmail, name: me.display_name || me.full_name || myEmail, status: 'joined', joined_at: at }];
    const caller = lc(call.created_by_email) === myEmail;
    const updated = await E.Call.update(call.id, { invitees, status: caller && call.status === 'ringing' ? 'ringing' : 'active', ...(caller ? { caller_left: false } : { answered_at: call.answered_at || at }) });
    const token = await meetingToken({ room: call.room_name, name: me.display_name || me.full_name || me.email, userId: me.id, owner: false, video: video ?? call.kind === 'video' });
    return Response.json({ call: updated, token });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
