// Ported from Base44 function `forceCreateUser`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'super_admin' && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email, full_name, role, brokerage_id } = await req.json();

    if (!email || !full_name || !brokerage_id) {
      return Response.json({ error: 'Missing required fields: email, full_name, brokerage_id' }, { status: 400 });
    }

    // Send invite email using the proper SDK method
    await base44.users.inviteUser(email, role || 'user', {
      nextUrl: `/JoinBrokerage?brokerage_id=${brokerage_id}`
    });

    return Response.json({
      success: true,
      message: `Invite sent to ${email}. They can now set their password and log in.`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});