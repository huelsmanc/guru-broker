// New: Brokermint users import from the Import page (owner, broker or super admin).
// { action: 'import', people: [brokermintPerson(row)...], invite } in batches, then
// { action: 'link', links: [{ email, recruiter, tcName }] } once everyone is in.
import { createClientFromRequest } from '../lib/base44.js';
import { importPeople, linkPeople } from '../lib/importers.js';
import { normalizeRole } from '../../shared/permissions.generated.js';

export function importerBrokerage(me, body) {
  const boss = ['owner', 'broker'].includes(normalizeRole(me.role)) || me.role === 'super_admin';
  if (!boss) throw Object.assign(new Error('Only the owner or broker can import'), { status: 403 });
  const b = me.role === 'super_admin' ? (body.brokerage_id || me.brokerage_id) : me.brokerage_id;
  if (!b) throw Object.assign(new Error('Pick a brokerage first'), { status: 400 });
  return b;
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json();
    const brokerageId = importerBrokerage(me, body);
    if (body.action === 'link') return Response.json(await linkPeople({ links: (body.links || []).slice(0, 2000), brokerageId }));
    const people = (body.people || []).slice(0, 25);
    return Response.json({ results: await importPeople({ people, brokerageId, invite: !!body.invite, actor: me }) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
