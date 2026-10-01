// New: link an e-sign document to a deal (or change which deal). The signed copy goes into
// the deal's Unsorted documents (now if it's already signed, otherwise when it's done),
// so it can be sorted onto a checklist item from there.
// { documentId, transactionId }  (transactionId null unlinks future filing)
import { createClientFromRequest } from '../lib/base44.js';
import { audit } from '../lib/esign.js';
import { isAdminRole } from '../lib/team.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { documentId, transactionId } = await req.json();
    const entities = base44.asServiceRole.entities;
    const [doc] = await entities.ESignDocument.filter({ id: documentId }, '-created_date', 1);
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
    const mine = String(doc.created_by_email || '').toLowerCase() === me.email.toLowerCase();
    if (me.role !== 'super_admin' && (doc.brokerage_id !== me.brokerage_id || !(mine || isAdminRole(me.role)))) {
      return Response.json({ error: 'Only the sender or an admin can do that' }, { status: 403 });
    }
    let tx = null;
    if (transactionId) {
      // Through the person's own access: they can only link deals they can see.
      tx = await base44.entities.Transaction.get(transactionId).catch(() => null);
      if (!tx || tx.brokerage_id !== doc.brokerage_id) return Response.json({ error: 'Deal not found' }, { status: 404 });
    }
    await entities.ESignDocument.update(doc.id, { transaction_id: tx?.id || null });
    const subs = await entities.ESignSubmission.filter({ document_id: doc.id }, '-created_date', 20);
    let filed = 0;
    for (const sub of subs) {
      if (sub.status === 'voided') continue;
      const patch = { transaction_id: tx?.id || null };
      // New attachments go to the deal too (ones already attached stay where they are).
      if (tx && sub.status !== 'completed') patch.attach_scope = { kind: 'tx', id: tx.id };
      await entities.ESignSubmission.update(sub.id, patch);
      if (tx && sub.status === 'completed' && sub.signed_document_url) {
        const fresh = await entities.Transaction.get(tx.id);
        const docs = Array.isArray(fresh.documents) ? fresh.documents : [];
        if (!docs.some((d) => d.submission_id === sub.id)) {
          docs.push({ name: `${doc.title} (signed)`, url: sub.signed_document_url, submission_id: sub.id, uploaded_at: new Date().toISOString(), uploaded_by: 'E-Sign' });
          await entities.Transaction.update(tx.id, { documents: docs });
          filed++;
        }
      }
    }
    await audit(entities, { document_id: doc.id, action: 'linked_to_deal', details: tx ? `Linked to ${tx.property_address || tx.id} by ${me.email}` : `Unlinked from deal by ${me.email}` });
    return Response.json({ status: 'success', filed });
  } catch (error) {
    console.error('esignLinkDeal:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
