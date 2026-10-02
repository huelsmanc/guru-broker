// Database automation: a new compliance training was added. Tells everyone in that brokerage
// who isn't running it (agents, team leaders, TCs): a notification, a push and an email each.
// (The Base44 version only reached people stored with the old "user" role name, and posted one
// identical chat message per agent instead of telling each person.)
import { createClientFromRequest } from '../lib/base44.js';
import { notifyPeople } from '../lib/team.js';
import { normalizeRole } from '../../shared/permissions.generated.js';

const LEARNERS = new Set(['agent', 'team_leader', 'tc']);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    if (event?.type !== 'create' || !event.data?.brokerage_id) return Response.json({ success: true });
    const training = event.data;
    const E = base44.asServiceRole.entities;
    const people = (await E.User.filter({ brokerage_id: training.brokerage_id }, '-created_date', 2000))
      .filter((u) => !u.suspended && u.role !== 'super_admin' && LEARNERS.has(normalizeRole(u.role)));
    const sent = await notifyPeople(E, {
      brokerageId: training.brokerage_id, people,
      title: 'New training to complete',
      message: `"${training.title || 'New training'}" was added. Open Compliance Training to complete it.`,
      link: '/ComplianceTraining', referenceId: training.id, referenceType: 'Training',
    });
    return Response.json({ success: true, notifiedAgents: sent });
  } catch (error) {
    console.error('Error notifying agents:', error);
    return Response.json({ success: true });
  }
};
