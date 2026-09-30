// Ported from Base44 function `getBrokerageUsers`. Logic unchanged.
import { createClientFromRequest } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const brokerageUsers = await base44.asServiceRole.entities.User.filter(
      { brokerage_id: user.brokerage_id },
      '-created_date',
      200
    );

    return Response.json({ users: brokerageUsers });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});