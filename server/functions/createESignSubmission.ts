// Ported from Base44 function `createESignSubmission`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

async function sendEmail({ to, subject, html, text }) {
  console.log('Sending email to:', to, 'API key present:', !!RESEND_API_KEY);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'GuroBroker E-Sign <noreply@gurubroker.app>',
      to,
      subject,
      html,
      text,
    }),
  });
  const data = await res.json();
  console.log('Resend response status:', res.status, JSON.stringify(data));
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data;
}

export default (async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { documentId, documentTitle, signers, sequenceType, transactionId, createdByEmail, createdByName } = body;

    if (!documentId || !signers || !Array.isArray(signers) || signers.length === 0) {
      return Response.json({ error: 'documentId and signers array required' }, { status: 400 });
    }

    const docTitle = documentTitle || 'Document';
    const appUrl = Deno.env.get('BASE44_APP_URL') || 'https://gurubroker.app';
    const signingBaseUrl = `${appUrl}/api/functions/signingPage`;
    const fromName = createdByName || 'Your Agent';
    const fromEmail = createdByEmail || '';

    // Build signers with tokens
    const signersWithTokens = signers.map((s, i) => ({
      email: s.email,
      name: s.name || s.email.split('@')[0],
      order: sequenceType === 'sequential' ? i + 1 : 0,
      token: crypto.randomUUID(),
      signed: false,
      signed_at: null,
    }));

    // Create submission record using service role
    const created = await base44.asServiceRole.entities.ESignSubmission.create({
      document_id: documentId,
      transaction_id: transactionId || '',
      created_by_email: fromEmail,
      created_by_name: fromName,
      status: 'pending',
      sequence_type: sequenceType || 'all_at_once',
      signers: signersWithTokens,
      submitted_at: new Date().toISOString(),
      completed_at: null,
    });

    // Send emails sequentially so we can catch errors
    for (let i = 0; i < signersWithTokens.length; i++) {
      const signer = signersWithTokens[i];
      const signingLink = `${signingBaseUrl}?token=${signer.token}`;
      const sequenceNote = sequenceType === 'sequential' && i > 0
        ? `<p style="color:#666;font-size:14px;">You will be notified when it's your turn to sign.</p>`
        : '';
      try {
        await sendEmail({
          to: signer.email,
          subject: `Action Required: Please sign "${docTitle}"`,
          html: `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
<h2 style="color:#1a1a1a;">Document Signature Request</h2>
<p>Hello ${signer.name},</p>
<p>${fromName} has sent you a document that requires your signature.</p>
<p><strong>Document:</strong> ${docTitle}</p>
${sequenceNote}
<p style="margin-top:32px;">
  <a href="${signingLink}" style="display:inline-block;padding:14px 28px;background-color:#667eea;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">Review &amp; Sign Document</a>
</p>
<p style="margin-top:24px;font-size:13px;color:#666;">Or copy this link: ${signingLink}</p>
<hr style="margin-top:40px;border:none;border-top:1px solid #eee;" />
<p style="font-size:12px;color:#999;">This is an automated message from GuroBroker. Do not reply to this email.</p>
</body></html>`,
          text: `Hello ${signer.name},\n\n${fromName} has sent you a document that requires your signature.\n\nDocument: ${docTitle}\n\nSign here: ${signingLink}\n\nThis is an automated message from GuroBroker.`,
        });
        console.log('Email sent to:', signer.email);
      } catch (err) {
        console.error('Signer email failed:', signer.email, err.message);
      }
    }

    return Response.json({ status: 'success', submission_id: created.id });
  } catch (error) {
    console.error('Error creating submission:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});