import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { templateId, signers, externalId } = await req.json();

    if (!templateId || !signers || !Array.isArray(signers) || signers.length === 0) {
      return Response.json({ error: 'templateId and signers array required' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'DocuSeal API key not configured' }, { status: 500 });
    }

    // Format signers for DocuSeal API
    const formattedSigners = signers.map((signer, index) => ({
      email: signer.email,
      name: signer.name || signer.email.split('@')[0],
      order: signer.order || index + 1,
    }));

    // Create submission via DocuSeal API
    const response = await fetch('https://api.docuseal.com/submissions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        template_id: templateId,
        user_email: "huelsman.cody@gmail.com",
        send_email: true,
        send_sms: false,
        submitters: formattedSigners,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('DocuSeal API error:', response.status, error);
      return Response.json(
        { error: `DocuSeal API error: ${response.status}` },
        { status: response.status }
      );
    }

    const submission = await response.json();

    console.log(`Submission created: ${submission.id} by ${user.email}`);

    return Response.json({
      status: 'success',
      submission_id: submission.id,
      url: submission.url,
      external_id: externalId,
    });
  } catch (error) {
    console.error('Error sending submission:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});