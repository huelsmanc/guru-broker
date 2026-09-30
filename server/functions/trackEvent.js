// New: records sign-ins and a few other user actions in the Activity log.
import { createClientFromRequest } from '../lib/base44.js';

const ALLOWED = new Set(['signed_in', 'viewed_transaction', 'downloaded_document', 'exported_report']);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { event, record_id, summary } = await req.json();
    if (!ALLOWED.has(event)) return Response.json({ error: 'Unknown event' }, { status: 400 });
    await base44.asServiceRole.entities.ActivityEvent.create({
      brokerage_id: me.brokerage_id, actor_email: me.email.toLowerCase(), table_name: 'session', op: event,
      record_id: record_id || null, summary: String(summary || '').slice(0, 200), changed: [], created_by: me.email.toLowerCase(),
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
