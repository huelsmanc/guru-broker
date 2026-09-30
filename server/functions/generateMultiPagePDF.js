// Ported from Base44 function `generateMultiPagePDF`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { docId, documentPages, signatureFields } = await req.json();

    if (!docId || !documentPages || documentPages.length === 0 || !signatureFields) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Fetch the document to update
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    if (docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = docs[0];

    // Verify user has access to this document's brokerage
    if (document.brokerage_id !== user.brokerage_id && user.role !== 'admin') {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    // Update document with multi-page signature fields
    // Each field now includes a 'page' property indicating which page it's on
    const updatedSignatureFields = signatureFields.map(field => ({
      ...field,
      page: field.page ?? 0, // Default to first page if not specified
    }));

    await base44.asServiceRole.entities.ESignDocument.update(docId, {
      signature_fields: updatedSignatureFields,
      versions: [
        ...(document.versions || []),
        {
          version: (document.versions?.length || 0) + 1,
          document_url: documentPages[0], // Store first page as main reference
          created_date: new Date().toISOString(),
          description: `Added ${updatedSignatureFields.length} signature fields across ${documentPages.length} page(s)`,
        }
      ]
    });

    return Response.json({
      status: 'success',
      docId,
      fieldCount: updatedSignatureFields.length,
      pageCount: documentPages.length,
      message: `Added ${updatedSignatureFields.length} signature fields across ${documentPages.length} pages`,
    });
  } catch (error) {
    console.error('Error updating multi-page PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});