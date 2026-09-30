// Ported from Base44 function `submitSignature`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const APP_URL = Deno.env.get('BASE44_APP_URL') || 'https://gurubroker.app';

async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'E-Sign <esign@gurubroker.app>',
      to,
      subject,
      html,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Resend error');
  return data;
}

export default (async (req) => {
  try {
    if (req.method !== 'POST') {
      return Response.json({ error: 'Method not allowed' }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const { submissionToken, signedFields, ipAddress, userAgent } = await req.json();

    if (!submissionToken || !signedFields) {
      return Response.json({ error: 'submissionToken and signedFields required' }, { status: 400 });
    }

    // Find submission by token
    const submissions = await base44.asServiceRole.entities.ESignSubmission.list('-created_date', 1000);
    const submission = submissions.find(s => s.signers?.some(sig => sig.token === submissionToken));

    if (!submission) {
      return Response.json({ error: 'Invalid or expired token' }, { status: 404 });
    }

    const signerIndex = submission.signers.findIndex(s => s.token === submissionToken);
    if (signerIndex === -1) {
      return Response.json({ error: 'Signer not found' }, { status: 404 });
    }

    const signer = submission.signers[signerIndex];

    if (signer.signed) {
      return Response.json({ error: 'Document already signed by this signer' }, { status: 400 });
    }

    // Update signer status
    const updatedSigners = [...submission.signers];
    updatedSigners[signerIndex] = {
      ...signer,
      signed: true,
      signed_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
    };

    const allSigned = updatedSigners.every(s => s.signed);

    await base44.asServiceRole.entities.ESignSubmission.update(submission.id, {
      signers: updatedSigners,
      status: allSigned ? 'completed' : 'in_progress',
      completed_at: allSigned ? new Date().toISOString() : null,
    });

    await base44.asServiceRole.entities.SignatureData.create({
      submission_id: submission.id,
      signer_email: signer.email,
      signer_name: signer.name,
      fields: signedFields,
      signed_at: new Date().toISOString(),
      ip_address: ipAddress,
      user_agent: userAgent,
    });

    // Get document
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: submission.document_id }, '-created_date', 1);
    const doc = docs[0];
    const docTitle = doc?.title || 'Document';
    const docUrl = doc?.document_url || '';

    // Build audit trail HTML for all signers
    const auditRows = updatedSigners.map(s => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${s.name || s.email}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${s.email}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${s.signed ? '✅ Signed' : '⏳ Pending'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${s.signed_at ? new Date(s.signed_at).toLocaleString() : '—'}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${s.ip_address || '—'}</td>
      </tr>`).join('');

    const auditHtml = `
      <div style="margin-top:24px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background:#1e3a5f;color:white;padding:12px 16px;font-weight:700;font-size:14px;">📋 Audit Trail</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Signer</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Email</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Status</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">Signed At</th>
            <th style="padding:8px 12px;text-align:left;border-bottom:2px solid #e5e7eb;">IP Address</th>
          </tr></thead>
          <tbody>${auditRows}</tbody>
        </table>
      </div>`;

    const signedViewUrl = `${APP_URL}/api/functions/viewSignedDocument?submission_id=${submission.id}`;

    const completedEmailHtml = (recipientName, isAllDone) => `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="background:#1e3a5f;border-radius:8px 8px 0 0;padding:20px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;">📄 ${isAllDone ? 'Document Fully Signed' : 'Signature Recorded'}</h1>
  </div>
  <div style="background:white;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
    <p>Hello ${recipientName},</p>
    <p>${isAllDone
      ? `All parties have signed <strong>${docTitle}</strong>. The document is now fully executed.`
      : `<strong>${signer.name || signer.email}</strong> has signed <strong>${docTitle}</strong>.`
    }</p>
    ${isAllDone
      ? `<p style="margin-top:20px;"><a href="${signedViewUrl}" style="display:inline-block;padding:12px 24px;background:#22c55e;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">View Signed Document</a></p>`
      : docUrl ? `<p style="margin-top:20px;"><a href="${docUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">View Document</a></p>` : ''
    }
    ${auditHtml}
    <p style="margin-top:24px;font-size:12px;color:#9ca3af;">This email serves as confirmation of electronic signature under the E-SIGN Act. GuroBroker E-Sign.</p>
  </div>
</body></html>`;

    // Email signer confirmation
    try {
      await sendEmail({
        to: signer.email,
        subject: `✅ Signature Confirmed: ${docTitle}`,
        html: completedEmailHtml(signer.name || signer.email, false),
      });
    } catch (err) {
      console.error('Failed to email signer:', err.message);
    }

    if (allSigned) {
      // Store a link to the signed document viewer
      const signedDocViewUrl = `${APP_URL}/api/functions/viewSignedDocument?submission_id=${submission.id}`;
      await base44.asServiceRole.entities.ESignSubmission.update(submission.id, {
        signed_document_url: signedDocViewUrl,
      });

      // Email ALL parties (sender + all signers) the completed document
      const allRecipients = [
        { email: submission.created_by_email, name: submission.created_by_name || 'Agent' },
        ...updatedSigners.map(s => ({ email: s.email, name: s.name || s.email })),
      ];
      // Deduplicate by email
      const seen = new Set();
      const uniqueRecipients = allRecipients.filter(r => { if (seen.has(r.email)) return false; seen.add(r.email); return true; });

      for (const recipient of uniqueRecipients) {
        try {
          await sendEmail({
            to: recipient.email,
            subject: `✅ Fully Signed: ${docTitle}`,
            html: completedEmailHtml(recipient.name, true),
          });
        } catch (err) {
          console.error('Failed to email', recipient.email, err.message);
        }
      }
    } else if (submission.sequence_type === 'sequential') {
      const nextSigner = updatedSigners.find(s => s.order === signer.order + 1 && !s.signed);
      if (nextSigner) {
        const signingLink = `${APP_URL}/api/functions/signingPage?token=${nextSigner.token}`;
        try {
          await sendEmail({
            to: nextSigner.email,
            subject: `Your turn to sign: ${docTitle}`,
            html: `<p>Hello ${nextSigner.name},</p><p>The previous signer has completed their part. It's now your turn to sign <strong>${docTitle}</strong>.</p><p style="margin-top:24px;"><a href="${signingLink}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:white;text-decoration:none;border-radius:6px;font-weight:bold;">Sign Document</a></p>`,
          });
        } catch (err) {
          console.error('Failed to email next signer:', err.message);
        }
      }
    }

    return Response.json({
      status: 'success',
      message: allSigned ? 'All signatures completed' : 'Signature recorded',
      allSigned,
    });
  } catch (error) {
    console.error('Error submitting signature:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});