// New: AI help for placing signature fields. The browser finds signature lines, initial
// boxes and date lines in the PDF text (exact positions); this decides which signer and
// field type each one is. Positions never come from the AI, so fields land precisely.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    await base44.auth.me();
    const { candidates = [], signers = [], title = '', facts } = await req.json();
    if (!candidates.length) return Response.json({ assignments: [] });

    // Facts the agent already entered (offer terms or the deal), for filling blanks in.
    const known = facts && typeof facts === 'object' ? Object.fromEntries(Object.entries({
      property_address: facts.property_address, city: facts.city, state: facts.state, zip: facts.zip, mls_number: facts.mls_number,
      offer_or_sale_price: facts.offer_price ?? facts.sale_price, list_price: facts.list_price,
      buyers: (facts.buyers || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean).join(', ') || facts.buyer_name,
      sellers: (facts.sellers || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean).join(', ') || facts.seller_name,
      earnest_money_initial_deposit: facts.earnest_money, financing_type: facts.financing_type, down_payment_percent: facts.down_payment_percent,
      loan_amount: facts.loan_amount, inspection_days: facts.inspection_days, financing_contingency_days: facts.financing_days,
      appraisal_contingency: facts.appraisal_contingency, closing_date: facts.closing_date, offer_expires: facts.offer_expiration,
      seller_concessions: facts.seller_concessions, included_personal_property: facts.included_items, special_terms: facts.special_terms,
      buyer_agent: facts.agent_name, buyer_agent_email: facts.agent_email, listing_agent: facts.listing_agent_name, brokerage: facts.brokerage_name,
      today: new Date().toLocaleDateString('en-US', { timeZone: process.env.APP_TIMEZONE || 'America/New_York' }),
      // Answers from the AI intake questionnaire ("question": "answer"), the most specific facts.
      ...(Array.isArray(facts.intake) ? { answers_from_agent: Object.fromEntries(facts.intake.filter((a) => a && a.label && String(a.value ?? '').trim()).slice(0, 80).map((a) => [String(a.label).slice(0, 160), String(a.value).slice(0, 600)])) } : {}),
    }).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && !Object.keys(v).length))) : null;

    const list = candidates.slice(0, 250).map((c) => `${c.id} | page ${c.page} | "${String(c.context || '').slice(0, 140)}"`).join('\n');
    const people = signers.map((s, i) => `${i}: ${s.name || ''} <${s.email || ''}>${s.role ? ` (${s.role})` : ''}`).join('\n') || '0: the signer';

    const result = await InvokeLLM({
      max_tokens: 8000,
      response_json_schema: {
        type: 'object',
        properties: {
          assignments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                type: { type: 'string', enum: ['signature', 'initial', 'date', 'text', 'fill', 'skip'] },
                signer_index: { type: 'integer' },
                label: { type: 'string', description: 'Short name of what goes in the blank, e.g. "Purchase price"' },
                value: { type: 'string', description: 'For fill: the text to write, from the deal facts only; empty if not known' },
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
- type: signature, initial, date (date signed), text (a blank the signer fills in themselves), fill (a blank the agent fills in before sending: names, addresses, prices, amounts, dates, days, items), or skip (a line for someone who is not a signer, e.g. a notary, witness or attorney, a decorative rule, or not a blank at all)
- label: a few words naming what the blank is for
- value: only for fill. ${known ? 'Write what belongs there using ONLY these facts (answers_from_agent are the agent\'s own answers for this exact form; prefer them). For a checkbox-style blank next to a choice, write X if the agent\'s answer picks that choice, else leave it empty; format money like $500,000.00, dates like 11/15/2026. If the facts don\'t say, leave it empty. Never guess or invent.' : 'Leave empty.'}
- signer_index: which signer it belongs to. Match "Buyer"/"Purchaser" lines to buyers, "Seller"/"Owner" lines to sellers, "Agent"/"Broker"/"Licensee" lines to agents, in the order they appear (Buyer 1, Buyer 2...). If unclear, use 0.

${known ? `Facts:\n${JSON.stringify(known, null, 1)}\n` : ''}Candidates (id | page | nearby text):
${list}`,
    });
    return Response.json({ assignments: result?.assignments || [] });
  } catch (error) {
    console.error('aiAssignFields:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
