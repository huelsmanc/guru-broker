import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { docId, docusealId } = await req.json();

    if (!docId || !docusealId) {
      return Response.json({ error: 'Missing docId or docusealId' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'DocuSeal API key not configured' }, { status: 500 });
    }

    // Delete from DocuSeal
    const docusealResponse = await fetch(`https://api.docuseal.com/envelopes/${docusealId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!docusealResponse.ok && docusealResponse.status !== 404) {
      console.error('DocuSeal deletion failed:', docusealResponse.status, await docusealResponse.text());
      // Continue anyway - delete from our DB
    }

    // Delete from our database
    await base44.asServiceRole.entities.ESignDocument.delete(docId);

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});