// Ported from Base44 function `notifyAgentsNewTraining`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();

    if (event.type !== 'create' || !event.data) {
      return Response.json({ success: true });
    }

    const training = event.data;

    // Get all users in this brokerage (agents only)
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
    const agents = allUsers.filter(u => u.brokerage_id === training.brokerage_id && u.role === 'user');

    // Create admin message notification for each agent
    for (const agent of agents) {
      await base44.asServiceRole.entities.AdminMessage.create({
        brokerage_id: training.brokerage_id,
        sender_name: 'Admin',
        sender_email: 'admin@system',
        content: `📚 New training available: "${training.title}". Visit Compliance Training to complete it.`,
      });
    }

    return Response.json({ success: true, notifiedAgents: agents.length });
  } catch (error) {
    console.error('Error notifying agents:', error);
    return Response.json({ success: true });
  }
});