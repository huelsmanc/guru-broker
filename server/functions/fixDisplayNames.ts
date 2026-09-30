// Ported from Base44 function `fixDisplayNames`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (user?.role !== 'super_admin' && user?.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const { email, display_name } = await req.json();

    if (!email || !display_name) {
      return Response.json({ error: 'Missing required fields: email, display_name' }, { status: 400 });
    }

    // Find user by email and update display_name
    const users = await base44.asServiceRole.entities.User.filter({ email });
    
    if (users.length === 0) {
      return Response.json({ error: `User with email ${email} not found` }, { status: 404 });
    }

    await base44.asServiceRole.entities.User.update(users[0].id, { display_name });

    return Response.json({
      success: true,
      message: `Updated ${email} display name to "${display_name}"`,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});