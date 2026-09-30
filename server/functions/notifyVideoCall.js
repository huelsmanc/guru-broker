// Ported from Base44 function `notifyVideoCall`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { callId, callTopic, agentEmail, agentName, brokerageId, adminName } = await req.json();

    if (!callId || !agentEmail || !brokerageId) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create notification for the agent
    await base44.entities.Notification.create({
      user_email: agentEmail,
      type: 'message',
      title: 'Incoming Video Call',
      description: `${adminName} is calling you about: ${callTopic}`,
      channel: 'video_call',
      reference_id: callId,
      reference_type: 'message',
      action_url: `/ScheduleCalls?call=${callId}`,
      read: false,
      brokerage_id: brokerageId,
    });

    return Response.json({ success: true });
  } catch (error) {
    console.error('Error sending video call notification:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});