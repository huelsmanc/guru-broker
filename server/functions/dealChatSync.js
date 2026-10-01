// New (automation): when a deal's agent, co-agents or TC change, update its chat members.
import { createClientFromRequest } from '../lib/base44.js';
import { syncDealChat } from '../lib/dealchat.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event } = await req.json();
    const tx = event?.data;
    if (!tx?.id || !tx.brokerage_id) return Response.json({ skipped: true });
    const E = base44.asServiceRole.entities;
    const [existing] = await E.GroupChat.filter({ brokerage_id: tx.brokerage_id, transaction_id: tx.id }, '-created_date', 1);
    if (!existing) return Response.json({ skipped: 'no chat yet' }); // created the first time someone opens it
    await syncDealChat(E, tx);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
