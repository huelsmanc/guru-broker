// New: Base44 data import from the Import page. One table at a time, in batches:
// { entity: 'Transaction', rows: [...], copyFiles: true }. The super admin can import
// everything (all brokerages, as the command-line script does); an owner or broker only
// brings in their own brokerage's records.
import { createClientFromRequest } from '../lib/base44.js';
import { importBase44Batch } from '../lib/importers.js';
import { importerBrokerage } from './importPeople.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json();
    const full = me.role === 'super_admin' && body.all_brokerages === true;
    const brokerageId = full ? null : importerBrokerage(me, body);
    const report = await importBase44Batch({ entity: String(body.entity || ''), rows: (body.rows || []).slice(0, 200), brokerageId, actor: me, copyFiles: body.copyFiles !== false, deadline: Date.now() + 45000 });
    return Response.json(report);
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
