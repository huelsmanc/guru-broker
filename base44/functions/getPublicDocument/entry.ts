import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const docId = url.searchParams.get('docId');

    if (!docId) {
      return Response.json({ error: 'Document ID required' }, { status: 400 });
    }

    // Create request with Base44-App-Id header for public document access
    const headers = new Headers(req.headers);
    headers.set('Base44-App-Id', Deno.env.get('BASE44_APP_ID') || '');

    const newReq = new Request(req.url, {
      method: 'GET',
      headers,
    });

    const base44 = createClientFromRequest(newReq);

    // Fetch document using service role (no auth required for public links)
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    
    if (!docs || docs.length === 0) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    return Response.json({ document: docs[0] });
  } catch (error) {
    console.error('Error fetching public document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});