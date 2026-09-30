// New: AI offer writer. Turns the terms an agent enters into a clear, professional
// written offer. The agent reviews and edits the text before anything is sent.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

const money = (n) => (n == null || n === '' ? null : `$${Number(n).toLocaleString('en-US')}`);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const o = await req.json();
    if (!o.property_address || !o.offer_price) {
      return Response.json({ error: 'Property address and offer price are required' }, { status: 400 });
    }
    const terms = [
      ['Property', [o.property_address, o.city, o.state, o.zip].filter(Boolean).join(', ')],
      ['MLS #', o.mls_number],
      ['List price', money(o.list_price)],
      ['Offer price', money(o.offer_price)],
      ['Buyer(s)', (o.buyers || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean).join(', ')],
      ['Seller(s)', (o.sellers || []).map((b) => (typeof b === 'string' ? b : b?.name)).filter(Boolean).join(', ')],
      ['Earnest money', money(o.earnest_money)],
      ['Financing', o.financing_type],
      ['Down payment', o.down_payment_percent ? `${o.down_payment_percent}%` : null],
      ['Loan amount', money(o.loan_amount)],
      ['Closing date', o.closing_date],
      ['Inspection period', o.inspection_days ? `${o.inspection_days} days after acceptance` : 'waived'],
      ['Financing contingency', o.financing_type === 'cash' ? 'none (cash)' : o.financing_days ? `${o.financing_days} days after acceptance` : null],
      ['Appraisal contingency', o.appraisal_contingency === false ? 'waived' : 'included'],
      ['Seller concessions', money(o.seller_concessions)],
      ['Included items', o.included_items],
      ['Offer expires', o.offer_expiration],
      ['Special terms', o.special_terms],
      ["Buyer's agent", `${me.full_name || ''} (${me.email})`],
      ['Listing agent', o.listing_agent_name],
    ].filter(([, v]) => v);

    const text = await InvokeLLM({
      max_tokens: 3000,
      system: 'You are an experienced buyer\'s agent writing offers. Plain, precise, professional. You never add terms that were not given and never give legal advice.',
      prompt: `Write a written purchase offer from these terms, for the listing agent and seller to review.
${terms.map(([k, v]) => `- ${k}: ${v}`).join('\n')}

Format:
1. A title line: "Offer to Purchase - <address>"
2. A short, warm opening paragraph to the seller (2-3 sentences) presenting the buyers.
3. "Offer Terms": each term on its own line as "Label: value", only the terms given.
4. "Contingencies": the contingencies in plain language, with their deadlines.
5. A closing sentence with the offer expiration if given.
6. Signature lines at the end, one per buyer, each as:
Buyer: ______________________   Date: __________
followed by a line for the buyer's agent the same way.
Do not use markdown symbols like ** or #. This offer is subject to the state's standard purchase agreement; say so in one sentence.`,
    });
    return Response.json({ offer_text: typeof text === 'string' ? text.trim() : String(text) });
  } catch (error) {
    console.error('aiOfferDraft:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
