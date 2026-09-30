import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { envelopeId } = await req.json();
    if (!envelopeId) {
      return Response.json({ error: 'Missing envelopeId' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');

    const response = await fetch(`https://api.docuseal.com/envelopes/${envelopeId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return Response.json({ error: 'Envelope not found' }, { status: 404 });
    }

    const envelope = await response.json();
    return Response.json(envelope);
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});