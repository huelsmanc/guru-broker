// New: AI offer coach. Looks at the listing (from the synced MLS), recent comparable sales
// and the buyer's situation, and suggests a price range and terms that make the offer
// stronger. Advice for the agent only; nothing is sent anywhere.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { findSubject, findComps, compSummary } from '../lib/comps.js';

const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence: the recommendation' },
    suggested_price: { type: ['number', 'null'] },
    price_low: { type: ['number', 'null'] },
    price_high: { type: ['number', 'null'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    market_read: { type: 'string', description: 'How hot this listing/market looks, 1-2 sentences' },
    reasons: { type: 'array', items: { type: 'string' }, description: 'Why this price, citing comps or listing facts' },
    term_tips: { type: 'array', items: { type: 'string' }, description: 'Terms that would strengthen the offer without overpaying' },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'confidence', 'market_read', 'reasons', 'term_tips', 'risks'],
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const o = await req.json();
    if (!o.property_address && !o.mls_number) return Response.json({ error: 'Add the address or MLS number first' }, { status: 400 });

    const subject = await findSubject({ address: o.property_address, mls_number: o.mls_number }).catch(() => null);
    const comps = (await findComps({ subject: subject || {}, zip: o.zip || subject?.zip, city: o.city || subject?.city, months: 6, limit: 15 }).catch(() => [])).map(compSummary);
    const listing = subject ? {
      list_price: subject.list_price, original_list_price: subject.original_list_price, days_on_market: subject.days_on_market,
      status: subject.status, beds: subject.beds, baths: subject.baths_total, sqft: subject.living_area, year_built: subject.year_built,
      list_date: subject.list_date, remarks: String(subject.public_remarks || '').slice(0, 600),
    } : null;

    const result = await InvokeLLM({
      max_tokens: 2000,
      response_json_schema: SCHEMA,
      system: 'You are a seasoned buyer\'s agent and pricing analyst. Be specific and grounded in the data given; if the data is thin, say so and lower your confidence. Never invent comps. This is advice for the agent, not legal or financial advice.',
      prompt: `Suggest an offer strategy.
Property: ${[o.property_address, o.city, o.state, o.zip].filter(Boolean).join(', ')}${o.mls_number ? ` (MLS ${o.mls_number})` : ''}
Listing: ${JSON.stringify(listing || { list_price: o.list_price ?? null, note: 'not in synced MLS data' })}
Buyer: financing ${o.financing_type || 'unknown'}${o.down_payment_percent ? `, ${o.down_payment_percent}% down` : ''}${o.max_price ? `, max budget ${o.max_price}` : ''}${o.notes ? `. Notes: ${String(o.notes).slice(0, 500)}` : ''}
Current draft terms: ${JSON.stringify({ offer_price: o.offer_price, earnest_money: o.earnest_money, inspection_days: o.inspection_days, financing_days: o.financing_days, closing_date: o.closing_date, seller_concessions: o.seller_concessions, appraisal_contingency: o.appraisal_contingency })}
Recent comparable sales (${comps.length}): ${JSON.stringify(comps.map(({ photoUrl, remarks, id, ...c }) => c)).slice(0, 7000)}`,
    });
    return Response.json({ strategy: result, comps: comps.slice(0, 8), listing });
  } catch (error) {
    console.error('aiOfferStrategy:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
