// New: writes the words and picks the look for a flyer or social post. The design itself is
// a real template filled with exact data (price, address, agent, logo), so nothing the AI
// writes can misspell a name or warp a logo. Also handles "make it shorter / more modern".
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';

const TEMPLATES = ['hero', 'grid', 'luxury', 'bold', 'minimal'];
const SCHEMA = {
  type: 'object',
  properties: {
    template: { type: 'string', enum: TEMPLATES, description: 'Layout that best fits the request and style' },
    palette: {
      type: 'object',
      properties: { primary: { type: 'string', description: 'hex' }, accent: { type: 'string', description: 'hex' }, background: { type: 'string', description: 'hex' }, text: { type: 'string', description: 'hex' } },
      required: ['primary', 'accent', 'background', 'text'],
    },
    ribbon: { type: 'string', description: 'Short status label, e.g. JUST LISTED, OPEN HOUSE, JUST SOLD (max 3 words)' },
    headline: { type: 'string', description: 'Max 8 words' },
    subheadline: { type: ['string', 'null'], description: 'Max 14 words' },
    body: { type: 'string', description: 'Max 60 words, warm and specific, no claims not supported by the facts' },
    bullets: { type: 'array', items: { type: 'string' }, description: 'Up to 5 short feature highlights from the facts' },
    event_line: { type: ['string', 'null'], description: 'Open house or event date/time line if given' },
    cta: { type: 'string', description: 'Call to action, max 6 words' },
    social_caption: { type: 'string', description: 'Caption for Instagram/Facebook, max 70 words, a few emojis ok' },
    hashtags: { type: 'array', items: { type: 'string' }, description: 'Up to 8 relevant hashtags without #' },
    email_subject: { type: 'string' },
    image_idea: { type: ['string', 'null'], description: 'If no photos fit (agent intro, recruiting, holiday), a one-sentence description for a background illustration with no text in it' },
  },
  required: ['template', 'palette', 'ribbon', 'headline', 'body', 'bullets', 'cta', 'social_caption', 'hashtags', 'email_subject'],
};

// Prices may be typed as "450,000", "$450,000" or "450k".
const money = (n) => {
  const m = String(n ?? '').trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return null;
  const v = Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  return v > 0 ? `$${Math.round(v).toLocaleString('en-US')}` : null;
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { kind = 'just_listed', prompt = '', style = '', listing = {}, previous, instruction, brandColor } = await req.json();
    const facts = [
      ['Address', [listing.street_address, listing.unit && `Unit ${listing.unit}`, listing.city, listing.state, listing.zip].filter(Boolean).join(', ')],
      ['Price', money(listing.price || listing.list_price || listing.close_price)],
      ['Beds', listing.beds], ['Baths', listing.baths_total], ['Square feet', listing.living_area && Number(listing.living_area).toLocaleString('en-US')],
      ['Lot (acres)', listing.lot_size_acres], ['Year built', listing.year_built], ['Garage', listing.garage_spaces],
      ['MLS remarks', listing.public_remarks && String(listing.public_remarks).slice(0, 1500)],
    ].filter(([, v]) => v != null && v !== '');
    const agent = me.display_name || me.full_name;
    const ask = previous
      ? `Here is the current design content as JSON:\n${JSON.stringify(previous).slice(0, 6000)}\n\nChange it as requested: "${String(instruction || '').slice(0, 500)}". Keep everything else the same unless the request implies otherwise. Return the full updated content.`
      : `Create ${kind.replace(/_/g, ' ')} marketing for ${agent}.
What they want: "${String(prompt).slice(0, 1500)}"
Style: ${style || 'pick what fits'}${brandColor ? `\nAgent brand color: ${brandColor} (use it as the primary color unless the style clearly needs something else)` : ''}
Property facts (use only these, never invent features, prices or numbers):
${facts.map(([k, v]) => `- ${k}: ${v}`).join('\n') || '- (no property; this is about the agent or brokerage)'}`;
    const result = await InvokeLLM({
      max_tokens: 2000,
      response_json_schema: SCHEMA,
      system: `You are a real estate marketing designer and copywriter. You write punchy, specific, honest copy. Follow the US Fair Housing Act and NAR advertising rules: describe the property, never the people (no references to race, color, religion, sex, disability, familial status, national origin, or phrases like "perfect for families", "walking distance" is fine, "exclusive neighborhood" is not). No superlatives you can't back up. Colors must have strong contrast between text and background.`,
      prompt: ask,
    });
    if (!TEMPLATES.includes(result.template)) result.template = 'hero';
    result.bullets = (result.bullets || []).slice(0, 5);
    result.hashtags = (result.hashtags || []).map((h) => String(h).replace(/^#/, '')).slice(0, 8);
    return Response.json({ content: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
