// AI check of a checklist document, before a person reviews it.
//   { checklist_id, item_id, auto?, force? }
// Reads the document and checks it against what the item asks for (is it the inspection addendum?)
// and against the deal (address, price, people, dates). Finds empty signature/initial boxes and
// blanks. The result is saved on the item (ai_review) so the agent and the approver both see it:
//   verdict 'looks_complete' | 'needs_attention' | 'unreadable', plus a short list of issues.
// Runs automatically when an agent submits an item; approvers can run it again.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { pathFromUrl, signedUrlFor } from '../lib/files.js';
import { changeItem } from '../lib/checklistEsign.js';
import { notifyPeople } from '../lib/team.js';

const lc = (e) => String(e || '').toLowerCase().trim();
const STALE_MS = 3 * 60_000; // a check that never finished can be started again after this

const SCHEMA = {
  type: 'object',
  properties: {
    document_type: { type: 'string', description: 'What the document actually is, e.g. "Inspection Contingency Addendum", "Seller Property Disclosure"' },
    matches_item: { type: 'boolean', description: 'true if this is the document the checklist item asks for' },
    matches_note: { type: ['string', 'null'], description: 'If it is not the requested document, say what it is instead' },
    summary: { type: 'string', description: 'One sentence for the reviewer' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          description: { type: 'string', description: 'Short and specific, e.g. "Seller initials missing on page 4"' },
          page: { type: ['integer', 'null'] },
        },
        required: ['severity', 'description'],
      },
    },
    mismatches: {
      type: 'array',
      description: 'Facts in the document that differ from the deal record',
      items: {
        type: 'object',
        properties: { field: { type: 'string' }, document_value: { type: 'string' }, deal_value: { type: 'string' } },
        required: ['field', 'document_value', 'deal_value'],
      },
    },
  },
  required: ['document_type', 'matches_item', 'summary', 'issues', 'mismatches'],
};

/** A link the AI can read: private uploads and e-signed copies become short-lived storage links. */
async function readableUrl(base44, url) {
  const sub = String(url || '').match(/viewSignedDocument\?submission_id=([^&]+)/);
  if (sub) {
    const [s] = await base44.asServiceRole.entities.ESignSubmission.filter({ id: decodeURIComponent(sub[1]) }, '-created_date', 1);
    if (!s?.signed_pdf_path) return null;
    const { data } = await adminClient().storage.from('private-files').createSignedUrl(String(s.signed_pdf_path).replace(/^private-files\//, ''), 900);
    return data?.signedUrl || null;
  }
  // Seeing the checklist (checked above) is what allows reading its document.
  if (pathFromUrl(url)) return signedUrlFor(url, 900);
  return /^https:\/\//.test(String(url)) ? url : null;
}
const readable = (url) => /\.(pdf|png|jpe?g|gif|webp)(\?|$)/i.test(String(url || '').split('#')[0]) || /viewSignedDocument/.test(String(url || ''));

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not signed in' }, { status: 401 });
    const body = await req.json().catch(() => ({}));
    // The person's own access decides whether they can see this checklist at all.
    const [cl] = await base44.entities.Checklist.filter({ id: String(body.checklist_id || '') }, '-created_date', 1);
    if (!cl) return Response.json({ error: 'Checklist not found' }, { status: 404 });
    const item = (cl.items || []).find((i) => i.id === body.item_id);
    if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });
    if (!item.document_url) return Response.json({ error: 'No document on this item yet' }, { status: 400 });

    const prev = item.ai_review;
    const same = prev?.document_url === item.document_url;
    if (same && prev.status === 'done' && !body.force) return Response.json({ review: prev });
    if (same && prev.status === 'checking' && Date.now() - Date.parse(prev.started_at || 0) < STALE_MS) return Response.json({ review: prev });

    const docUrl = item.document_url;
    const save = (review) => changeItem(cl.id, item.id, (it) => (it.document_url !== docUrl ? null : { ...it, ai_review: review }));
    if (!readable(docUrl)) {
      const review = { status: 'done', verdict: 'unreadable', summary: 'The AI can only read PDFs and photos. Check this one by eye.', issues: [], mismatches: [], document_url: docUrl, checked_at: new Date().toISOString() };
      await save(review);
      return Response.json({ review });
    }
    await save({ status: 'checking', document_url: docUrl, started_at: new Date().toISOString() });

    // What it should be, and what the deal says.
    let facts = '';
    if (cl.subject_type === 'transaction') {
      const tx = await base44.asServiceRole.entities.Transaction.get(cl.subject_id).catch(() => null);
      if (tx) {
        const f = {
          property_address: tx.property_address, sale_price: tx.sale_price, buyers: tx.buyers, sellers: tx.sellers,
          acceptance_date: tx.acceptance_date, inspection_contingency_date: tx.inspection_contingency_date,
          financing_contingency_date: tx.financing_contingency_date, appraisal_date: tx.appraisal_date, closing_date: tx.closing_date,
          deal_type: tx.deal_type || tx.transaction_type,
        };
        facts = `The deal on file:\n${JSON.stringify(Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length))), null, 1)}`;
      }
    } else {
      const [agent] = await base44.asServiceRole.entities.User.filter({ email: lc(cl.subject_email) }, '-created_date', 1);
      facts = `This is part of a real estate agent's onboarding. The agent is ${agent?.display_name || agent?.full_name || cl.subject_email}${agent?.license_number ? `, license ${agent.license_number}` : ''}.`;
    }

    let review;
    try {
      const url = await readableUrl(base44, docUrl);
      if (!url) throw new Error('The document could not be opened.');
      const today = new Date().toISOString().slice(0, 10);
      const r = await InvokeLLM({
        file_urls: [url],
        response_json_schema: SCHEMA,
        max_tokens: 2500,
        system: 'You are a careful real estate compliance reviewer at a brokerage. You check documents before the broker approves them. You report only what you can see, never guess, and keep each issue short and specific.',
        prompt: `Today is ${today}. The checklist item is "${item.title}". Check the attached document for the broker.
${facts}

Check:
1. Is this the document the item asks for? (matches_item; if not, say what it is in matches_note)
2. Every signature line, initial box and date next to a signature: list any that are empty, with the page.
3. Required blanks left empty, missing pages (e.g. "page 3 of 6" but only 5 pages), or text that is cut off or unreadable.
4. Facts that differ from the deal on file (address, price, buyer or seller names, dates). Small formatting differences don't count.
5. Anything else a broker would send back.
If it all looks right, return no issues. Do not list things that are fine.`,
      });
      const issues = (r.issues || []).slice(0, 12);
      const mismatches = (r.mismatches || []).slice(0, 8);
      const needs = r.matches_item === false || issues.some((i) => i.severity !== 'low') || mismatches.length > 0;
      review = {
        status: 'done', verdict: needs ? 'needs_attention' : 'looks_complete',
        document_type: String(r.document_type || '').slice(0, 120), matches_item: r.matches_item !== false, matches_note: r.matches_note || null,
        summary: String(r.summary || '').slice(0, 300), issues, mismatches,
        document_url: docUrl, checked_at: new Date().toISOString(),
      };
    } catch (err) {
      console.error('docReview:', err.message);
      review = { status: 'error', error: 'The AI check could not finish. Try again.', document_url: docUrl, checked_at: new Date().toISOString() };
    }
    await save(review);

    // Submitted by the agent and something's off: tell them now, so they can fix it before review.
    const uploader = lc(item.uploaded_by);
    if (body.auto && review.verdict === 'needs_attention' && uploader && uploader.includes('@')) {
      const n = (review.matches_item ? 0 : 1) + review.issues.length + review.mismatches.length;
      await notifyPeople(base44.asServiceRole.entities, {
        brokerageId: cl.brokerage_id, people: [{ email: uploader }],
        title: `AI check: ${n} thing${n === 1 ? '' : 's'} to look at on "${item.title}"`,
        message: !review.matches_item ? `This may not be the right document${review.matches_note ? `: ${review.matches_note}` : ''}.` : (review.issues[0]?.description || review.mismatches[0] && `${review.mismatches[0].field}: document says ${review.mismatches[0].document_value}, deal says ${review.mismatches[0].deal_value}`) || review.summary,
        link: cl.subject_type === 'transaction' ? `/Transactions/${cl.subject_id}?tab=checklists&checklist=${cl.id}&item=${item.id}` : '/Profile#onboarding',
        referenceId: item.id, referenceType: 'Checklist', email: false,
      }).catch(() => {});
    }
    return Response.json({ review });
  } catch (error) {
    console.error('docReview:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
