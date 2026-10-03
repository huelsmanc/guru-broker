// Hourly job (cron 'closing-date-reminders'). Now runs the deal autopilot: deadline reminders to the
// deal team and other parties, and everyone's morning "due today" list (see server/lib/autopilot.js).
import { createClientFromRequest, isServiceRequest } from '../lib/base44.js';
import { runAutopilot } from '../lib/autopilot.js';

export default async (req) => {
  try {
    if (!isServiceRequest(req)) return Response.json({ error: 'Not available' }, { status: 403 });
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const now = body.now && process.env.NODE_ENV === 'test' ? new Date(body.now) : new Date();
    return Response.json(await runAutopilot(base44.asServiceRole.entities, { now }));
  } catch (error) {
    console.error('autopilot:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
};
