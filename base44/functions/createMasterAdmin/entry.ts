import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    // Only allow authenticated users (will be invited to super admin separately)
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Invite the master admin account
    await base44.users.inviteUser('cody@gurubroker.com', 'admin');
    
    return Response.json({ 
      success: true, 
      message: 'Master admin invitation sent to cody@gurubroker.com'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});