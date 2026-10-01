// New: AI document scanner. Reads a contract, addendum or disclosure (PDF or photo) and
// returns the deal terms, every key date, and anything that looks incomplete.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { resolveForUser } from '../lib/files.js';

const DATE = { type: ['string', 'null'], description: 'YYYY-MM-DD, or null if not in the document' };

const SCHEMA = {
  type: 'object',
  properties: {
    document_type: { type: 'string', description: 'e.g. Purchase and Sale Agreement, Counter Offer, Addendum, Lead Paint Disclosure' },
    summary: { type: 'string', description: 'Two sentences a busy agent can read in five seconds' },
    property_address: { type: ['string', 'null'] },
    city: { type: ['string', 'null'] },
    state: { type: ['string', 'null'] },
    zip: { type: ['string', 'null'] },
    mls_number: { type: ['string', 'null'] },
    buyers: { type: 'array', items: { type: 'string' } },
    sellers: { type: 'array', items: { type: 'string' } },
    purchase_price: { type: ['number', 'null'] },
    earnest_money: { type: ['number', 'null'] },
    financing_type: { type: ['string', 'null'], description: 'cash, conventional, FHA, VA, USDA, other' },
    loan_amount: { type: ['number', 'null'] },
    seller_concessions: { type: ['number', 'null'] },
    listing_agent: { type: ['string', 'null'] },
    buyer_agent: { type: ['string', 'null'] },
    dates: {
      type: 'object',
      properties: {
        offer_date: DATE,
        acceptance_date: DATE,
        closing_date: DATE,
        inspection_date: DATE,
        inspection_contingency_date: DATE,
        appraisal_date: DATE,
        financing_contingency_date: DATE,
        loan_approval_date: DATE,
        title_deadline_date: DATE,
      },
    },
    contingencies: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      description: 'Anything incomplete or risky: missing signatures or initials, blank required fields, dates that conflict or already passed, missing pages',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          description: { type: 'string' },
          page: { type: ['integer', 'null'] },
        },
        required: ['severity', 'description'],
      },
    },
  },
  required: ['document_type', 'summary', 'buyers', 'sellers', 'dates', 'contingencies', 'issues'],
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { file_url, file_urls } = await req.json();
    const given = (file_urls || [file_url]).filter(Boolean).slice(0, 10);
    if (!given.length) return Response.json({ error: 'Upload a document first' }, { status: 400 });
    // Private files: only ones this person can open, as short-lived links for the AI.
    const urls = await resolveForUser(me, base44.entities, given);

    const today = new Date().toISOString().slice(0, 10);
    const result = await InvokeLLM({
      file_urls: urls,
      response_json_schema: SCHEMA,
      max_tokens: 4000,
      system: 'You are a meticulous real estate transaction coordinator. You extract terms from contracts exactly as written and never guess. If a value is not in the document, return null.',
      prompt: `Today is ${today}. Read the attached real estate document(s) and extract the deal terms.
Rules:
- Return dates as YYYY-MM-DD. If a deadline is written relative to another date (e.g. "10 days after acceptance") and that date is known, calculate it; otherwise return null.
- Money as plain numbers (no $ or commas).
- In "issues", list every signature line, initial box or required blank that appears empty, any date that is before today for an open deadline, and anything that conflicts. Say which page when you can.
- Do not invent parties, prices or dates.`,
    });
    return Response.json({ result });
  } catch (error) {
    console.error('aiScanDocument:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
