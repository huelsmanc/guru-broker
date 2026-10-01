// Sends a document for signature. Rewritten during the migration (see server/lib/esign.js):
// requires sign-in and document ownership, supports sign-in-order, escapes email content.
import { createClientFromRequest } from '../lib/base44.js';
import { startSigning } from '../lib/esign.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const { documentId, signers, sequenceType, transactionId, message, options } = await req.json();
    if (!documentId) return Response.json({ error: 'documentId required' }, { status: 400 });

    const entities = base44.asServiceRole.entities;
    const [doc] = await entities.ESignDocument.filter({ id: documentId }, '-created_date', 1);
    if (!doc) return Response.json({ error: 'Document not found' }, { status: 404 });
    if (doc.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') {
      return Response.json({ error: 'Not allowed' }, { status: 403 });
    }

    const sub = await startSigning({ entities, doc, signers, sequenceType, transactionId, sender: me, message, req, options: options || {} });
    return Response.json({ status: 'success', submission_id: sub.id });
  } catch (error) {
    console.error('createESignSubmission:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
