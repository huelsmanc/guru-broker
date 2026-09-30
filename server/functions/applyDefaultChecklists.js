// New (automation): when a transaction or a user is created, adds the checklist templates
// marked "Add automatically" (transactions: matching deal type or any; users: onboarding).
import { createClientFromRequest } from '../lib/base44.js';

const newId = () => crypto.randomUUID().slice(0, 12);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    const E = base44.asServiceRole.entities;
    const row = event?.data;
    if (!row?.brokerage_id) return Response.json({ skipped: 'no brokerage' });
    const isTx = event.entity_name === 'Transaction';
    const kind = isTx ? 'transaction' : 'onboarding';
    const dealType = isTx ? row.deal_type || row.transaction_type || null : null;
    const templates = (await E.ChecklistTemplate.filter({ brokerage_id: row.brokerage_id, is_default: true }, 'name', 50))
      .filter((t) => t.active !== false && (t.kind || 'transaction') === kind && (!isTx || !t.deal_type || t.deal_type === dealType));
    const owner = String(isTx ? row.agent_email || '' : row.email || '').toLowerCase();
    if (!owner) return Response.json({ skipped: 'no owner' });
    const subjectId = isTx ? row.id : owner;
    const existing = await E.Checklist.filter({ subject_id: subjectId }, '-created_date', 100);
    let added = 0;
    for (const t of templates) {
      if (existing.some((c) => c.template_id === t.id)) continue;
      const items = (t.items || []).map((i) => ({ ...i, id: newId(), status: 'open', assignee_email: i.assignee_email || owner, comments: [], history: [] }));
      await E.Checklist.create({ brokerage_id: row.brokerage_id, subject_type: kind, subject_id: subjectId, subject_email: owner, template_id: t.id, name: t.name, items, status: 'open' });
      added += 1;
    }
    return Response.json({ added });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
