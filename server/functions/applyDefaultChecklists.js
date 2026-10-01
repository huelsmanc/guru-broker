// New (automation): when a transaction or a user is created, adds the checklist templates
// marked "Add automatically" (transactions: matching deal type or any; users: onboarding).
import { createClientFromRequest } from '../lib/base44.js';
import { applyTemplate } from '../lib/checklists.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    const E = base44.asServiceRole.entities;
    const row = event?.data;
    if (!row?.brokerage_id) return Response.json({ skipped: 'no brokerage' });
    const isTx = event.entity_name === 'Transaction';
    // Deals opened from an accepted offer get the checklists the agent picked instead.
    if (isTx && row.offer_id) return Response.json({ skipped: 'agent chose checklists' });
    // Imported people and deals (Base44, Brokermint) already exist; don't add new-hire or new-deal checklists.
    if (row.imported || (isTx && row.status === 'closed')) return Response.json({ skipped: 'imported or closed' });
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
      await applyTemplate(E, t, { brokerageId: row.brokerage_id, subjectType: kind, subjectId, owner });
      added += 1;
    }
    return Response.json({ added });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
