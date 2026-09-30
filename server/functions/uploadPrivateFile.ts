// New: server side of `base44.integrations.Core.UploadPrivateFile`.
import { createClientFromRequest } from '../lib/base44.js';
import { UploadPrivateFile } from '../lib/integrations.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const form = await req.formData();
    const file = form.get('file');
    return Response.json(await UploadPrivateFile({ file }));
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
