import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { docId } = await req.json();

    if (!docId) {
      return Response.json({ error: 'Missing docId' }, { status: 400 });
    }

    // Fetch the document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    if (!docs || docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    const doc = docs[0];

    // Check if document already has a hash
    if (!doc.document_hash) {
      return Response.json({
        status: 'error',
        verified: false,
        message: 'Document hash not found - document may be corrupted or invalid',
      });
    }

    // Fetch and hash the current document
    const docResponse = await fetch(doc.document_url);
    if (!docResponse.ok) {
      return Response.json({ error: 'Failed to fetch document' }, { status: 400 });
    }

    const docBuffer = await docResponse.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', docBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const currentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Compare hashes
    const isValid = currentHash === doc.document_hash;

    if (!isValid) {
      console.warn(`Document hash mismatch for ${docId}: expected ${doc.document_hash}, got ${currentHash}`);
    }

    return Response.json({
      status: 'success',
      verified: isValid,
      originalHash: doc.document_hash,
      currentHash,
      docId,
      message: isValid ? 'Document integrity verified' : 'Document has been tampered with',
    });
  } catch (error) {
    console.error('Integrity verification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});