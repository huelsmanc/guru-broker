// Checks the Base44-compatible entity layer builds the right Supabase queries.
// Run: node tests/entities.test.mjs
import assert from 'node:assert/strict';
import { makeEntities } from '../shared/entities.js';

function fakeClient(rows = [{ id: 'r1', status: 'active', extra: { custom_field: 'x' } }]) {
  const log = [];
  const builder = (table) => {
    const q = { table, ops: [] };
    const chain = new Proxy({}, {
      get(_, op) {
        if (op === 'then') {
          log.push(q);
          const single = q.ops.some((o) => o[0] === 'single' || o[0] === 'maybeSingle');
          return (res) => res({ data: single ? rows[0] : rows, error: null });
        }
        return (...args) => { q.ops.push([op, ...args]); return chain; };
      },
    });
    return chain;
  };
  return { log, from: builder };
}

const sb = fakeClient();
const E = makeEntities(() => sb, { getEmail: async () => 'me@x.com' });

// filter: typed column, extra field, $in, sort, limit
const out = await E.Transaction.filter({ status: 'active', custom_field: 'x', agent_email: { $in: ['a', 'b'] } }, '-closing_date', 10);
assert.equal(out[0].custom_field, 'x', 'extra fields are flattened onto the record');
assert.equal(out[0].extra, undefined);
const ops = sb.log.at(-1).ops;
assert.deepEqual(ops.find((o) => o[0] === 'eq' && o[1] === 'status'), ['eq', 'status', 'active']);
assert.deepEqual(ops.find((o) => o[1] === 'extra->>custom_field'), ['eq', 'extra->>custom_field', 'x']);
assert.deepEqual(ops.find((o) => o[0] === 'in'), ['in', 'agent_email', ['a', 'b']]);
assert.deepEqual(ops.find((o) => o[0] === 'order').slice(0, 2), ['order', 'closing_date']);
assert.equal(ops.find((o) => o[0] === 'order')[2].ascending, false);
assert.deepEqual(ops.find((o) => o[0] === 'range'), ['range', 0, 9]);
assert.equal(sb.log.at(-1).table, 'transaction');

// create: unknown keys go to extra, blank numbers become null, created_by filled
await E.Transaction.create({ property_address: '1 Main', sale_price: '', mystery: 5 });
const ins = sb.log.at(-1).ops.find((o) => o[0] === 'insert')[1];
assert.equal(ins.property_address, '1 Main');
assert.equal(ins.sale_price, null);
assert.deepEqual(ins.extra, { mystery: 5 });
assert.equal(ins.created_by, 'me@x.com');

// update: merges new extra keys with existing ones
await E.Transaction.update('r1', { status: 'closed', another: 1 });
const upd = sb.log.at(-1).ops.find((o) => o[0] === 'update')[1];
assert.equal(upd.status, 'closed');
assert.deepEqual(upd.extra, { custom_field: 'x', another: 1 });

// entity name mapping
await E.CMAsReport.list();
assert.equal(sb.log.at(-1).table, 'cmas_report');
await E.User.list();
assert.equal(sb.log.at(-1).table, 'profiles');
await E.ESignDocument.filter({ id: 'abc' });
assert.equal(sb.log.at(-1).table, 'esign_document');

// jsonb containment (used to find signing links)
await E.ESignSubmission.filter({ signers: [{ token: 'abc' }] });
assert.deepEqual(sb.log.at(-1).ops.find((o) => o[0] === 'contains'), ['contains', 'signers', '[{"token":"abc"}]']);

console.log('entities: all checks passed');
