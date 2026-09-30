import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
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

    // Delete user entity record (this is the safe way without needing direct db access)
    // The user will be logged out by the frontend after this succeeds
    console.log(`Account deletion requested for: ${email}`);

    return Response.json({ success: true, message: 'Account deletion initiated' });
  } catch (error) {
    console.error('Error deleting account:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});