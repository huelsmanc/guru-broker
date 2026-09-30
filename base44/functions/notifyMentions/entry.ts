import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const { mentions, messageId, senderName, channel, brokerageId } = await req.json();

    if (!mentions || !messageId || !senderName || !channel) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const base44 = createClientFromRequest(req);
    const currentUser = await base44.auth.me();

    // Get all users in the brokerage
    const allUsers = await base44.asServiceRole.entities.User.filter({ brokerage_id: brokerageId });

    // Determine who to notify
    let usersToNotify = [];

    if (mentions.includes('channel')) {
      // Notify all users except sender
      usersToNotify = allUsers.filter(u => u.email !== currentUser.email).map(u => u.email);
    } else {
      // Notify specific mentioned users (excluding the sender)
      usersToNotify = mentions
        .map(mention => {
          const mentionLower = mention.toLowerCase().trim();
          // Find user by email or name (case-insensitive, flexible matching)
          const user = allUsers.find(u => 
            u.email.toLowerCase() === mentionLower || 
            u.full_name.toLowerCase() === mentionLower ||
            u.full_name.toLowerCase().includes(mentionLower) ||
            mentionLower.includes(u.full_name.toLowerCase().split(' ')[0]) // match first name
          );
          return user?.email;
        })
        .filter(email => email && email !== currentUser.email);
    }

    // Create notification for each mentioned user
    const notificationPromises = usersToNotify.map(userEmail => {
      return base44.asServiceRole.entities.Notification.create({
        user_email: userEmail,
        type: 'mention',
        title: `You were mentioned by ${senderName}`,
        description: `in #${channel}`,
        channel,
        reference_id: messageId,
        reference_type: 'message',
        action_url: `/SocialChat?channel=${channel}`,
        brokerage_id: brokerageId,
        read: false,
      });
    });

    await Promise.all(notificationPromises);

    return Response.json({
      success: true,
      notifiedCount: usersToNotify.length,
    });
  } catch (error) {
    console.error('Error notifying mentions:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});