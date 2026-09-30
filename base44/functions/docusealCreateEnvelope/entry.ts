import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { title, signers, documentUrl } = await req.json();
    if (!title || !signers?.length || !documentUrl) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    const signingLinks = [];

    // Create envelope in DocuSeal
    const envelopeResponse = await fetch('https://api.docuseal.com/envelopes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: title,
        documents: [{ file_url: documentUrl }],
        signers: signers.map((signer, idx) => ({
          email: signer.email,
          name: signer.name,
          order: signer.order || idx + 1,
        })),
      }),
    });

    if (!envelopeResponse.ok) {
      const error = await envelopeResponse.text();
      console.error('DocuSeal error:', error);
      return Response.json({ error: 'Failed to create DocuSeal envelope' }, { status: 500 });
    }

    const envelope = await envelopeResponse.json();

    return Response.json({
      envelopeId: envelope.uuid,
      signingUrl: envelope.signing_url,
      signers: envelope.signers || signers,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});