// Adds a person by name and email: creates their login, puts them in the brokerage with the
// chosen role and their name, and emails them a link to set a password.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'super_admin' && !isAdminRole(user?.role) && !can(user, 'users.manage')) {
      return Response.json({ error: 'Only admins can add people' }, { status: 403 });
    }
    const { email, full_name, role, brokerage_id } = await req.json();
    if (!email || !full_name) return Response.json({ error: 'Name and email are required' }, { status: 400 });
    if (role === 'super_admin' && user.role !== 'super_admin') return Response.json({ error: 'Only a super admin can grant that role' }, { status: 403 });
    // Admins add people to their own brokerage; the super admin picks one.
    const brokerage = user.role === 'super_admin' ? (brokerage_id || user.brokerage_id) : user.brokerage_id;
    if (!brokerage) return Response.json({ error: 'Choose a brokerage first' }, { status: 400 });
    const result = await base44.users.inviteUser(email, role || 'user', { brokerage_id: brokerage, full_name, nextUrl: '/Dashboard' });
    return Response.json({
      success: true,
      message: result.already_registered ? `${email} already had an account; we sent them a sign-in link.` : `Invite sent to ${email}. They can now set their password and log in.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
});
