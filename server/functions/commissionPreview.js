// New: live commission calculation for a deal from the agent's plan and year-to-date.
// Agents can preview their own deals; admins any deal. Nothing is saved.
import { createClientFromRequest } from '../lib/base44.js';
import { calculateForTransaction } from '../lib/backoffice.js';
import { ADMIN_ROLES } from '../lib/team.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { transactionId, input = {} } = await req.json();
    const entities = base44.asServiceRole.entities;
    const tx = await entities.Transaction.get(transactionId);
    const isAdmin = ADMIN_ROLES.includes(me.role);
    if (tx.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    const mine = [tx.agent_email, ...(tx.co_agents || []).map((a) => a.email)].map((e) => String(e || '').toLowerCase()).includes(me.email.toLowerCase());
    if (!isAdmin && !mine) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const calc = await calculateForTransaction(entities, tx, input);
    return Response.json({
      result: calc.result,
      agents: calc.contexts.map((c) => ({ email: c.email, name: c.name, plan: c.plan.name, cap_year_start: c.cap_year_start, ytd: c.ytd, sponsors: c.sponsors, team_lead_email: c.team_lead_email })),
    });
  } catch (error) {
    console.error('commissionPreview:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
