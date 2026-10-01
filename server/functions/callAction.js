// New: decline, cancel (caller hangs up before anyone answers), leave or end a call.
import { createClientFromRequest } from '../lib/base44.js';
import { deleteRoom } from '../lib/daily.js';
import { canJoin } from './callJoin.js';

const lc = (e) => String(e || '').toLowerCase();

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const myEmail = lc(me.email);
    const { callId, action } = await req.json();
    const E = base44.asServiceRole.entities;
    const [call] = await E.Call.filter({ id: callId }, '-created_date', 1);
    if (!(await canJoin(E, me, call))) return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (['ended', 'missed'].includes(call.status)) return Response.json({ call });
    const now = new Date().toISOString();
    const isCaller = lc(call.created_by_email) === myEmail;
    let patch = {};

    if (action === 'decline') {
      const invitees = (call.invitees || []).map((i) => (lc(i.email) === myEmail ? { ...i, status: 'declined' } : i));
      const nobodyLeft = invitees.every((i) => i.status === 'declined');
      patch = { invitees, ...(nobodyLeft && call.status === 'ringing' ? { status: 'missed', ended_at: now } : {}) };
    } else if (action === 'cancel' && isCaller && call.status === 'ringing') {
      patch = { status: 'missed', ended_at: now, invitees: (call.invitees || []).map((i) => (i.status === 'ringing' ? { ...i, status: 'missed' } : i)) };
    } else if (action === 'leave') {
      const invitees = (call.invitees || []).map((i) => (lc(i.email) === myEmail ? { ...i, status: 'left' } : i));
      const anyoneIn = invitees.some((i) => i.status === 'joined');
      // A 1:1 or group call ends when the caller and everyone else have left; huddles end when empty is reported by the last person.
      const callerGone = isCaller || call.caller_left;
      patch = { invitees, ...(isCaller ? { caller_left: true } : {}), ...(!anyoneIn && callerGone ? { status: call.answered_at ? 'ended' : 'missed', ended_at: now } : {}) };
    } else if (action === 'end') {
      patch = { status: call.answered_at ? 'ended' : 'missed', ended_at: now };
    } else {
      return Response.json({ error: 'Unknown action' }, { status: 400 });
    }
    const updated = await E.Call.update(call.id, patch);
    if (['ended', 'missed'].includes(updated.status)) await deleteRoom(call.room_name);
    return Response.json({ call: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
