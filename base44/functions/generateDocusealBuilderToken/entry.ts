import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as jose from 'npm:jose@5.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get user - try auth first, fall back gracefully
    let userEmail = 'admin@company.com';
    try {
      const user = await base44.auth.me();
      if (user?.email) {
        userEmail = user.email;
      }
    } catch (authErr) {
      console.warn('Auth check failed, proceeding with default email:', authErr.message);
    }

    const { 
      documentUrls = [], 
      templateId = '', 
      externalId = '', 
      templateName = 'New Template',
      adminEmail = userEmail
    } = await req.json();
    
    const apiKey = Deno.env.get('DOCUSEAL_API_KEY');
    if (!apiKey) {
      return Response.json({ error: 'API key not configured' }, { status: 500 });
    }

    const payload = {
      user_email: adminEmail,
      name: templateName,
    };

    if (externalId) {
      payload.external_id = externalId;
    }
    
    if (templateId) {
      payload.template_id = templateId;
    } else if (documentUrls.length > 0) {
      payload.documents = documentUrls.map(url => ({ url }));
    }

    const secret = new TextEncoder().encode(apiKey);
    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .sign(secret);

    return Response.json({ token });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});