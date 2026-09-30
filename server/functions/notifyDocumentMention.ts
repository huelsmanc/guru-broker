// Ported from Base44 function `notifyDocumentMention`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { docId, docTitle, mentionedEmails, mentionedBy, brokerageId } = await req.json();

    if (!docId || !mentionedEmails || mentionedEmails.length === 0) {
      return Response.json({ status: 'skipped' });
    }

    // Create notifications for each mentioned user
    let notificationsCreated = 0;
    for (const email of mentionedEmails) {
      if (email !== mentionedBy) {
        await base44.asServiceRole.entities.Notification.create({
          user_email: email,
          type: 'mention',
          title: `You were mentioned in "${docTitle}"`,
          description: `${mentionedBy} mentioned you in a document`,
          channel: 'Documents',
          reference_id: docId,
          reference_type: 'document',
          action_url: `/ESignDocuments?doc=${docId}`,
          brokerage_id: brokerageId,
          read: false,
        });
        notificationsCreated++;
      }
    }

    return Response.json({ status: 'success', notificationsCreated });
  } catch (error) {
    console.error('Mention notification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});