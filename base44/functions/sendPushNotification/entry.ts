import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { user_email, title, body, type, reference_id } = await req.json();

    if (!user_email || !title || !body) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create notification in database
    const notification = await base44.entities.Notification.create({
      user_email,
      type,
      title,
      description: body,
      reference_id,
      reference_type: type === 'message' ? 'message' : 'conversation',
      read: false,
      brokerage_id: user.brokerage_id,
    });

    // For web: notification will be triggered via service worker subscription
    // For mobile: integrate with Firebase Cloud Messaging or OneSignal
    // For now, we'll prepare the data structure
    const notificationPayload = {
      title,
      body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      tag: type,
      data: {
        notification_id: notification.id,
        reference_id,
        reference_type: type === 'message' ? 'message' : 'conversation',
        action_url: type === 'message' ? `/Chat?id=${reference_id}` : `/Chat?id=${reference_id}`,
      },
    };

    return Response.json({
      success: true,
      notification_id: notification.id,
      payload: notificationPayload,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});