// Ported from Base44 function `notifyOnCalendarEvent`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { eventId, eventTitle, eventDate, createdByName, brokerageId, eventType } = await req.json();

    if (!eventId || !eventTitle || !brokerageId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get all users in the brokerage
    const brokerageUsers = await base44.asServiceRole.entities.User.filter({ brokerage_id: brokerageId });
    
    if (brokerageUsers.length === 0) {
      return Response.json({ notified: 0 });
    }

    const notifications = brokerageUsers.map(user => ({
      user_email: user.email,
      type: 'calendar_event',
      title: `New ${eventType || 'event'} added: ${eventTitle}`,
      description: `Added by ${createdByName} on ${eventDate}`,
      channel: eventId,
      reference_id: eventId,
      reference_type: 'calendar_entry',
      action_url: '/CultureCalendar',
      brokerage_id: brokerageId
    }));

    await base44.asServiceRole.entities.Notification.bulkCreate(notifications);
    return Response.json({ notified: brokerageUsers.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});