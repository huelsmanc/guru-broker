// New: server side of `base44.integrations.Core.CreateFileSignedUrl`.
import { createClientFromRequest } from '../lib/base44.js';
import { CreateFileSignedUrl } from '../lib/integrations.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    return Response.json(await CreateFileSignedUrl(await req.json()));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
