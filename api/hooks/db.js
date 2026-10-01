// Receives database change events from Supabase and runs the matching automation,
// replacing Base44's entity automations. Postgres triggers (see
// supabase/migrations/0002_automations.sql) POST here with the shared HOOK_SECRET.

import { run } from '../../server/lib/runner.js';
import { SERVICE_HEADER, isServiceRequest } from '../../server/lib/base44.js';
import { fromRow } from '../../shared/entities.js';

// table -> { INSERT/UPDATE: [functions] }
const AUTOMATIONS = {
  compliance_training: { INSERT: ['notifyAgentsNewTraining'], entity: 'ComplianceTraining' },
  activity_log: { INSERT: ['notifyDocumentActivity'], entity: 'ActivityLog' },
  esign_document: { UPDATE: ['notifySignatureUpdate'], entity: 'ESignDocument' },
  transaction: { INSERT: ['applyDefaultChecklists'], entity: 'Transaction' },
  profiles: { INSERT: ['applyDefaultChecklists'], UPDATE: ['applyDefaultChecklists'], entity: 'User' },
};

const TYPE = { INSERT: 'create', UPDATE: 'update', DELETE: 'delete' };

export async function POST(request) {
  if (!isServiceRequest(request)) return Response.json({ error: 'Forbidden' }, { status: 403 });
  const { type, table, record, old_record } = await request.json();
  const rule = AUTOMATIONS[table];
  const targets = rule?.[type] || [];
  const event = {
    type: TYPE[type],
    entity_name: rule?.entity,
    entity_id: (record || old_record)?.id,
    data: fromRow(record),
    old_data: fromRow(old_record),
  };
  const results = {};
  for (const name of targets) {
    const req = new Request(new URL(`/api/fn/${name}`, request.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SERVICE_HEADER]: process.env.HOOK_SECRET },
      body: JSON.stringify({ event, data: event.data }),
    });
    const res = await run(name, req);
    results[name] = res.status;
  }
  return Response.json({ ok: true, results });
}
