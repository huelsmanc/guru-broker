import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));
    const { documentId, token } = body;
    const docId = documentId;
    const signingToken = token;

    if (!docId || !signingToken) {
      console.error('Missing fields:', { docId, signingToken });
      return Response.json({ error: 'Missing documentId or token' }, { status: 400 });
    }

    // Verify the signing token
    const tokenData = verifySigningToken(signingToken, docId);
    if (!tokenData) {
      return Response.json({ error: 'Invalid or expired signing token' }, { status: 401 });
    }

    // Create client from request for proper authentication
    const base44 = createClientFromRequest(req);
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    
    if (docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const document = docs[0];

    // Verify the signer is authorized for this document
    const signerInfo = document.signatories?.find(s => s.email === tokenData.signerEmail);
    if (!signerInfo) {
      return Response.json({ error: 'Signer not authorized for this document' }, { status: 403 });
    }

    // Verify document hasn't already been fully signed (to prevent re-signing)
    if (document.status === 'signed') {
      return Response.json({ error: 'Document already signed', alreadySigned: true }, { status: 400 });
    }

    // Return document details safely
    return Response.json({
      document: {
        id: document.id,
        title: document.title,
        document_url: document.document_url,
        original_document_url: document.original_document_url,
        created_by_name: document.created_by_name,
        created_date: document.created_date,
        signature_fields: document.signature_fields,
        signatories: document.signatories,
        require_sequential_signing: document.require_sequential_signing,
        status: document.status,
        brokerage_id: document.brokerage_id,
      },
    });
  } catch (error) {
    console.error('Error retrieving document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function verifySigningToken(token, docId) {
  try {
    const decoded = atob(token);
    const tokenData = JSON.parse(decoded);

    if (!tokenData.docId || !tokenData.signerEmail || !tokenData.timestamp) {
      return null;
    }

    if (tokenData.docId !== docId) {
      return null;
    }

    const tokenAge = Date.now() - tokenData.timestamp;
    if (tokenAge > 24 * 60 * 60 * 1000) {
      return null;
    }

    return tokenData;
  } catch (error) {
    return null;
  }
}