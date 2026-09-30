// New: lists an agent's monthly statements (admins can ask for anyone's) with short-lived links.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { email } = await req.json().catch(() => ({}));
    const target = String(email || me.email).toLowerCase();
    if (target !== me.email.toLowerCase() && !isAdminRole(me.role)) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const store = adminClient().storage.from('private-files');
    const { data } = await store.list(`statements/${target}`, { limit: 120, sortBy: { column: 'name', order: 'desc' } });
    const out = [];
    for (const f of data || []) {
      const { data: s } = await store.createSignedUrl(`statements/${target}/${f.name}`, 600);
      out.push({ month: f.name.replace('.pdf', ''), url: s?.signedUrl });
    }
    return Response.json({ statements: out });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
