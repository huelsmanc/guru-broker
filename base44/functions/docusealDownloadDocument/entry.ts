import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { envelopeId } = await req.json();

    if (!envelopeId) {
      return Response.json({ error: 'Missing envelopeId' }, { status: 400 });
    }

    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'DocuSeal API key not configured' }, { status: 500 });
    }

    // Fetch envelope to get submission details
    const envelopeRes = await fetch(`https://api.docuseal.com/envelopes/${envelopeId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!envelopeRes.ok) {
      return Response.json({ error: 'Failed to fetch envelope' }, { status: 500 });
    }

    const envelope = await envelopeRes.json();

    // Get the first submission (completed document)
    if (!envelope.submissions || envelope.submissions.length === 0) {
      return Response.json({ error: 'No completed submissions found' }, { status: 404 });
    }

    const submission = envelope.submissions[0];
    const submissionId = submission.id;

    // Download the signed document
    const docRes = await fetch(`https://api.docuseal.com/submissions/${submissionId}/download`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!docRes.ok) {
      return Response.json({ error: 'Failed to download document' }, { status: 500 });
    }

    // Get the PDF blob
    const pdfBuffer = await docRes.arrayBuffer();

    // Upload to Base44 storage
    const uploadRes = await fetch('https://api.base44.com/storage/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/pdf',
      },
      body: pdfBuffer,
    });

    // For now, return a temporary signed URL for the document
    // In a real scenario, you'd upload to your storage and get a permanent URL
    const fileName = `${envelope.template_name || 'Document'}_Signed_${new Date().getTime()}.pdf`;

    return Response.json({
      file_url: `data:application/pdf;base64,${btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)))}`,
      fileName,
    });
  } catch (error) {
    console.error('Error downloading document:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});