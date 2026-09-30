// Ported from Base44 function `notifyDocumentActivity`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    // Only process created activities
    if (event.type !== 'create') {
      return Response.json({ status: 'skipped' });
    }

    const activity = event.data;
    if (!activity || !['viewed', 'signed'].includes(activity.action_type)) {
      return Response.json({ status: 'skipped' });
    }

    // Fetch document details
    const docs = await base44.asServiceRole.entities.ESignDocument.filter({ id: activity.document_id });
    if (!docs || docs.length === 0) {
      return Response.json({ status: 'document_not_found' });
    }

    const document = docs[0];
    const actionLabel = activity.action_type === 'viewed' ? 'viewed' : 'signed';
    const actionEmoji = activity.action_type === 'viewed' ? '👁️' : '✍️';

    // Send email to document creator
    const emailSubject = `${actionEmoji} ${activity.user_name} ${actionLabel} "${document.title}"`;
    const emailBody = `
Hello,

${activity.user_name} (${activity.user_email}) has ${actionLabel} the document "${document.title}".

Document: ${document.title}
Action: ${activity.action_type === 'viewed' ? 'Viewed document' : 'Signed document'}
Signer: ${activity.user_name} (${activity.user_email})
Time: ${new Date(activity.created_date).toLocaleString()}
${activity.details ? `Details: ${activity.details}` : ''}

Thank you,
Guru Broker
    `.trim();

    await base44.integrations.Core.SendEmail({
      to: document.created_by_email,
      subject: emailSubject,
      body: emailBody,
      from_name: 'Guru Broker',
    });

    return Response.json({ 
      status: 'success',
      notified: document.created_by_email,
      action: activity.action_type
    });
  } catch (error) {
    console.error('Notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});