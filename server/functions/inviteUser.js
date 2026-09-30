// New: server side of `base44.users.inviteUser`. Sends a Supabase invite email and
// places the new user in the inviting admin's brokerage.
import { createClientFromRequest } from '../lib/base44.js';

const ADMIN_ROLES = ['admin', 'broker', 'super_admin'];

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!ADMIN_ROLES.includes(me.role)) return Response.json({ error: 'Admins only' }, { status: 403 });
    const { email, role = 'user' } = await req.json();
    if (!email) return Response.json({ error: 'Email required' }, { status: 400 });
    if (role === 'super_admin' && me.role !== 'super_admin') {
      return Response.json({ error: 'Only a super admin can grant that role' }, { status: 403 });
    }
    return Response.json(await base44.users.inviteUser(email, role));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
