// Creates a document from a saved template and sends it for signature.
// Rewritten during the migration to use the shared e-sign engine (server/lib/esign.js).
import { createClientFromRequest } from '../lib/base44.js';
import { startSigning } from '../lib/esign.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });

    const { templateId, signers, sequenceType, transactionId, message } = await req.json();
    if (!templateId) return Response.json({ error: 'templateId required' }, { status: 400 });

    const entities = base44.asServiceRole.entities;
    const [template] = await entities.ESignTemplate.filter({ id: templateId }, '-created_date', 1);
    if (!template) return Response.json({ error: 'Template not found' }, { status: 404 });
    if (template.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') {
      return Response.json({ error: 'Not allowed' }, { status: 403 });
    }

    const doc = await entities.ESignDocument.create({
      brokerage_id: template.brokerage_id,
      title: `${template.title} - ${new Date().toLocaleDateString('en-US')}`,
      document_url: template.document_url,
      original_document_url: template.document_url,
      fields: template.fields || [],
      signers: (signers || []).map((s, i) => ({ email: s.email, name: s.name || s.email, order: i + 1 })),
      created_by_email: me.email,
      created_by_name: me.full_name,
      transaction_id: transactionId || null,
      status: 'draft',
    });

    const sub = await startSigning({ entities, doc, signers, sequenceType, transactionId, sender: me, message, req });
    return Response.json({ status: 'success', submission_id: sub.id, document_id: doc.id });
  } catch (error) {
    console.error('createSubmissionFromTemplate:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
