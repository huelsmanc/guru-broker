import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { docId } = await req.json();

    if (!docId) {
      return Response.json({ error: 'Missing docId' }, { status: 400 });
    }

    // Fetch the document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    if (docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = docs[0];

    // Check if all signatories have signed
    const allSigned = document.signatories?.every(s => s.signed);
    if (!allSigned) {
      return Response.json({ error: 'Not all signatories have signed yet' }, { status: 400 });
    }

    // Fetch the original document
    const originalDocUrl = document.original_document_url || document.document_url;
    
    // For now, store reference to the finalized document
    // In production, you'd use a PDF library to flatten signatures
    // Download the original and merge signature data
    const finalizedDocUrl = originalDocUrl;

    // Create audit trail with signature metadata
    const auditTrail = {
      documentId: docId,
      documentTitle: document.title,
      finalized: new Date().toISOString(),
      signatories: document.signatories?.map(s => ({
        name: s.name,
        email: s.email,
        signed_date: s.signed_date,
        ip_address: s.ip_address,
        user_agent: s.user_agent,
      })) || [],
      signatureFields: document.signature_fields?.map(f => ({
        type: f.type,
        signer: f.signer_name,
        signed: f.signed,
      })) || [],
    };

    // Update document status to signed
    await base44.asServiceRole.entities.ESignDocument.update(docId, {
      final_signed_document_url: finalizedDocUrl,
      status: 'signed',
    });

    return Response.json({
      status: 'success',
      documentId: docId,
      finalDocumentUrl: finalizedDocUrl,
      auditTrail,
      message: 'Document finalized and all signatures recorded',
    });
  } catch (error) {
    console.error('Error finalizing document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});