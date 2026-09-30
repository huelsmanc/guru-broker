import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Fetch all pending documents
    const documents = await base44.asServiceRole.entities.ESignDocument.filter(
      { status: 'pending' },
      '-created_date',
      1000
    );

    if (!documents || documents.length === 0) {
      return Response.json({ message: 'No pending documents', remindersSent: 0 });
    }

    const now = Date.now();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    let remindersSent = 0;

    for (const doc of documents) {
      const createdTime = new Date(doc.created_date).getTime();
      const docAge = now - createdTime;

      // Only send reminders for documents older than 48 hours
      if (docAge < fortyEightHours) {
        continue;
      }

      // Find unsigned signatories
      const unsignedSigners = doc.signatories?.filter(s => !s.signed) || [];

      for (const signer of unsignedSigners) {
        try {
          // Generate direct signing link
          const signingLink = `${getBaseUrl(req)}/sign?doc=${doc.id}&signer=${encodeURIComponent(signer.email)}`;

          const emailBody = `
Hello ${signer.name},

This is a reminder that you have a document pending your signature:

Document: ${doc.title}
Created: ${new Date(doc.created_date).toLocaleString()}
Time Since Created: ${Math.round(docAge / (60 * 60 * 1000))} hours

Please click the link below to review and sign the document:
${signingLink}

This document requires your signature to proceed. If you have any questions, please contact ${doc.created_by_name} at ${doc.created_by_email}.

Thank you,
Guru Broker
`;

          // Send email via Core integration
          await base44.integrations.Core.SendEmail({
            to: signer.email,
            subject: `Reminder: Please Sign "${doc.title}"`,
            body: emailBody,
            from_name: 'Guru Broker',
          });

          // Log reminder activity
          await base44.asServiceRole.entities.ActivityLog.create({
            brokerage_id: doc.brokerage_id,
            document_id: doc.id,
            action_type: 'viewed',
            user_email: 'system@gurubroker.com',
            user_name: 'Automated System',
            details: `Sent signing reminder to ${signer.email}`,
          });

          remindersSent++;
        } catch (error) {
          console.error(`Failed to send reminder to ${signer.email}:`, error);
        }
      }
    }

    return Response.json({
      status: 'success',
      remindersSent,
      documentsChecked: documents.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Reminder system error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

function getBaseUrl(req) {
  const protocol = req.headers.get('x-forwarded-proto') || 'https';
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'localhost:3000';
  return `${protocol}://${host}`;
}