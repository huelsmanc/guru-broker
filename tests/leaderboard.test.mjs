import assert from 'node:assert/strict';
import { leaderboard } from '../shared/leaderboard.js';
const people = [{ email: 'ann@x.com', full_name: 'Ann Agent' }, { email: 'bob@x.com', full_name: 'Bob Broker' }, { email: 'cy@x.com', full_name: 'Cy' }];
const out = leaderboard({
  from: '2026-10-01', to: '2026-10-31', people,
  records: [
    { status: 'paid', closed_date: '2026-10-05', agent_email: 'ann@x.com', transaction_id: 't1', gross_share: 9000, calc: { volume_share: 300000, units_share: 0.5 } },
    { status: 'approved', closed_date: '2026-10-05', agent_email: 'bob@x.com', transaction_id: 't1', gross_share: 9000, calc: { volume_share: 300000, units_share: 0.5 } },
    { status: 'void', closed_date: '2026-10-05', agent_email: 'cy@x.com', transaction_id: 't9', calc: { volume_share: 999999 } },
    { status: 'paid', closed_date: '2026-09-30', agent_email: 'cy@x.com', transaction_id: 't8', calc: { volume_share: 1 } },
  ],
  deals: [
    { id: 't1', status: 'closed', closed_date: '2026-10-05', sale_price: 600000, agent_email: 'ann@x.com' }, // already counted via records
    { id: 't2', status: 'closed', closing_date: '2026-10-20', sale_price: 400000, agent_email: 'cy@x.com', property_address: '1 Elm' },
    { id: 't3', status: 'Closed', closed_date: '2026-10-21', sale_price: 500000, agent_email: 'ann@x.com', co_agents: [{ email: 'bob@x.com', split_pct: 40 }] },
    { id: 't4', status: 'pending', closing_date: '2026-10-22', sale_price: 900000, agent_email: 'bob@x.com' },
    { id: 't5', status: 'closed', closed_date: '2026-11-02', sale_price: 900000, agent_email: 'bob@x.com' },
  ],
  manual: [{ agent_email: 'cy@x.com', agent_name: 'Cy', month: '2026-10-01', sales_amount: 250000 }, { agent_email: 'cy@x.com', month: '2026-08-01', sales_amount: 5 }],
});
const by = Object.fromEntries(out.agents.map((a) => [a.email, a]));
assert.equal(by['ann@x.com'].volume, 300000 + 300000, 'ann: record share + 60% of t3');
assert.equal(by['ann@x.com'].units, 1.1);
assert.equal(by['bob@x.com'].volume, 300000 + 200000, 'bob: record share + 40% of t3; pending and November deals excluded');
assert.equal(by['cy@x.com'].volume, 400000 + 250000, 'cy: closed deal + manual entry for October only');
assert.equal(by['cy@x.com'].manual, 250000);
assert.equal(by['ann@x.com'].name, 'Ann Agent');
assert.equal(out.totals.deals, 3, 't1, t2, t3');
assert.equal(out.totals.volume, 600000 + 500000 + 650000);
console.log('leaderboard: all checks passed');
