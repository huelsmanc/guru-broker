import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { documentUrl, docId } = await req.json();

    if (!documentUrl || !docId) {
      return Response.json({ error: 'Missing documentUrl or docId' }, { status: 400 });
    }

    // Fetch the document from the URL
    const docResponse = await fetch(documentUrl);
    if (!docResponse.ok) {
      return Response.json({ error: 'Failed to fetch document' }, { status: 400 });
    }

    const docBuffer = await docResponse.arrayBuffer();

    // Generate SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', docBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Store hash in document
    await base44.asServiceRole.entities.ESignDocument.update(docId, {
      document_hash: hashHex,
    });

    return Response.json({
      status: 'success',
      hash: hashHex,
      docId,
    });
  } catch (error) {
    console.error('Hash generation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});