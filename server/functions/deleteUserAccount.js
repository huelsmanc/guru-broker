// Ported from Base44 function `deleteUserAccount`. Now really deletes the account (see below).
import { createClientFromRequest, adminClient } from '../lib/base44.js';

export default (async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { email } = body;

    // Verify the email matches the authenticated user
    if (email !== user.email) {
      return Response.json({ error: 'Email mismatch' }, { status: 403 });
    }

    // Migration change: Base44 only logged this request. Now the login and profile are
    // actually removed, which app stores require for "delete my account".
    const { error: delError } = await adminClient().auth.admin.deleteUser(user.id);
    if (delError) throw new Error(delError.message);

    return Response.json({ success: true, message: 'Account deletion initiated' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});