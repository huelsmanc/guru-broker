// New: server side of `base44.entities.User.delete(id)`. Removes the login too.
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { user_id } = await req.json();
    if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400 });
    const admin = adminClient();
    const { data: target } = await admin.from('profiles').select('id, brokerage_id, role').eq('id', user_id).maybeSingle();
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 });
    const allowed = me.role === 'super_admin'
      || ((isAdminRole(me.role) || can(me, 'users.manage')) && target.brokerage_id === me.brokerage_id && target.role !== 'super_admin');
    if (!allowed) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const { error } = await admin.auth.admin.deleteUser(user_id);
    if (error) throw new Error(error.message);
    return Response.json({ success: true, id: user_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
