// Records sign-ins, downloads and transaction comments in the Activity log.
import { createClientFromRequest } from '../lib/base44.js';
import { notifyPeople, mentionablePeople } from '../lib/team.js';
import { esc } from '../lib/esign.js';

const ALLOWED = new Set(['signed_in', 'viewed_transaction', 'downloaded_document', 'exported_report', 'comment', 'mentionable']);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { event, record_id, transaction_id, summary, mentions } = await req.json();
    if (!ALLOWED.has(event)) return Response.json({ error: 'Unknown event' }, { status: 400 });
    let tx = null;
    if (transaction_id) {
      tx = await base44.entities.Transaction.get(transaction_id).catch(() => null); // must be able to see the deal
      if (!tx) return Response.json({ error: 'Not allowed' }, { status: 403 });
    }
    if (event === 'mentionable') { // who can be @mentioned on this deal
      if (!tx) return Response.json({ error: 'transaction_id required' }, { status: 400 });
      const all = await mentionablePeople(base44.asServiceRole.entities, tx.brokerage_id || me.brokerage_id, { tx });
      return Response.json({ people: [...all.values()].filter((p) => p.email !== me.email.toLowerCase()) });
    }
    const text = String(summary || '').slice(0, event === 'comment' ? 4000 : 200);
    await base44.asServiceRole.entities.ActivityEvent.create({
      brokerage_id: me.brokerage_id, actor_email: me.email.toLowerCase(), table_name: event === 'comment' ? 'comment' : 'session', op: event,
      record_id: record_id || transaction_id || null, transaction_id: transaction_id || null, summary: text, changed: Array.isArray(mentions) ? mentions.map(String).slice(0, 20) : [], created_by: me.email.toLowerCase(),
    });
    if (event === 'comment' && tx) {
      const myEmail = me.email.toLowerCase();
      const wanted = new Set([...(Array.isArray(mentions) ? mentions : []), ...[...text.matchAll(/@([\w.+-]+@[\w.-]+\.\w+)/g)].map((m) => m[1])]
        .map((e) => String(e).toLowerCase()).filter((e) => e && e !== myEmail));
      if (wanted.size) {
        const allowed = await mentionablePeople(base44.asServiceRole.entities, tx.brokerage_id || me.brokerage_id, { tx });
        const people = [...wanted].filter((e) => allowed.has(e)).map((e) => allowed.get(e));
        if (people.length) await notifyPeople(base44.asServiceRole.entities, { brokerageId: me.brokerage_id, people, link: `/Transactions/${tx.id}?tab=activity`,
          referenceId: tx.id, referenceType: 'Transaction', title: `${me.full_name || me.email} mentioned you`, message: `${tx.property_address}: ${text.slice(0, 200)}`,
          pushKind: 'mention', emailBody: `<p><b>${esc(me.full_name || me.email)}</b> mentioned you on <b>${esc(tx.property_address || 'a transaction')}</b>:</p><blockquote style="border-left:3px solid #10b981;margin:0;padding:6px 12px;color:#374151">${esc(text.slice(0, 1000))}</blockquote>` });
      }
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
