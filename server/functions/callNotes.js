// New: AI call notes. Someone on the call turns notes on (everyone sees a banner and a
// message in the chat); Daily transcribes; when the call ends we write a summary with
// decisions and to-dos and post it in the conversation (and on the deal, for deal chats).
// action: 'start' | 'stop' | 'summarize'
import { createClientFromRequest, isServiceRequest } from '../lib/base44.js';
import { startTranscription, stopTranscription, transcriptText } from '../lib/daily.js';
import { InvokeLLM } from '../lib/integrations.js';
import { canJoin } from './callJoin.js';

const lc = (e) => String(e || '').toLowerCase();

async function post(E, call, sender, content) {
  const base = { brokerage_id: call.brokerage_id, sender_email: lc(sender.email), sender_name: sender.name, sender_photo: '', content, reactions: [], created_by: lc(sender.email) };
  const k = call.conversation_kind;
  if (k === 'channel') return E.SocialMessage.create({ ...base, channel: call.conversation_key, mentions: [] });
  if (k === 'group') return E.GroupMessage.create({ ...base, group_id: call.conversation_key, mentions: [] });
  if (k === 'dm') {
    const other = call.conversation_key.split('|').find((e) => e !== lc(sender.email)) || call.conversation_key.split('|')[0];
    return E.DirectMessage.create({ ...base, receiver_email: other, read: false });
  }
  return null;
}

export async function summarize(E, call) {
  const t = await transcriptText(call.room_name);
  if (t.status === 'pending') return { status: 'pending' };
  if (t.status === 'none' || !t.text) {
    await E.Call.update(call.id, { notes_status: 'empty' });
    return { status: 'empty' };
  }
  const notes = await InvokeLLM({
    max_tokens: 2000,
    system: 'You write call notes for a real estate brokerage. Concise, factual, names/dates/amounts exact. Never invent anything not said.',
    prompt: `Write notes for this ${call.kind} call ("${call.title || ''}").\n\nTranscript:\n${t.text.slice(0, 60000)}`,
    response_json_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: '2-4 sentences' },
        decisions: { type: 'array', items: { type: 'string' } },
        action_items: { type: 'array', items: { type: 'object', properties: { who: { type: 'string' }, what: { type: 'string' }, when: { type: ['string', 'null'] } }, required: ['who', 'what'] } },
        dates_and_numbers: { type: 'array', items: { type: 'string' }, description: 'Deadlines, prices, addresses mentioned' },
      },
      required: ['summary', 'decisions', 'action_items', 'dates_and_numbers'],
    },
  });
  const text = [
    `📝 Call notes (${call.title || 'call'})`,
    '', notes.summary,
    notes.decisions?.length ? `\nDecided:\n${notes.decisions.map((d) => `• ${d}`).join('\n')}` : '',
    notes.action_items?.length ? `\nTo-dos:\n${notes.action_items.map((a) => `• ${a.who}: ${a.what}${a.when ? ` (${a.when})` : ''}`).join('\n')}` : '',
    notes.dates_and_numbers?.length ? `\nDates & numbers:\n${notes.dates_and_numbers.map((d) => `• ${d}`).join('\n')}` : '',
    '\n(AI notes from the call transcript. Double-check anything important.)',
  ].filter((x) => x !== '').join('\n');
  const starter = { email: call.notes_started_by || call.created_by_email, name: call.notes_started_by_name || call.created_by_name || 'Call notes' };
  await post(E, call, starter, text);
  // Deal chats: also put the notes on the transaction's activity.
  if (call.conversation_kind === 'group') {
    const [g] = await E.GroupChat.filter({ id: call.conversation_key }, '-created_date', 1);
    if (g?.transaction_id) {
      await E.ActivityEvent.create({ brokerage_id: call.brokerage_id, actor_email: lc(starter.email), table_name: 'comment', op: 'comment', record_id: g.transaction_id, transaction_id: g.transaction_id, summary: text.slice(0, 4000), changed: [] });
    }
  }
  await E.Call.update(call.id, { notes_status: 'done', notes });
  return { status: 'done', notes };
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const E = base44.asServiceRole.entities;
    const { callId, action } = await req.json();

    // Scheduled sweep: finish notes for calls that ended.
    if (!callId && isServiceRequest(req)) {
      const pending = (await E.Call.filter({ status: 'ended' }, '-created_date', 200)).filter((c) => ['recording', 'processing'].includes(c.notes_status) && Date.now() - new Date(c.ended_at || c.updated_date).getTime() > 60 * 1000);
      const out = [];
      for (const c of pending) {
        try { out.push((await summarize(E, c)).status); } catch (err) { out.push(`error: ${err.message}`); }
      }
      return Response.json({ processed: out });
    }

    const me = await base44.auth.me();
    const [call] = await E.Call.filter({ id: callId }, '-created_date', 1);
    if (!(await canJoin(E, me, call))) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const name = me.display_name || me.full_name || me.email;

    if (action === 'start') {
      if (call.status !== 'active' && call.status !== 'ringing') return Response.json({ error: 'The call has ended' }, { status: 400 });
      if (call.notes_status === 'recording') return Response.json({ call });
      try { await startTranscription(call.room_name); } catch (err) {
        return Response.json({ error: /plan|billing|payment|not enabled|transcription/i.test(err.message) ? 'AI notes need transcription turned on in your Daily.co account (a paid add-on).' : err.message }, { status: 400 });
      }
      const updated = await E.Call.update(call.id, { notes_status: 'recording', notes_started_by: lc(me.email), notes_started_by_name: name, notes_started_at: new Date().toISOString() });
      await post(E, call, { email: me.email, name }, `📝 ${name} turned on AI notes for this call. The call is being transcribed to write a summary.`);
      return Response.json({ call: updated });
    }
    if (action === 'stop') {
      await stopTranscription(call.room_name);
      const updated = await E.Call.update(call.id, { notes_status: 'processing' });
      return Response.json({ call: updated });
    }
    if (action === 'summarize') {
      if (!['recording', 'processing'].includes(call.notes_status)) return Response.json({ status: call.notes_status || 'off', notes: call.notes || null });
      if (call.notes_status === 'recording') { await stopTranscription(call.room_name); await E.Call.update(call.id, { notes_status: 'processing' }); }
      return Response.json(await summarize(E, { ...call, notes_status: 'processing' }));
    }
    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
