// Commission engine tests. Run: node tests/commission.test.mjs
import assert from 'node:assert/strict';
import { calculateDeal, splitShare, capYearStart, r2 } from '../shared/commission.js';

const deal = (over) => ({ gross_commission: 10000, sale_price: 400000, agents: [], ...over });
const one = (config, ytd = {}, extra = {}) => ({ email: 'ann@x.com', name: 'Ann', plan: { config }, ytd, ...extra });

// Every dollar is accounted for.
function balanced(res) {
  const { totals: t } = res;
  const out = t.agent_net + t.team_lead + t.company_dollar + t.fees + t.deductions;
  assert.ok(Math.abs(out - t.adjusted_gross) < 0.03, `money balances: ${out} vs ${t.adjusted_gross}`);
}

// 1. Plain 80/20
let res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 80 } })] }));
assert.equal(res.totals.agent_net, 8000); assert.equal(res.totals.company_dollar, 2000); balanced(res);

// 2. Cap crossed mid-deal: 80/20, $18k cap, $17k paid -> $5k at 80/20 then the rest at 100%
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 80 }, cap: { amount: 18000, after_cap_agent_pct: 100 } }, { company_dollar: 17000 })] }));
assert.equal(res.agents[0].brokerage_split, 1000, 'only $1,000 left on the cap');
assert.equal(res.agents[0].agent_net, 9000);
assert.equal(res.agents[0].capped_after, true);
assert.equal(res.agents[0].cap.remaining, 0);
assert.match(res.agents[0].lines[1].label, /\$5,000 at 80\/20, \$5,000 at 100\/0 \(capped\)/);
balanced(res);

// 3. Already capped, post-cap fee applies, pre-cap fee doesn't
const capPlan = { split: { agent_pct: 80 }, cap: { amount: 18000, after_cap_agent_pct: 100 },
  fees: [{ id: 'tx', name: 'Transaction fee', type: 'flat', amount: 395, when: 'pre_cap' }, { id: 'post', name: 'Post-cap fee', type: 'flat', amount: 250, when: 'post_cap' }] };
res = calculateDeal(deal({ agents: [one(capPlan, { company_dollar: 18000 })] }));
assert.equal(res.agents[0].fees, 250); assert.equal(res.agents[0].agent_net, 9750); balanced(res);
res = calculateDeal(deal({ agents: [one(capPlan, { company_dollar: 0 })] }));
assert.equal(res.agents[0].fees, 395, 'pre-cap only before capping'); balanced(res);

// 4. Sliding scale by GCI crossing a tier mid-deal: 70% until $100k GCI, then 85%
const tiered = { tiers: { basis: 'gci', levels: [{ from: 0, agent_pct: 70 }, { from: 100000, agent_pct: 85 }] } };
res = calculateDeal(deal({ agents: [one(tiered, { gci: 96000 })] }));
// $4,000 at 70% = 2,800 ; $6,000 at 85% = 5,100
assert.equal(res.agents[0].agent_net, 7900); balanced(res);

// 5. Volume tiers are decided at the start of the deal
const vol = { tiers: { basis: 'volume', levels: [{ from: 0, agent_pct: 70 }, { from: 5000000, agent_pct: 90 }] } };
res = calculateDeal(deal({ agents: [one(vol, { volume: 4900000 })] }));
assert.equal(res.agents[0].agent_net, 7000);
res = calculateDeal(deal({ agents: [one(vol, { volume: 5000000 })] }));
assert.equal(res.agents[0].agent_net, 9000);

// 6. Flat fee per deal (100% plan)
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 100 }, fees: [{ id: 'flat', name: 'Flat fee', type: 'flat', amount: 499 }] })] }));
assert.equal(res.agents[0].agent_net, 9501); assert.equal(res.totals.brokerage_net, 499); balanced(res);

// 7. Fee with an annual cap
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 100 }, fees: [{ id: 'eo', name: 'E&O', type: 'pct_gross', amount: 2, annual_cap: 500 }] }, { fees: { eo: 450 } })] }));
assert.equal(res.agents[0].fees, 50, 'fee stops at its annual cap');

// 8. Team lead after split: 80/20, team lead 30% of agent's split
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 80 }, team: { lead_pct: 30 } }, {}, { team_lead_email: 'lead@x.com' })] }));
assert.equal(res.agents[0].team_lead, 2400); assert.equal(res.agents[0].agent_net, 5600); balanced(res);
assert.ok(res.payouts.some((p) => p.kind === 'team_lead' && p.payee_email === 'lead@x.com' && p.amount === 2400));

// 9. Team lead before split
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 80 }, team: { lead_pct: 20, basis: 'before_split' } }, {}, { team_lead_email: 'lead@x.com' })] }));
assert.equal(res.agents[0].team_lead, 2000); assert.equal(res.agents[0].brokerage_split, 1600); assert.equal(res.agents[0].agent_net, 6400); balanced(res);

// 10. Downline: 3 levels on company dollar, sponsors only 2 deep, per-agent annual cap
const rs = { split: { agent_pct: 80 }, downline: { basis: 'company_dollar', per_agent_annual_cap: 4000, levels: [{ pct: 3.5 }, { pct: 4 }, { pct: 2.5 }] } };
res = calculateDeal(deal({ agents: [one(rs, {}, { sponsors: ['s1@x.com', 's2@x.com'] })] }));
assert.deepEqual(res.agents[0].revshare.map((r) => [r.level, r.email, r.amount]), [[1, 's1@x.com', 70], [2, 's2@x.com', 80]]);
assert.equal(res.totals.brokerage_net, 2000 - 150); balanced(res);
res = calculateDeal(deal({ agents: [one(rs, { revshare: 3950 }, { sponsors: ['s1@x.com', 's2@x.com'] })] }));
assert.equal(res.agents[0].revshare_total, 50, 'revshare stops at the per-agent cap');

// 11. Referral out + two co-agents 60/40 on different plans
res = calculateDeal(deal({
  referral: { type: 'pct', amount: 25, to: 'ref@other.com' },
  agents: [one({ split: { agent_pct: 80 } }, {}, { split_pct: 60 }), { email: 'bo@x.com', name: 'Bo', split_pct: 40, plan: { config: { split: { agent_pct: 70 } } } }],
}));
assert.equal(res.totals.referral, 2500); assert.equal(res.totals.adjusted_gross, 7500);
assert.equal(res.agents[0].agent_net, 3600); assert.equal(res.agents[1].agent_net, 2100);
assert.ok(res.payouts.some((p) => p.kind === 'referral' && p.amount === 2500)); balanced(res);

// 12. Deduction paid to a vendor
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 80 } })], deductions: [{ agent_email: 'ann@x.com', name: 'Photos', amount: 200, payee: 'photo@vendor.com' }] }));
assert.equal(res.agents[0].agent_net, 7800); balanced(res);

// 13. Fees counting toward the cap
res = calculateDeal(deal({ agents: [one({ split: { agent_pct: 90 }, cap: { amount: 5000 }, fees: [{ id: 'f', name: 'Franchise', type: 'pct_gross', amount: 6, counts_toward_cap: true }] })] }));
assert.equal(res.agents[0].company_dollar, 1600); assert.equal(res.agents[0].cap.paid_after, 1600);

// 14. Cap year from anniversary
assert.equal(capYearStart('2021-03-15', new Date('2026-09-30T12:00:00Z')), '2026-03-15');
assert.equal(capYearStart('2021-11-01', new Date('2026-09-30T12:00:00Z')), '2025-11-01');
assert.equal(capYearStart('2020-02-29', new Date('2026-03-01T00:00:00Z')), '2026-02-28');
assert.equal(capYearStart(null, new Date('2026-09-30T00:00:00Z')), '2026-01-01');

// 15. Zero and missing values don't crash
res = calculateDeal({ gross_commission: 0, agents: [one({})] });
assert.equal(res.totals.agent_net, 0);
assert.equal(r2(0.1 + 0.2), 0.3);
assert.equal(splitShare({}, 1000, {}).agent, 1000, 'no plan = agent keeps 100%');

console.log('commission engine: all checks passed');
