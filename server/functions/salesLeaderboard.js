// New: sales leaderboard from closed deals (plus sales entered by hand). { from, to } as YYYY-MM-DD.
// Admins only; GCI is included for them.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { leaderboard } from '../../shared/leaderboard.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!(me.role === 'super_admin' || isAdminRole(me.role) || can(me, 'reports.company'))) return Response.json({ error: 'Admins only' }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const ok = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
    const today = new Date().toISOString().slice(0, 10);
    const from = ok(body.from) ? body.from : `${today.slice(0, 7)}-01`;
    const to = ok(body.to) ? body.to : today;
    const b = me.brokerage_id;
    if (!b) return Response.json({ agents: [], totals: {} });
    const e = base44.asServiceRole.entities;
    const [records, deals, manual, people] = await Promise.all([
      e.CommissionRecord.filter({ brokerage_id: b, status: { $in: ['approved', 'paid'] }, closed_date: { $gte: from, $lte: to } }, '-closed_date', 5000),
      e.Transaction.filter({ brokerage_id: b, status: { $in: ['closed', 'Closed'] } }, '-updated_date', 5000),
      e.AgentSales.filter({ brokerage_id: b }, '-month', 2000),
      e.User.filter({ brokerage_id: b }, 'full_name', 2000),
    ]);
    const out = leaderboard({ from, to, records, deals, manual, people });
    return Response.json({ from, to, ...out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
