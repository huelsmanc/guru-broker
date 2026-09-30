// New: server side of `base44.integrations.Core.SendEmail` (Resend).
import { createClientFromRequest } from '../lib/base44.js';
import { SendEmail } from '../lib/integrations.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    return Response.json(await SendEmail(await req.json()));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
