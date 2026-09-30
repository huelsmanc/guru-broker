// Ported from Base44 function `getSubmissionByToken`. Logic unchanged.
import { createClientFromRequest, createClient } from '../lib/base44.js';

export default (async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    // Public endpoint — always use service role, ignore user auth
    const base44 = createClientFromRequest(req);
    const { token } = await req.json();

    if (!token) {
      return Response.json({ error: 'token required' }, { status: 400 });
    }

    const submissions = await base44.asServiceRole.entities.ESignSubmission.list('-created_date', 1000);
    const submission = submissions.find(s => s.signers?.some(sig => sig.token === token));

    if (!submission) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 404 });
    }

    // Fetch document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: submission.document_id }, '-created_date', 1);
    const document = docs[0] || null;

    if (!document) {
      return Response.json({ error: 'Document not found' }, { status: 404 });
    }

    // If URL looks like a private file URI (starts with /), generate a signed URL
    let documentUrl = document.document_url;
    if (documentUrl && documentUrl.startsWith('/')) {
      try {
        const signedRes = await base44.asServiceRole.integrations.Core.CreateFileSignedUrl({
          file_uri: documentUrl,
          expires_in: 86400,
        });
        documentUrl = signedRes.signed_url || documentUrl;
      } catch (err) {
        console.error('Failed to create signed URL:', err.message);
      }
    }

    console.log('Returning document URL:', documentUrl);
    return Response.json({ submission, document: { ...document, document_url: documentUrl } });
  } catch (error) {
    console.error('Error fetching submission:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});