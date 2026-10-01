// New: server side of `base44.users.inviteUser`. Sends a Supabase invite email and
// places the new user in the inviting admin's brokerage.
import { createClientFromRequest } from '../lib/base44.js';

import { isAdminRole, can } from '../lib/team.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!isAdminRole(me.role)) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { email, role = 'user', brokerage_id, nextUrl } = await req.json();
    if (!email) return Response.json({ error: 'Email required' }, { status: 400 });
    if (role === 'super_admin' && me.role !== 'super_admin') {
      return Response.json({ error: 'Only a super admin can grant that role' }, { status: 403 });
    }
    // Only the super admin picks the brokerage; everyone else invites into their own.
    const opts = { nextUrl: typeof nextUrl === 'string' && nextUrl.startsWith('/') && !nextUrl.startsWith('//') ? nextUrl : undefined };
    if (me.role === 'super_admin' && brokerage_id) opts.brokerage_id = String(brokerage_id);
    return Response.json(await base44.users.inviteUser(email, role, opts));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
