import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (event.type !== 'create' || event.entity_name !== 'SocialMessage') {
      return Response.json({ status: 'skipped' });
    }

    const message = event.data;
    if (!message || !message.brokerage_id) {
      return Response.json({ status: 'skipped' });
    }

    // Get all users in the brokerage
    const allUsers = await base44.asServiceRole.entities.User.filter({}, '', 500);
    const brokerageUsers = allUsers.filter(u => u.brokerage_id === message.brokerage_id && u.email !== message.sender_email);

    // Create notifications for all users (except sender)
    for (const user of brokerageUsers) {
      await base44.asServiceRole.entities.Notification.create({
        user_email: user.email,
        type: 'message',
        title: `New message in #${message.channel}`,
        description: `${message.sender_name}: ${message.content.substring(0, 100)}${message.content.length > 100 ? '...' : ''}`,
        channel: `#${message.channel}`,
        reference_id: message.id,
        reference_type: 'message',
        action_url: `/SocialChat?channel=${message.channel}`,
        brokerage_id: message.brokerage_id,
        read: false,
      });
    }

    return Response.json({ status: 'success', notificationsCreated: brokerageUsers.length });
  } catch (error) {
    console.error('Notification creation error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});