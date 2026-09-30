// Commission engine. Pure functions, shared by the browser (live previews) and the
// server (final numbers). Every amount is explained by a line so agents can see the math.
//
// PLAN CONFIG (commission_plan.config), every block optional:
// {
//   split:    { agent_pct: 80 },                                   // base split of the agent's share
//   tiers:    { basis: 'gci' | 'volume' | 'units',                 // sliding scale by year-to-date
//               levels: [{ from: 0, agent_pct: 70 }, { from: 100000, agent_pct: 80 }] },
//   cap:      { amount: 18000, after_cap_agent_pct: 100 },         // company-dollar cap per cap year
//   fees:     [{ id, name, type: 'flat' | 'pct_gross' | 'pct_agent', amount,
//                when: 'always' | 'pre_cap' | 'post_cap', annual_cap, counts_toward_cap }],
//   team:     { lead_pct: 30, basis: 'after_split' | 'before_split' },
//   downline: { basis: 'company_dollar' | 'gross', per_agent_annual_cap: 4000,
//               levels: [{ pct: 3.5 }, { pct: 4 }, { pct: 2.5 }] }  // level 1 = sponsor
// }
//
// DEAL
// {
//   gross_commission, sale_price, units = 1,
//   referral: { type: 'pct' | 'flat', amount, to },                 // paid out before anything else
//   agents: [{ email, name, split_pct = 100, plan: { config }, ytd: { gci, volume, units,
//              company_dollar, fees: { [feeId]: paid }, revshare }, team_lead_email,
//              sponsors: [level1Email, level2Email, ...] }],
//   deductions: [{ agent_email, name, amount, payee }]              // e.g. marketing reimbursements
// }

export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const num = (n, d = 0) => (Number.isFinite(Number(n)) ? Number(n) : d);

/** The agent % that applies at a given year-to-date position. */
export function tierPct(config, ytdBasis) {
  const levels = [...(config.tiers?.levels || [])].sort((a, b) => num(a.from) - num(b.from));
  if (!levels.length) return num(config.split?.agent_pct, 100);
  let pct = num(levels[0].agent_pct);
  for (const l of levels) if (ytdBasis >= num(l.from)) pct = num(l.agent_pct);
  return pct;
}

function nextTierFrom(config, ytdBasis) {
  const levels = [...(config.tiers?.levels || [])].map((l) => num(l.from)).sort((a, b) => a - b);
  return levels.find((f) => f > ytdBasis + 1e-9) ?? Infinity;
}

/**
 * Brokerage split for one agent share, walking through tier boundaries and the cap
 * so a deal that crosses either is split exactly at the crossing point.
 */
export function splitShare(config, share, ytd) {
  const capAmt = config.cap?.amount != null && config.cap.amount !== '' ? num(config.cap.amount) : null;
  const afterCapPct = num(config.cap?.after_cap_agent_pct, 100);
  const basis = config.tiers?.basis || 'gci';
  let cd = num(ytd.company_dollar);
  let gciYtd = num(ytd.gci);
  // Volume and unit tiers are decided by the position at the start of the deal.
  const fixedBasis = basis === 'volume' ? num(ytd.volume) : basis === 'units' ? num(ytd.units) : null;
  let remaining = share;
  let agent = 0;
  let company = 0;
  const slices = [];
  let guard = 0;
  while (remaining > 1e-6 && guard++ < 100) {
    const capped = capAmt != null && cd >= capAmt - 1e-9;
    const pct = capped ? afterCapPct : tierPct(config, fixedBasis ?? gciYtd);
    let portion = remaining;
    if (!capped && fixedBasis == null && config.tiers?.levels?.length) {
      portion = Math.min(portion, nextTierFrom(config, gciYtd) - gciYtd);
    }
    if (!capped && capAmt != null && pct < 100) {
      portion = Math.min(portion, (capAmt - cd) / ((100 - pct) / 100));
    }
    portion = Math.max(portion, 0);
    if (portion <= 1e-9) portion = remaining; // safety
    const toCompany = portion * (100 - pct) / 100;
    agent += portion - toCompany;
    company += toCompany;
    cd += toCompany;
    gciYtd += portion;
    remaining -= portion;
    slices.push({ amount: portion, agent_pct: pct, capped });
  }
  return { agent, company, slices, capped: capAmt != null && cd >= capAmt - 1e-9, company_dollar_ytd: cd };
}

function describeSlices(slices) {
  if (slices.length <= 1) return `${slices[0]?.agent_pct ?? 100}/${100 - (slices[0]?.agent_pct ?? 100)} split`;
  return slices.map((s) => `$${r2(s.amount).toLocaleString('en-US')} at ${s.agent_pct}/${100 - s.agent_pct}${s.capped ? ' (capped)' : ''}`).join(', ');
}

/** Calculates one deal. Returns per-agent results plus totals and payouts. */
export function calculateDeal(deal) {
  const gross = num(deal.gross_commission);
  const lines = [];
  const payouts = [];
  let referral = 0;
  if (deal.referral?.amount) {
    referral = deal.referral.type === 'flat' ? num(deal.referral.amount) : gross * num(deal.referral.amount) / 100;
    lines.push({ label: `Referral fee${deal.referral.to ? ` to ${deal.referral.to}` : ''}`, amount: -r2(referral) });
    if (deal.referral.to) payouts.push({ kind: 'referral', payee_email: deal.referral.to, amount: r2(referral) });
  }
  const adjusted = gross - referral;
  const agents = (deal.agents?.length ? deal.agents : []).map((a) => ({ split_pct: 100, ...a }));
  const totalPct = agents.reduce((s, a) => s + num(a.split_pct), 0) || 100;

  const results = agents.map((a) => {
    const config = a.plan?.config || a.plan || {};
    const ytd = { gci: 0, volume: 0, units: 0, company_dollar: 0, fees: {}, revshare: 0, ...(a.ytd || {}) };
    const share = adjusted * num(a.split_pct) / totalPct;
    const al = [];
    al.push({ label: `Share of commission (${r2(num(a.split_pct) / totalPct * 100)}%)`, amount: r2(share) });

    // Team lead before the brokerage split, if the plan says so.
    let team = 0;
    let splitBase = share;
    if (config.team?.lead_pct && a.team_lead_email && config.team.basis === 'before_split') {
      team = share * num(config.team.lead_pct) / 100;
      splitBase -= team;
      al.push({ label: `Team lead share (${config.team.lead_pct}%) to ${a.team_lead_email}`, amount: -r2(team) });
    }

    const capWasReached = config.cap?.amount != null && num(ytd.company_dollar) >= num(config.cap.amount);
    const split = splitShare(config, splitBase, ytd);
    al.push({ label: `Brokerage split: ${describeSlices(split.slices)}`, amount: -r2(split.company) });

    if (config.team?.lead_pct && a.team_lead_email && config.team.basis !== 'before_split') {
      team = split.agent * num(config.team.lead_pct) / 100;
      al.push({ label: `Team lead share (${config.team.lead_pct}%) to ${a.team_lead_email}`, amount: -r2(team) });
    }

    // Fees
    let fees = 0;
    let feesTowardCap = 0;
    const feeYtd = { ...(ytd.fees || {}) };
    for (const f of config.fees || []) {
      const applies = f.when === 'pre_cap' ? !capWasReached : f.when === 'post_cap' ? split.capped : true;
      if (!applies) continue;
      let amt = f.type === 'pct_gross' ? share * num(f.amount) / 100
        : f.type === 'pct_agent' ? split.agent * num(f.amount) / 100
          : num(f.amount);
      if (f.annual_cap != null && f.annual_cap !== '') {
        const paid = num(feeYtd[f.id || f.name]);
        amt = Math.max(0, Math.min(amt, num(f.annual_cap) - paid));
      }
      if (amt <= 0) continue;
      feeYtd[f.id || f.name] = num(feeYtd[f.id || f.name]) + amt;
      fees += amt;
      if (f.counts_toward_cap) feesTowardCap += amt;
      al.push({ label: f.name || 'Fee', amount: -r2(amt) });
    }

    // Agent-specific deductions
    let deductions = 0;
    for (const d of (deal.deductions || []).filter((x) => x.agent_email === a.email)) {
      deductions += num(d.amount);
      al.push({ label: d.name || 'Deduction', amount: -r2(num(d.amount)) });
      if (d.payee) payouts.push({ kind: 'deduction', payee_email: d.payee, amount: r2(num(d.amount)), for_agent: a.email });
    }

    const agentNet = split.agent - (config.team?.basis === 'before_split' ? 0 : team) - fees - deductions;
    al.push({ label: 'Agent net', amount: r2(agentNet), total: true });

    // Downline revenue share, paid by the brokerage out of its company dollar.
    const rev = [];
    let revTotal = 0;
    if (config.downline?.levels?.length) {
      const base = config.downline.basis === 'gross' ? share : split.company;
      let room = config.downline.per_agent_annual_cap != null && config.downline.per_agent_annual_cap !== ''
        ? Math.max(0, num(config.downline.per_agent_annual_cap) - num(ytd.revshare)) : Infinity;
      config.downline.levels.forEach((lvl, i) => {
        const sponsor = (a.sponsors || [])[i];
        if (!sponsor || room <= 0) return;
        const amt = Math.min(base * num(lvl.pct) / 100, room);
        if (amt <= 0) return;
        room -= amt;
        revTotal += amt;
        rev.push({ level: i + 1, email: sponsor, pct: num(lvl.pct), amount: r2(amt) });
      });
    }

    const companyDollar = split.company + feesTowardCap;
    const ytdAfter = {
      gci: num(ytd.gci) + share,
      volume: num(ytd.volume) + num(deal.sale_price) * num(a.split_pct) / totalPct,
      units: num(ytd.units) + num(deal.units, 1) * num(a.split_pct) / totalPct,
      company_dollar: num(ytd.company_dollar) + companyDollar,
      fees: feeYtd,
      revshare: num(ytd.revshare) + revTotal,
    };
    const capAmt = config.cap?.amount != null && config.cap.amount !== '' ? num(config.cap.amount) : null;

    payouts.push({ kind: 'agent', payee_email: a.email, payee_name: a.name, amount: r2(agentNet) });
    if (team > 0) payouts.push({ kind: 'team_lead', payee_email: a.team_lead_email, amount: r2(team), for_agent: a.email });
    for (const r of rev) payouts.push({ kind: 'revshare', payee_email: r.email, amount: r.amount, level: r.level, for_agent: a.email });

    return {
      email: a.email,
      name: a.name,
      share: r2(share),
      company_dollar: r2(companyDollar),
      brokerage_split: r2(split.company),
      fees: r2(fees),
      team_lead: r2(team),
      deductions: r2(deductions),
      agent_net: r2(agentNet),
      revshare: rev,
      revshare_total: r2(revTotal),
      brokerage_net: r2(split.company + fees - revTotal),
      capped_after: capAmt != null && ytdAfter.company_dollar >= capAmt - 0.005,
      cap: capAmt != null ? { amount: capAmt, paid_before: r2(ytd.company_dollar), paid_after: r2(Math.min(ytdAfter.company_dollar, capAmt)), remaining: r2(Math.max(0, capAmt - ytdAfter.company_dollar)) } : null,
      ytd_after: ytdAfter,
      lines: al,
    };
  });

  const totals = {
    gross: r2(gross),
    referral: r2(referral),
    adjusted_gross: r2(adjusted),
    agent_net: r2(results.reduce((s, x) => s + x.agent_net, 0)),
    team_lead: r2(results.reduce((s, x) => s + x.team_lead, 0)),
    company_dollar: r2(results.reduce((s, x) => s + x.brokerage_split, 0)),
    fees: r2(results.reduce((s, x) => s + x.fees, 0)),
    deductions: r2(results.reduce((s, x) => s + x.deductions, 0)),
    revshare: r2(results.reduce((s, x) => s + x.revshare_total, 0)),
    brokerage_net: r2(results.reduce((s, x) => s + x.brokerage_net, 0)),
  };
  return { totals, agents: results, lines, payouts: payouts.filter((p) => p.amount > 0) };
}

/** Start of the agent's current cap year (anniversary of their cap start / start date). */
export function capYearStart(anniversary, on = new Date()) {
  if (!anniversary) return new Date(Date.UTC(on.getUTCFullYear(), 0, 1)).toISOString().slice(0, 10);
  const a = new Date(`${String(anniversary).slice(0, 10)}T00:00:00Z`);
  let y = on.getUTCFullYear();
  const make = (yy) => {
    const d = new Date(Date.UTC(yy, a.getUTCMonth(), a.getUTCDate()));
    if (d.getUTCMonth() !== a.getUTCMonth()) d.setUTCDate(0); // Feb 29 -> Feb 28
    return d;
  };
  let start = make(y);
  if (start > on) start = make(y - 1);
  return start.toISOString().slice(0, 10);
}
