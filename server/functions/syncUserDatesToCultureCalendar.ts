// Ported from Base44 function `syncUserDatesToCultureCalendar`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.brokerage_id) {
      return Response.json({ error: 'User not found or not in a brokerage' }, { status: 401 });
    }

    const { birthday, work_anniversary } = await req.json();

    // Helper to create/update calendar entry
    const syncDateToCalendar = async (dateStr, eventType, title) => {
      if (!dateStr) return;

      // Parse the date and create a recurring entry
      const date = new Date(dateStr);
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      // Get current year
      const currentYear = new Date().getFullYear();
      const eventDate = `${currentYear}-${month}-${day}`;

      // Check if entry exists for this user and type
      const existing = await base44.asServiceRole.entities.CultureCalendarEntry.filter({
        brokerage_id: user.brokerage_id,
        event_type: eventType,
        person_email: user.email,
      });

      if (existing.length > 0) {
        // Update existing
        await base44.asServiceRole.entities.CultureCalendarEntry.update(existing[0].id, {
          date: eventDate,
          month: eventDate.slice(0, 7),
          title: title,
          person_name: user.full_name,
        });
      } else {
        // Create new
        await base44.asServiceRole.entities.CultureCalendarEntry.create({
          brokerage_id: user.brokerage_id,
          event_type: eventType,
          title: title,
          date: eventDate,
          month: eventDate.slice(0, 7),
          person_email: user.email,
          person_name: user.full_name,
          created_by_email: user.email,
          created_by_name: user.full_name,
        });
      }
    };

    // Sync birthday
    if (birthday) {
      await syncDateToCalendar(birthday, 'birthday', `${user.full_name}'s Birthday`);
    }

    // Sync work anniversary
    if (work_anniversary) {
      await syncDateToCalendar(work_anniversary, 'work_anniversary', `${user.full_name}'s Work Anniversary`);
    }

    return Response.json({ success: true, message: 'Calendar entries synced' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});