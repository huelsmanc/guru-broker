import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    console.log('[getPublicDocumentBySlug] Function called');
    const body = await req.json().catch(() => ({}));
    const { slug } = body;

    console.log('[getPublicDocumentBySlug] Request body:', { slug });

    if (!slug) {
      console.error('[getPublicDocumentBySlug] Missing slug');
      return Response.json({ 
        success: false, 
        error: 'Missing document slug' 
      }, { status: 400 });
    }

    // Use createClientFromRequest which handles auth context appropriately for public access
    const base44 = createClientFromRequest(req);

    console.log('[getPublicDocumentBySlug] Fetching document with slug:', slug);
    
    // Query documents by slug using service role to bypass security rules
    // ESignDocument should be readable by service role for public signing links
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ slug });
    
    console.log('[getPublicDocumentBySlug] Document count found:', docs.length);

    if (docs.length === 0) {
      console.error('[getPublicDocumentBySlug] Document not found with slug:', slug);
      return Response.json({ 
        success: false, 
        error: 'Document not found' 
      }, { status: 404 });
    }

    const document = docs[0];

    // Return document details for public signing
    console.log('[getPublicDocumentBySlug] Returning document:', document.id);
    return Response.json({
      success: true,
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
    console.error('[getPublicDocumentBySlug] Caught error:', error.message);
    return Response.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
});