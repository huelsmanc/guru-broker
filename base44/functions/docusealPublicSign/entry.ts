Deno.serve(async (req) => {
  try {
    const { envelopeId, signingToken } = await req.json();
    if (!envelopeId || !signingToken) {
      return Response.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');

    // Get envelope and validate token
    const response = await fetch(`https://api.docuseal.com/envelopes/${envelopeId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      return Response.json({ error: 'Envelope not found' }, { status: 404 });
    }

    const envelope = await response.json();

    // Find the signing link for this token
    const signerLink = envelope.signers?.find(s => s.signing_token === signingToken);
    if (!signerLink) {
      return Response.json({ error: 'Invalid signing token' }, { status: 403 });
    }

    return Response.json({
      envelope,
      signerLink,
      signUrl: signerLink.sign_url,
    });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});