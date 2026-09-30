// New: server side of `base44.integrations.Core.InvokeLLM` (Claude or ChatGPT).
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const params = await req.json();
    const result = await InvokeLLM(params);
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
