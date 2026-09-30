// Back office: builds commission calculations from real data (plans, year-to-date,
// sponsors) and creates records and payouts.
import { calculateDeal, capYearStart, r2 } from '../../shared/commission.js';

const num = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n) : d);

export async function profileByEmail(entities, email) {
  const [p] = await entities.User.filter({ email: String(email || '').toLowerCase() }, '-created_date', 1);
  return p || null;
}

/** Everything the engine needs about one agent: plan, cap year, year-to-date, team, sponsors. */
export async function agentContext(entities, email, { brokerageId, on = new Date(), excludeTransactionId } = {}) {
  const profile = await profileByEmail(entities, email);
  let plan = null;
  if (profile?.commission_plan_id) {
    [plan] = await entities.CommissionPlan.filter({ id: profile.commission_plan_id }, '-created_date', 1);
  }
  if (!plan && brokerageId) {
    [plan] = await entities.CommissionPlan.filter({ brokerage_id: brokerageId, is_default: true }, '-created_date', 1);
  }
  const capStart = capYearStart(profile?.cap_start_date || profile?.start_date, on);
  const records = await entities.CommissionRecord.filter(
    { agent_email: String(email).toLowerCase(), cap_year_start: capStart, status: { $in: ['approved', 'paid'] } }, 'closed_date', 1000);
  const ytd = { gci: 0, volume: 0, units: 0, company_dollar: 0, fees: {}, revshare: 0 };
  for (const r of records) {
    if (excludeTransactionId && r.transaction_id === excludeTransactionId) continue;
    const a = r.calc?.agent || {};
    ytd.gci += num(r.gross_share);
    ytd.company_dollar += num(r.company_dollar);
    ytd.volume += num(r.calc?.volume_share);
    ytd.units += num(r.calc?.units_share, 1);
    ytd.revshare += num(r.revshare_total);
    for (const [k, v] of Object.entries(a.ytd_fee_delta || {})) ytd.fees[k] = num(ytd.fees[k]) + num(v);
  }
  // Sponsor chain for downline (up to 7 levels, stops on loops).
  const sponsors = [];
  const seen = new Set([String(email).toLowerCase()]);
  let cur = profile;
  while (cur?.sponsor_email && sponsors.length < 7) {
    const s = String(cur.sponsor_email).toLowerCase();
    if (seen.has(s)) break;
    seen.add(s);
    sponsors.push(s);
    cur = await profileByEmail(entities, s);
  }
  return {
    email: String(email).toLowerCase(),
    name: profile?.display_name || profile?.full_name || email,
    profile,
    plan: plan ? { id: plan.id, name: plan.name, config: plan.config || {} } : { id: null, name: 'No plan (agent keeps 100%)', config: {} },
    cap_year_start: capStart,
    ytd,
    team_lead_email: profile?.team_lead_email || null,
    sponsors,
  };
}

/** Builds and calculates the deal for a transaction. */
export async function calculateForTransaction(entities, tx, input = {}) {
  const salePrice = num(input.sale_price ?? tx.commission_sale_price ?? tx.sale_price);
  let gross = input.gross_commission;
  if (gross == null) {
    gross = tx.commission_amount != null ? num(tx.commission_amount)
      : tx.commission_type === 'flat' ? num(tx.commission_flat)
        : salePrice * num(tx.commission_percentage) / 100;
  }
  const agentList = (input.agents?.length ? input.agents : tx.co_agents?.length ? tx.co_agents : [{ email: tx.agent_email, split_pct: 100 }])
    .filter((a) => a.email);
  const on = input.closed_date ? new Date(`${input.closed_date}T12:00:00Z`) : new Date();
  const contexts = [];
  for (const a of agentList) {
    const ctx = await agentContext(entities, a.email, { brokerageId: tx.brokerage_id, on, excludeTransactionId: tx.id });
    contexts.push({ ...ctx, split_pct: num(a.split_pct, 100) });
  }
  const deal = {
    gross_commission: num(gross),
    sale_price: salePrice,
    units: 1,
    referral: input.referral ?? tx.referral ?? null,
    deductions: input.deductions ?? tx.deductions ?? [],
    agents: contexts.map((c) => ({
      email: c.email, name: c.name, split_pct: c.split_pct, plan: c.plan, ytd: c.ytd,
      team_lead_email: c.team_lead_email, sponsors: c.sponsors,
    })),
  };
  const result = calculateDeal(deal);
  return { deal, result, contexts, closed_date: input.closed_date || tx.closed_date || new Date().toISOString().slice(0, 10) };
}

/**
 * Saves the calculation: one commission record per agent (approved) and payouts waiting
 * for admin approval. Re-running replaces earlier unpaid records for the same deal.
 */
export async function finalizeCommission(entities, tx, calc, approver) {
  const existing = await entities.CommissionRecord.filter({ transaction_id: tx.id }, '-created_date', 50);
  const oldPayouts = await entities.Payout.filter({ transaction_id: tx.id }, '-created_date', 200);
  if (oldPayouts.some((p) => ['sending', 'sent', 'paid'].includes(p.status))) {
    throw Object.assign(new Error('Payouts for this deal were already sent. Void them before recalculating.'), { status: 409 });
  }
  for (const p of oldPayouts) await entities.Payout.update(p.id, { status: 'void' });
  for (const r of existing) await entities.CommissionRecord.update(r.id, { status: 'void' });

  const { result, contexts, deal, closed_date } = calc;
  const records = [];
  for (const [i, a] of result.agents.entries()) {
    const ctx = contexts[i];
    const feeDelta = {};
    for (const [k, v] of Object.entries(a.ytd_after.fees || {})) feeDelta[k] = r2(num(v) - num(ctx.ytd.fees?.[k]));
    const rec = await entities.CommissionRecord.create({
      brokerage_id: tx.brokerage_id,
      transaction_id: tx.id,
      agent_email: a.email,
      agent_name: a.name,
      property_address: tx.property_address,
      cap_year_start: ctx.cap_year_start,
      closed_date,
      sale_price: deal.sale_price,
      status: 'approved',
      gross_share: a.share,
      company_dollar: a.company_dollar,
      agent_net: a.agent_net,
      fees: a.fees,
      team_lead: a.team_lead,
      revshare_total: a.revshare_total,
      calc: {
        agent: { ...a, ytd_fee_delta: feeDelta },
        plan: ctx.plan,
        totals: result.totals,
        volume_share: num(deal.sale_price) * num(ctx.split_pct) / 100,
        units_share: num(ctx.split_pct) / 100,
      },
      approved_by: approver?.email || null,
      approved_at: new Date().toISOString(),
    });
    records.push(rec);
  }
  const byAgent = new Map(records.map((r) => [r.agent_email, r]));
  const payouts = [];
  for (const p of result.payouts) {
    const rec = byAgent.get(p.for_agent || p.payee_email) || records[0];
    payouts.push(await entities.Payout.create({
      brokerage_id: tx.brokerage_id,
      commission_record_id: rec?.id || null,
      transaction_id: tx.id,
      payee_email: String(p.payee_email).toLowerCase(),
      payee_name: p.payee_name || null,
      kind: p.kind,
      level: p.level || null,
      for_agent: p.for_agent || null,
      amount: p.amount,
      status: 'pending_approval',
      memo: `${tx.property_address}${p.kind !== 'agent' ? ` (${p.kind.replace('_', ' ')}${p.level ? ` L${p.level}` : ''})` : ''}`,
    }));
  }
  await entities.Transaction.update(tx.id, { closed_date, commission_calc: result.totals, agent_net: result.totals.agent_net });
  return { records, payouts };
}
