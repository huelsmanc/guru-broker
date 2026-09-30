// New: year-end 1099-NEC worksheet (CSV): everything paid to each person in the year.
// Tax IDs are not stored in this app; match payees to W-9s in your accounting system.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';

const csv = (rows) => rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!can(me, 'accounting.access')) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { year = new Date().getUTCFullYear() - 1 } = await req.json().catch(() => ({}));
    const from = `${year}-01-01`; const to = `${Number(year) + 1}-01-01`;
    const paid = await base44.asServiceRole.entities.Payout.filter({ brokerage_id: me.brokerage_id, status: 'paid', paid_at: { $gte: from, $lt: to } }, 'paid_at', 10000);
    const by = new Map();
    for (const p of paid) {
      const k = p.payee_email;
      const row = by.get(k) || { name: p.payee_name || '', email: k, total: 0, count: 0, kinds: new Set() };
      row.total += Number(p.amount) || 0; row.count++; row.kinds.add(p.kind);
      by.set(k, row);
    }
    const rows = [['Payee name', 'Email', 'Total paid', 'Payments', 'Types', 'Over $600 (1099-NEC)']];
    for (const r of [...by.values()].sort((a, b) => b.total - a.total)) {
      rows.push([r.name, r.email, r.total.toFixed(2), r.count, [...r.kinds].join(' '), r.total >= 600 ? 'yes' : 'no']);
    }
    return Response.json({ filename: `1099-worksheet-${year}.csv`, csv: csv(rows), payees: rows.length - 1 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
