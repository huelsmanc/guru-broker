import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const { docId } = await req.json();
    
    if (!docId) {
      return Response.json({ error: 'Missing docId' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    
    // Fetch document as service role (no auth required)
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: docId });
    const doc = docs?.[0];
    
    if (!doc) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    return Response.json(doc);
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});