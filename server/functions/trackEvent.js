// Records sign-ins, downloads and transaction comments in the Activity log.
import { createClientFromRequest } from '../lib/base44.js';
import { notifyPeople } from '../lib/team.js';

const ALLOWED = new Set(['signed_in', 'viewed_transaction', 'downloaded_document', 'exported_report', 'comment']);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { event, record_id, transaction_id, summary } = await req.json();
    if (!ALLOWED.has(event)) return Response.json({ error: 'Unknown event' }, { status: 400 });
    let tx = null;
    if (transaction_id) {
      tx = await base44.entities.Transaction.get(transaction_id).catch(() => null); // must be able to see the deal
      if (!tx) return Response.json({ error: 'Not allowed' }, { status: 403 });
    }
    const text = String(summary || '').slice(0, event === 'comment' ? 4000 : 200);
    await base44.asServiceRole.entities.ActivityEvent.create({
      brokerage_id: me.brokerage_id, actor_email: me.email.toLowerCase(), table_name: event === 'comment' ? 'comment' : 'session', op: event,
      record_id: record_id || transaction_id || null, transaction_id: transaction_id || null, summary: text, changed: [], created_by: me.email.toLowerCase(),
    });
    if (event === 'comment' && tx) {
      const mentioned = [...text.matchAll(/@([\w.+-]+@[\w.-]+\.\w+)/g)].map((m) => ({ email: m[1] }));
      if (mentioned.length) await notifyPeople(base44.asServiceRole.entities, { brokerageId: me.brokerage_id, people: mentioned, link: `/Transactions/${tx.id}?tab=activity`,
        referenceId: tx.id, referenceType: 'Transaction', title: `${me.full_name || me.email} mentioned you`, message: `${tx.property_address}: ${text.slice(0, 200)}` });
    }
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
