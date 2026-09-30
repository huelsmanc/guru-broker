// New: AI transaction file check. Reviews a transaction before closing and lists what's
// missing or at risk, most important first.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { transactionId } = await req.json();
    const tx = await base44.entities.Transaction.get(transactionId); // uses the user's own access
    if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });

    const lists = await base44.entities.Checklist.filter({ subject_type: 'transaction', subject_id: transactionId }, 'created_date', 20).catch(() => []);
    const subs = await base44.entities.ESignSubmission.filter({ transaction_id: transactionId }, '-created_date', 50).catch(() => []);
    const today = new Date().toISOString().slice(0, 10);
    const file = {
      today,
      property: tx.property_address,
      status: tx.status,
      price: tx.sale_price,
      buyers: tx.buyers,
      sellers: tx.sellers,
      agent: tx.agent_name,
      tc: tx.tc_name,
      dates: {
        acceptance: tx.acceptance_date, inspection: tx.inspection_date, inspection_contingency: tx.inspection_contingency_date,
        appraisal: tx.appraisal_date, financing_contingency: tx.financing_contingency_date, loan_approval: tx.loan_approval_date,
        title_deadline: tx.title_deadline_date, closing: tx.closing_date, completed: tx.completed_dates,
      },
      commission: { type: tx.commission_type, amount: tx.commission_amount, percentage: tx.commission_percentage },
      documents: (tx.documents || []).map((d) => d.name),
      checklist: lists.flatMap((l) => (l.items || []).map((c) => `[${c.status}] ${c.title}${c.requires_document ? ' (document)' : ''}${c.due_date ? ` due ${c.due_date}` : ''}`)),
      signing_requests: subs.map((s) => ({ status: s.status, signed: (s.signers || []).filter((x) => x.signed).length, of: (s.signers || []).length })),
      recent_updates: (tx.updates || []).slice(-8).map((u) => `${u.posted_at?.slice(0, 10)} ${u.milestone || ''} ${u.message || ''}`),
    };

    const result = await InvokeLLM({
      max_tokens: 2500,
      system: 'You are a senior transaction coordinator and compliance reviewer at a residential real estate brokerage. Be specific and practical. Only flag what the data supports.',
      response_json_schema: {
        type: 'object',
        properties: {
          score: { type: 'integer', description: '0-100 file readiness' },
          headline: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                severity: { type: 'string', enum: ['critical', 'warning', 'info'] },
                title: { type: 'string' },
                detail: { type: 'string' },
                suggested_task: { type: ['string', 'null'], description: 'A checklist task to add, if useful' },
              },
              required: ['severity', 'title', 'detail'],
            },
          },
        },
        required: ['score', 'headline', 'items'],
      },
      prompt: `Review this transaction file and list what's missing or at risk before closing, most urgent first.
Check: deadlines passed or within 3 days without being marked complete; missing standard documents for a residential sale (executed purchase agreement, addenda, required disclosures such as lead paint for pre-1978 homes, inspection report, appraisal, loan commitment, title commitment, settlement statement); unsigned or incomplete signing requests; missing parties, TC or commission details; open checklist items near their deadline.
File:
${JSON.stringify(file, null, 1)}`,
    });
    return Response.json({ result });
  } catch (error) {
    console.error('aiFileCheck:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
