import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (u) => { throw new Error('unexpected ' + u); };
globalThis.__users = { boss: { id: 'u3', email: 'boss@x.com' }, ann: { id: 'u1', email: 'ann@x.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann', role: 'user', brokerage_id: 'B1', extra: {} },
    { id: 'u3', email: 'boss@x.com', full_name: 'Boss', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'eve@o.com', full_name: 'Eve', role: 'user', brokerage_id: 'B2', extra: {} },
  ],
  transaction: [
    { id: 't1', brokerage_id: 'B1', status: 'closed', closed_date: '2026-10-03', sale_price: 450000, agent_email: 'ann@x.com', extra: {} },
    { id: 't2', brokerage_id: 'B2', status: 'closed', closed_date: '2026-10-03', sale_price: 999999, agent_email: 'eve@o.com', extra: {} },
  ],
  commission_record: [], agent_sales: [{ id: 's1', brokerage_id: 'B1', agent_email: 'boss@x.com', agent_name: 'Boss', month: '2026-10-01', sales_amount: 100000, extra: {} }],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/salesLeaderboard', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
let r = await call('ann', { from: '2026-10-01', to: '2026-10-31' });
assert.equal(r.status, 403, 'agents cannot see the brokerage leaderboard');
r = await call('boss', { from: '2026-10-01', to: '2026-10-31' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.deepEqual(r.body.agents.map((a) => [a.email, a.volume]).sort(), [['ann@x.com', 450000], ['boss@x.com', 100000]]);
assert.equal(r.body.totals.deals, 1);
console.log('sales leaderboard: all checks passed');
