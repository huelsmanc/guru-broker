import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { mentions, messageId, senderName, senderEmail, channel, brokerageId, content } = await req.json();

    if (!mentions || !messageId || !brokerageId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const brokerageUsers = await base44.asServiceRole.entities.User.filter({ brokerage_id: brokerageId });
    const notifyTargets = [];

    mentions.forEach(mention => {
      if (mention.toLowerCase() === 'channel') {
        // Notify all users except sender
        brokerageUsers.forEach(u => {
          if (u.email !== senderEmail) notifyTargets.push(u.email);
        });
      } else {
        // Find user by name or email
        const user = brokerageUsers.find(u =>
          (u.display_name && u.display_name.toLowerCase().includes(mention.toLowerCase())) ||
          u.full_name.toLowerCase().includes(mention.toLowerCase()) ||
          u.email.toLowerCase().includes(mention.toLowerCase())
        );
        if (user && user.email !== senderEmail) notifyTargets.push(user.email);
      }
    });

    if (notifyTargets.length === 0) {
      return Response.json({ notified: 0 });
    }

    const notifications = notifyTargets.map(email => ({
      user_email: email,
      type: 'mention',
      title: `New mention from ${senderName}`,
      description: content.substring(0, 100),
      channel,
      reference_id: messageId,
      reference_type: 'message',
      action_url: `/SocialChat?channel=${channel}`,
      brokerage_id: brokerageId
    }));

    await base44.asServiceRole.entities.Notification.bulkCreate(notifications);
    return Response.json({ notified: notifyTargets.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});