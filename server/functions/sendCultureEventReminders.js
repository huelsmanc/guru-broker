// Ported from Base44 function `sendCultureEventReminders`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    
    // Find events happening within the next 24-26 hours (1 hour window around 24h mark)
    const twentyFourHoursFromNow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const twentySixHoursFromNow = new Date(now.getTime() + 26 * 60 * 60 * 1000);
    
    // Get all culture calendar entries
    const allEntries = await base44.asServiceRole.entities.CultureCalendarEntry.list('-date', 1000);
    
    // Filter for events in the 24-26 hour window
    const upcomingEvents = allEntries.filter(entry => {
      const eventDate = new Date(entry.date + 'T00:00:00Z'); // Parse as full day event
      return eventDate >= twentyFourHoursFromNow && eventDate <= twentySixHoursFromNow;
    });
    
    let remindersSent = 0;
    
    for (const event of upcomingEvents) {
      // Get RSVPs for this event with 'attending' or 'maybe' status
      const rsvps = await base44.asServiceRole.entities.CultureCalendarRSVP.filter({
        culture_calendar_entry_id: event.id,
        status: { $in: ['attending', 'maybe'] }
      });
      
      for (const rsvp of rsvps) {
        // Send in-app notification
        await base44.asServiceRole.entities.Notification.create({
          user_email: rsvp.user_email,
          type: 'message',
          title: `Reminder: ${event.title}`,
          description: `${event.title} is happening tomorrow at ${event.date}`,
          channel: 'culture_calendar',
          reference_id: event.id,
          reference_type: 'message',
          action_url: `/CultureCalendar`,
          brokerage_id: event.brokerage_id
        });
        
        // Send email reminder
        await base44.integrations.Core.SendEmail({
          to: rsvp.user_email,
          subject: `Reminder: ${event.title} Tomorrow`,
          body: `Hi ${rsvp.user_name},\n\nThis is a friendly reminder that you marked yourself as "${rsvp.status}" for ${event.title}, which is happening tomorrow (${event.date}).\n\n${event.description ? `Details: ${event.description}\n\n` : ''}See you there!\n\nBest regards,\nYour Brokerage`
        });
        
        remindersSent++;
      }
    }
    
    return Response.json({
      success: true,
      eventsFound: upcomingEvents.length,
      remindersSent,
      message: `Sent ${remindersSent} reminders for ${upcomingEvents.length} upcoming event(s)`
    });
  } catch (error) {
    console.error('Error sending culture event reminders:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});