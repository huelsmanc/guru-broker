// New: admin closes out a deal's commission: saves records (counts toward caps) and
// creates payouts waiting for approval.
import { createClientFromRequest } from '../lib/base44.js';
import { calculateForTransaction, finalizeCommission } from '../lib/backoffice.js';
import { ADMIN_ROLES } from '../lib/team.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!ADMIN_ROLES.includes(me.role)) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { transactionId, input = {} } = await req.json();
    const entities = base44.asServiceRole.entities;
    const tx = await entities.Transaction.get(transactionId);
    if (tx.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    if (input.agents || input.referral || input.deductions) {
      await entities.Transaction.update(tx.id, {
        ...(input.agents ? { co_agents: input.agents } : {}),
        ...(input.referral !== undefined ? { referral: input.referral } : {}),
        ...(input.deductions ? { deductions: input.deductions } : {}),
        ...(input.gross_commission != null ? { commission_amount: input.gross_commission } : {}),
      });
    }
    const fresh = await entities.Transaction.get(transactionId);
    const calc = await calculateForTransaction(entities, fresh, input);
    const out = await finalizeCommission(entities, fresh, calc, me);
    return Response.json({ status: 'success', result: calc.result, records: out.records.length, payouts: out.payouts.length });
  } catch (error) {
    console.error('commissionFinalize:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
