// New: client-facing status page for a deal (/status?token=...). Read-only and limited
// to what the agent chose to share: progress, key dates, checklist progress, agent contact.
import { doneFields } from '../../shared/dealTimeline.js';
import { createClientFromRequest } from '../lib/base44.js';

const DATES = [['inspection_contingency_date', 'Inspection deadline'], ['appraisal_date', 'Appraisal'], ['financing_contingency_date', 'Financing deadline'],
  ['loan_approval_date', 'Loan approval'], ['title_deadline_date', 'Title commitment'], ['closing_date', 'Closing']];

export default async (req) => {
  try {
    const { token } = await req.json().catch(() => ({}));
    if (!token || String(token).length < 20) return Response.json({ error: 'This link is not valid.' }, { status: 404 });
    const E = createClientFromRequest(req).asServiceRole.entities;
    const [tx] = await E.Transaction.filter({ share_token: String(token) }, '-created_date', 1);
    if (!tx || !tx.share_enabled) return Response.json({ error: 'This link is not active. Ask your agent for a new one.' }, { status: 404 });
    const opts = { dates: true, checklist: true, agent: true, ...(tx.share_options || {}) };
    const [agent] = await E.User.filter({ email: String(tx.agent_email || '').toLowerCase() }, '-created_date', 1);
    let progress = null;
    if (opts.checklist) {
      const lists = await E.Checklist.filter({ subject_type: 'transaction', subject_id: tx.id }, 'created_date', 20);
      const items = lists.flatMap((l) => l.items || []).filter((i) => i.required !== false);
      progress = { done: items.filter((i) => ['approved', 'exempt', 'done'].includes(i.status)).length, total: items.length,
        steps: items.filter((i) => !i.requires_document).map((i) => ({ title: i.title, done: ['done', 'approved', 'exempt'].includes(i.status) })) };
    }
    const done = doneFields(tx);
    return Response.json({
      property: tx.property_address,
      status: tx.status,
      dates: opts.dates ? DATES.filter(([k]) => tx[k]).map(([k, label]) => ({ label, date: tx[k], done: done.has(k) })) : [],
      progress,
      agent: opts.agent && agent ? { name: agent.display_name || agent.full_name, email: agent.email, phone: agent.phone || null, photo: agent.headshot || null } : null,
    });
  } catch (error) {
    return Response.json({ error: 'Could not load this page.' }, { status: 500 });
  }
};
