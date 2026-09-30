import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { messageId, replyContent, replierName, replierEmail, brokerageId } = await req.json();

    if (!messageId || !replierEmail || !brokerageId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get the original message to find who to notify
    const messages = await base44.asServiceRole.entities.SocialMessage.filter({ id: messageId });
    if (messages.length === 0) {
      return Response.json({ error: 'Message not found' }, { status: 404 });
    }

    const originalMsg = messages[0];
    const notifyTargets = new Set();

    // Notify original sender
    if (originalMsg.sender_email && originalMsg.sender_email !== replierEmail) {
      notifyTargets.add(originalMsg.sender_email);
    }

    // Notify all previous repliers
    const replies = await base44.asServiceRole.entities.ThreadReply.filter({ message_id: messageId });
    replies.forEach(reply => {
      if (reply.sender_email && reply.sender_email !== replierEmail) {
        notifyTargets.add(reply.sender_email);
      }
    });

    if (notifyTargets.size === 0) {
      return Response.json({ notified: 0 });
    }

    const notifications = Array.from(notifyTargets).map(email => ({
      user_email: email,
      type: 'thread_reply',
      title: `New reply from ${replierName}`,
      description: replyContent.substring(0, 100),
      channel: originalMsg.channel,
      reference_id: messageId,
      reference_type: 'thread',
      action_url: `/SocialChat?channel=${originalMsg.channel}`,
      brokerage_id: brokerageId
    }));

    await base44.asServiceRole.entities.Notification.bulkCreate(notifications);
    return Response.json({ notified: notifyTargets.size });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});