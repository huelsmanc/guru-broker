// New: AI help for placing signature fields. The browser finds signature lines, initial
// boxes and date lines in the PDF text (exact positions); this decides which signer and
// field type each one is. Positions never come from the AI, so fields land precisely.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

export default async (req: Request) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const { candidates = [], signers = [], title = '' } = await req.json();
    if (!candidates.length) return Response.json({ assignments: [] });

    const list = candidates.slice(0, 250).map((c) => `${c.id} | page ${c.page} | "${String(c.context || '').slice(0, 140)}"`).join('\n');
    const people = signers.map((s, i) => `${i}: ${s.name || ''} <${s.email || ''}>${s.role ? ` (${s.role})` : ''}`).join('\n') || '0: the signer';

    const result = await InvokeLLM({
      max_tokens: 4000,
      response_json_schema: {
        type: 'object',
        properties: {
          assignments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['signature', 'initial', 'date', 'text', 'skip'] },
                signer_index: { type: 'integer' },
              },
              required: ['id', 'type', 'signer_index'],
            },
          },
        },
        required: ['assignments'],
      },
      prompt: `Document: "${title}"
Signers (index: name <email>):
${people}

Below are blank lines and boxes found in the document with nearby text. For each one decide:
- type: signature, initial, date (date signed), text (a blank the signer fills), or skip (a line for someone who is not a signer, e.g. a notary or witness, or not a blank for signing at all)
- signer_index: which signer it belongs to. Match "Buyer"/"Purchaser" lines to buyers, "Seller"/"Owner" lines to sellers, "Agent"/"Broker"/"Licensee" lines to agents, in the order they appear (Buyer 1, Buyer 2...). If unclear, use 0.

Candidates (id | page | nearby text):
${list}`,
    });
    return Response.json({ assignments: result?.assignments || [] });
  } catch (error) {
    console.error('aiAssignFields:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
