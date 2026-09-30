// New: an agent's plan, cap year and year-to-date numbers for the My Commissions page.
// Admins (or anyone with accounting access) can ask for another agent in their brokerage.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { agentContext } from '../lib/backoffice.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { email } = await req.json().catch(() => ({}));
    const target = String(email || me.email).toLowerCase();
    const self = target === me.email.toLowerCase();
    if (!self && !isAdminRole(me.role) && !can(me, 'accounting.access')) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const E = base44.asServiceRole.entities;
    const ctx = await agentContext(E, target, { brokerageId: me.brokerage_id });
    if (!self && ctx.profile && ctx.profile.brokerage_id !== me.brokerage_id && me.role !== 'super_admin') return Response.json({ error: 'Not allowed' }, { status: 403 });
    const cap = Number(ctx.plan.config?.cap?.amount) || null;
    const next = new Date(`${ctx.cap_year_start}T00:00:00Z`);
    next.setUTCFullYear(next.getUTCFullYear() + 1);
    const records = await E.CommissionRecord.filter({ agent_email: target, status: { $in: ['approved', 'paid'] } }, '-closed_date', 200);
    const payouts = await E.Payout.filter({ payee_email: target }, '-created_date', 200);
    return Response.json({
      name: ctx.name,
      plan: ctx.plan,
      cap_year_start: ctx.cap_year_start,
      cap_year_end: next.toISOString().slice(0, 10),
      ytd: ctx.ytd,
      cap,
      remaining: cap ? Math.max(0, cap - ctx.ytd.company_dollar) : null,
      pct: cap ? Math.min(100, Math.round((ctx.ytd.company_dollar / cap) * 100)) : null,
      team_lead_email: ctx.team_lead_email,
      sponsors: ctx.sponsors,
      records: records.map((r) => ({ id: r.id, transaction_id: r.transaction_id, closed_date: r.closed_date, property_address: r.property_address, gross_share: r.gross_share, company_dollar: r.company_dollar, fees: r.fees, agent_net: r.agent_net, status: r.status, lines: r.calc?.agent?.lines || [] })),
      payouts: payouts.filter((p) => p.status !== 'void').map((p) => ({ id: p.id, transaction_id: p.transaction_id, created_date: p.created_date, kind: p.kind, memo: p.memo, amount: p.amount, status: p.status, paid_at: p.paid_at })),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
