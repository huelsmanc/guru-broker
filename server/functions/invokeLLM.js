// New: server side of `base44.integrations.Core.InvokeLLM` (Claude or ChatGPT).
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { resolveForUser } from '../lib/files.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const params = await req.json();
    if (Array.isArray(params.file_urls) && params.file_urls.length) params.file_urls = await resolveForUser(me, base44.entities, params.file_urls.slice(0, 10));
    const result = await InvokeLLM(params);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
