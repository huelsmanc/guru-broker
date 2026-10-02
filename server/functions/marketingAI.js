// New: writes the words and picks the look for a flyer or social post. The design itself is
// a real template filled with exact data (price, address, agent, logo), so nothing the AI
// writes can misspell a name or warp a logo. Also handles "make it shorter / more modern".
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { SCHEMA, SYSTEM, tidy, writeMarketing } from '../lib/marketingCopy.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { kind = 'just_listed', prompt = '', style = '', listing = {}, previous, instruction, brandColor } = await req.json();
    const agentName = me.display_name || me.full_name;
    if (!previous) return Response.json({ content: await writeMarketing({ kind, prompt, style, listing, agentName, brandColor }) });
    const ask = `Here is the current design content as JSON:\n${JSON.stringify(previous).slice(0, 6000)}\n\nChange it as requested: "${String(instruction || '').slice(0, 500)}". Keep everything else the same unless the request implies otherwise. Return the full updated content.`;
    return Response.json({ content: tidy(await InvokeLLM({ max_tokens: 2000, response_json_schema: SCHEMA, system: SYSTEM, prompt: ask })) });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
