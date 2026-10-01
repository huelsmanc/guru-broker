// New: opens (and creates if needed) a transaction's deal chat. Anyone who can see the deal
// can open it; admins and others with deal access are added as guests when they do.
import { createClientFromRequest } from '../lib/base44.js';
import { syncDealChat, dealPeople } from '../lib/dealchat.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { transactionId } = await req.json();
    const tx = await base44.entities.Transaction.get(transactionId).catch(() => null); // caller's own access rules
    if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });
    const mine = String(me.email).toLowerCase();
    const group = await syncDealChat(base44.asServiceRole.entities, tx, { add: dealPeople(tx).includes(mine) ? [] : [mine] });
    return Response.json({ group });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
