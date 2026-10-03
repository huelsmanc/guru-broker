// Keeps a checklist item in step with the e-sign request sent from it:
//   sent -> partly signed -> signed (the signed PDF lands on the item).
// Onboarding items (ICA, W-9...) are approved automatically once everyone has signed, since the
// broker sent the exact document and every signature is recorded. Deal items still go to review.
import { adminClient } from './base44.js';
import { checklistStatus } from './checklists.js';

const lc = (e) => String(e || '').toLowerCase().trim();

/** Change one checklist item safely (others may be changing the same checklist). */
export async function changeItem(checklistId, itemId, fn) {
  const db = adminClient();
  for (let i = 0; i < 6; i += 1) {
    const { data: cl } = await db.from('checklist').select('*').eq('id', checklistId).maybeSingle();
    if (!cl) return null;
    const items = [...(cl.items || [])];
    const idx = items.findIndex((x) => x.id === itemId);
    if (idx < 0) return null;
    const next = fn({ ...items[idx], history: [...(items[idx].history || [])] }, cl);
    if (!next) return cl;
    items[idx] = next;
    let q = db.from('checklist').update({ items, status: checklistStatus(items) }).eq('id', cl.id);
    if (cl.updated_date) q = q.eq('updated_date', cl.updated_date);
    const { data: saved } = await q.select('*');
    if (saved?.length) return saved[0];
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 100));
  }
  throw new Error('Checklist busy, try again');
}

const signerView = (sub) => (sub.signers || []).map((s) => ({ name: s.name, email: lc(s.email), signed: !!s.signed, signed_at: s.signed_at || null, order: s.order }));

/** After a request goes out from a checklist item. */
export async function markSent(doc, sub, sender) {
  if (!doc?.checklist_id || !doc?.checklist_item_id) return;
  const at = new Date().toISOString();
  await changeItem(doc.checklist_id, doc.checklist_item_id, (it) => ({
    ...it,
    esign: { document_id: doc.id, submission_id: sub.id, title: doc.title, status: 'sent', sent_at: at, sent_by: lc(sender?.email), sent_by_name: sender?.full_name || sender?.display_name || '', signers: signerView(sub) },
    status: ['approved', 'exempt'].includes(it.status) ? it.status : 'open',
    history: [...it.history, { at, by: lc(sender?.email) || 'e-sign', what: `sent for signature to ${signerView(sub).map((s) => s.name || s.email).join(', ')}` }],
  })).catch((e) => console.error('checklist e-sign (sent):', e.message));
}

/** After each signature, while others still have to sign. */
export async function markProgress(doc, sub) {
  if (!doc?.checklist_id || !doc?.checklist_item_id) return;
  await changeItem(doc.checklist_id, doc.checklist_item_id, (it) => (it.esign?.submission_id !== sub.id ? null : {
    ...it, esign: { ...it.esign, status: 'partly_signed', signers: signerView(sub) },
  })).catch((e) => console.error('checklist e-sign (progress):', e.message));
}

/** Everyone signed: the signed copy goes on the item. Returns the checklist (or null). */
export async function markSigned(doc, sub, link) {
  if (!doc?.checklist_id || !doc?.checklist_item_id) return null;
  const at = new Date().toISOString();
  return changeItem(doc.checklist_id, doc.checklist_item_id, (it, cl) => {
    if (cl.brokerage_id !== doc.brokerage_id) return null;
    const onboarding = cl.subject_type === 'onboarding' && it.esign?.submission_id === sub.id;
    const keep = ['approved', 'review_requested', 'exempt'].includes(it.status);
    return {
      ...it,
      document_url: link, document_name: `${doc.title} (signed)`, uploaded_by: 'e-sign', uploaded_at: at,
      ...(it.esign ? { esign: { ...it.esign, status: 'signed', completed_at: at, signers: signerView(sub) } } : {}),
      ...(onboarding
        ? { status: it.status === 'exempt' ? 'exempt' : 'approved', reviewed_by: 'e-sign', reviewed_at: at }
        : { status: keep ? it.status : 'uploaded' }),
      history: [...it.history, { at, by: 'e-sign', what: onboarding ? 'signed by everyone; approved' : 'signed copy attached' }],
    };
  });
}

/** Signed copies of onboarding paperwork (W-9s carry tax numbers) open only for people allowed to see them: no key in the link. */
export function privateSignedLink(sub) {
  return `/api/fn/viewSignedDocument?submission_id=${encodeURIComponent(sub.id)}`;
}
