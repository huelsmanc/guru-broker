// Sales leaderboard: closed volume and units per agent for a date range.
// Sources, in order of trust:
//   1. commission records (approved/paid) -> each agent's exact volume and unit share
//   2. closed deals with no commission record yet -> sale price split between the agent and co-agents
//   3. sales entered by hand (AgentSales, by month) -> for deals that never went through the app
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const lc = (s) => String(s || '').trim().toLowerCase();
export const dealDate = (tx) => String(tx.closed_date || tx.closing_date || '').slice(0, 10);
const inRange = (d, from, to) => !!d && d >= from && d <= to;

export function leaderboard({ from, to, records = [], deals = [], manual = [], people = [] }) {
  const byEmail = new Map(people.map((p) => [lc(p.email), p]));
  const rows = new Map();
  const row = (email, name) => {
    const k = lc(email);
    if (!rows.has(k)) {
      const p = byEmail.get(k);
      rows.set(k, { email: k, name: p?.display_name || p?.full_name || name || k, headshot: p?.headshot || null, volume: 0, units: 0, deals: 0, gci: 0, manual: 0, last_close: null, addresses: [] });
    }
    return rows.get(k);
  };
  const seenDeal = new Set();

  for (const r of records) {
    if (!['approved', 'paid'].includes(r.status) || !inRange(String(r.closed_date || '').slice(0, 10), from, to) || !r.agent_email) continue;
    const x = row(r.agent_email, r.agent_name);
    x.volume += num(r.calc?.volume_share ?? r.sale_price);
    x.units += num(r.calc?.units_share ?? 1);
    x.gci += num(r.gross_share);
    x.deals += 1;
    if (r.property_address) x.addresses.push(r.property_address);
    const d = String(r.closed_date).slice(0, 10);
    if (!x.last_close || d > x.last_close) x.last_close = d;
    if (r.transaction_id) seenDeal.add(r.transaction_id);
  }

  for (const tx of deals) {
    if (lc(tx.status) !== 'closed' || seenDeal.has(tx.id) || !inRange(dealDate(tx), from, to)) continue;
    const price = num(tx.sale_price || tx.commission_sale_price);
    const co = (Array.isArray(tx.co_agents) ? tx.co_agents : []).filter((a) => a?.email && lc(a.email) !== lc(tx.agent_email));
    const coPct = co.reduce((s, a) => s + (num(a.split_pct) || 0), 0);
    const split = co.length
      ? [{ email: tx.agent_email, name: tx.agent_name, pct: coPct > 0 && coPct < 100 ? 100 - coPct : 100 / (co.length + 1) },
         ...co.map((a) => ({ email: a.email, name: a.name, pct: coPct > 0 && coPct < 100 ? num(a.split_pct) : 100 / (co.length + 1) }))]
      : [{ email: tx.agent_email, name: tx.agent_name, pct: 100 }];
    for (const s of split) {
      if (!s.email) continue;
      const x = row(s.email, s.name);
      x.volume += price * s.pct / 100;
      x.units += s.pct / 100;
      x.deals += 1;
      if (tx.property_address) x.addresses.push(tx.property_address);
      const d = dealDate(tx);
      if (!x.last_close || d > x.last_close) x.last_close = d;
    }
  }

  const fromMonth = from.slice(0, 7); const toMonth = to.slice(0, 7);
  for (const m of manual) {
    const mm = String(m.month || '').slice(0, 7);
    if (!m.agent_email || !mm || mm < fromMonth || mm > toMonth) continue;
    const x = row(m.agent_email, m.agent_name);
    x.volume += num(m.sales_amount);
    x.manual += num(m.sales_amount);
  }

  const list = [...rows.values()].filter((x) => x.volume > 0 || x.units > 0)
    .map((x) => ({ ...x, units: Math.round(x.units * 100) / 100, volume: Math.round(x.volume), avg_price: x.units > 0 ? Math.round((x.volume - x.manual) / x.units) : null }));
  const totals = list.reduce((t, x) => ({ volume: t.volume + x.volume, units: t.units + x.units, gci: t.gci + x.gci }), { volume: 0, units: 0, gci: 0 });
  const closedDeals = new Set([...records.filter((r) => ['approved', 'paid'].includes(r.status) && inRange(String(r.closed_date || '').slice(0, 10), from, to)).map((r) => r.transaction_id || r.id),
    ...deals.filter((tx) => lc(tx.status) === 'closed' && !seenDeal.has(tx.id) && inRange(dealDate(tx), from, to)).map((tx) => tx.id)]).size;
  return { agents: list, totals: { ...totals, units: Math.round(totals.units * 100) / 100, deals: closedDeals, agents: list.length } };
}
