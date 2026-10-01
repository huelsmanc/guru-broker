// AI contract filling: the facts an intake question can be pre-filled from, and how to collect
// them from a deal (transaction) or an offer. The AI tags each question it writes with one of
// these keys (or none), so answers start out filled from whatever the app already knows.

export const FACT_KEYS = {
  property_address: 'Property street address',
  city: 'City / town',
  state: 'State',
  zip: 'ZIP code',
  mls_number: 'MLS number',
  buyers: 'Buyer name(s)',
  sellers: 'Seller name(s)',
  purchase_price: 'Purchase / sale price',
  list_price: 'List price',
  earnest_money: 'Earnest money / deposit',
  down_payment_percent: 'Down payment %',
  loan_amount: 'Loan amount',
  financing_type: 'Financing type (cash, conventional, FHA, VA...)',
  closing_date: 'Closing date',
  inspection_days: 'Inspection period (days)',
  financing_days: 'Financing contingency (days)',
  appraisal_contingency: 'Appraisal contingency (yes/no)',
  offer_expiration: 'Offer expires',
  seller_concessions: 'Seller concessions',
  included_items: 'Items included in the sale',
  special_terms: 'Special terms',
  agent_name: 'Agent name',
  agent_email: 'Agent email',
  agent_phone: 'Agent phone',
  agent_license: 'Agent license number',
  brokerage_name: 'Agent\'s brokerage',
  listing_agent_name: 'Listing agent',
  listing_agent_email: 'Listing agent email',
  title_company: 'Title / closing company',
  inspection_date: 'Inspection deadline',
  financing_date: 'Financing contingency deadline',
  appraisal_date: 'Appraisal deadline',
  today: 'Today\'s date',
};

export const QUESTION_TYPES = ['text', 'textarea', 'money', 'number', 'date', 'yesno', 'choice', 'names'];

const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean).join(', ') : v || '');
const usDate = (d) => { const [y, m, dd] = String(d || '').slice(0, 10).split('-'); return y && m && dd ? `${m}/${dd}/${y}` : ''; };
const moneyText = (v) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}` : ''; };

/** Facts the app already knows, from a deal and/or an offer, keyed by FACT_KEYS. */
export function collectFacts({ deal = null, offer = null, agent = null, brokerageName = '' } = {}) {
  const d = deal || {}; const o = offer || {};
  const [street, ...rest] = String(o.property_address || d.property_address || '').split(',').map((x) => x.trim());
  const restCity = rest[0] || ''; const restStateZip = (rest[1] || '').split(/\s+/);
  const facts = {
    property_address: street || '',
    city: o.city || restCity,
    state: o.state || restStateZip[0] || '',
    zip: o.zip || restStateZip[1] || rest.find((x) => /^\d{5}/.test(x)) || '',
    mls_number: o.mls_number || d.mls_number || '',
    buyers: names(o.buyers) || names(d.buyers) || d.buyer_name || '',
    sellers: names(o.sellers) || names(d.sellers) || d.seller_name || '',
    purchase_price: moneyText(o.offer_price || d.sale_price),
    list_price: moneyText(o.list_price),
    earnest_money: moneyText(o.earnest_money),
    down_payment_percent: o.down_payment_percent != null && o.down_payment_percent !== '' ? `${o.down_payment_percent}%` : '',
    loan_amount: moneyText(o.loan_amount),
    financing_type: o.financing_type || '',
    closing_date: usDate(o.closing_date || d.closing_date),
    inspection_days: o.inspection_days != null && o.inspection_days !== '' ? String(o.inspection_days) : '',
    financing_days: o.financing_days != null && o.financing_days !== '' ? String(o.financing_days) : '',
    appraisal_contingency: o.appraisal_contingency === true ? 'Yes' : o.appraisal_contingency === false ? 'No' : '',
    offer_expiration: o.offer_expiration ? new Date(o.offer_expiration).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '',
    seller_concessions: moneyText(o.seller_concessions),
    included_items: o.included_items || '',
    special_terms: o.special_terms || '',
    agent_name: o.agent_name || d.agent_name || agent?.full_name || '',
    agent_email: o.agent_email || d.agent_email || agent?.email || '',
    agent_phone: agent?.phone || '',
    agent_license: agent?.license_number || (agent?.licenses || [])[0]?.number || '',
    brokerage_name: brokerageName || '',
    listing_agent_name: o.listing_agent_name || '',
    listing_agent_email: o.listing_agent_email || '',
    title_company: d.title_company || '',
    inspection_date: usDate(d.inspection_contingency_date || d.inspection_date),
    financing_date: usDate(d.financing_contingency_date),
    appraisal_date: usDate(d.appraisal_date),
    today: new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }),
  };
  return Object.fromEntries(Object.entries(facts).filter(([, v]) => v !== '' && v != null));
}

export const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    form_summary: { type: 'string', description: 'One sentence: what this form is' },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string', description: 'snake_case id, unique' },
          label: { type: 'string', description: 'Short question for the agent' },
          group: { type: 'string', description: 'Section, e.g. Parties, Property, Price and deposit, Dates, Financing, Contingencies, Inclusions, Other' },
          type: { type: 'string', enum: QUESTION_TYPES },
          options: { type: 'array', items: { type: 'string' }, description: 'For choice: the allowed answers as printed on the form' },
          help: { type: 'string', description: 'Optional hint, e.g. where it goes in the form or the usual answer' },
          source: { type: 'string', enum: [...Object.keys(FACT_KEYS), 'none'], description: 'Which known fact answers this, or none' },
        },
        required: ['key', 'label', 'group', 'type', 'source'],
      },
    },
  },
  required: ['form_summary', 'questions'],
};

export function intakePrompt(name, text) {
  return `You are helping a real estate agent fill in this blank form: "${name}".
Read the form text below and list every piece of information the AGENT must supply to complete it before it goes out for signature.

Rules:
- One question per distinct piece of information (if the same thing appears in several places, like the buyer's name on every page, ask once).
- Skip signatures, initials and "date signed" lines; skip anything the form itself already prints; skip lines for attorneys, notaries or witnesses unless the agent normally fills them.
- Use the form's own wording for checkbox choices (type "choice" with options, or "yesno").
- Use "money" for dollar amounts, "date" for calendar dates, "number" for counts of days, "names" for one or more people's names, "textarea" for long free text.
- Group questions in the order the form asks for them, using short group names.
- Set "source" to the matching known fact when one fits exactly, else "none". Known facts: ${Object.entries(FACT_KEYS).map(([k, v]) => `${k} (${v})`).join('; ')}.
- At most 45 questions. Keep labels short and plain.

FORM TEXT:
${text}`;
}

const toNum = (v) => { const n = Number(String(v ?? '').replace(/[$,%\s]/g, '').replace(/k$/i, '000')); return Number.isFinite(n) && String(v ?? '').trim() !== '' ? n : null; };
const toIsoDate = (v) => {
  const s = String(v || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  const t = Date.parse(s); return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
};
const people = (v) => String(v || '').split(/\s*(?:,|;|\band\b|&)\s*/i).map((x) => x.trim()).filter(Boolean).map((name) => ({ name, email: '' }));

/** The offer record's fields from the intake answers (only questions tied to a known fact). */
export function offerFromAnswers(questions = [], answers = {}) {
  const out = {};
  for (const q of questions) {
    const v = answers[q.key];
    if (v == null || String(v).trim() === '' || !q.source || q.source === 'none') continue;
    switch (q.source) {
      case 'purchase_price': out.offer_price = toNum(v); break;
      case 'list_price': case 'earnest_money': case 'loan_amount': case 'seller_concessions': case 'down_payment_percent': out[q.source] = toNum(v); break;
      case 'inspection_days': case 'financing_days': out[q.source] = toNum(v); break;
      case 'closing_date': out.closing_date = toIsoDate(v); break;
      case 'offer_expiration': { const d = toIsoDate(v); if (d) out.offer_expiration = `${d}T17:00:00`; break; }
      case 'appraisal_contingency': out.appraisal_contingency = /^y/i.test(String(v)); break;
      case 'buyers': case 'sellers': out[q.source] = people(v); break;
      case 'financing_type': out.financing_type = String(v).toLowerCase().includes('cash') ? 'cash' : String(v).toLowerCase().includes('fha') ? 'fha' : String(v).toLowerCase().includes('va') ? 'va' : String(v).toLowerCase().includes('usda') ? 'usda' : 'conventional'; break;
      case 'property_address': case 'city': case 'state': case 'zip': case 'mls_number': case 'included_items': case 'special_terms': case 'listing_agent_name': case 'listing_agent_email':
        out[q.source] = String(v).trim(); break;
      default: break;
    }
  }
  if (out.state) out.state = out.state.toUpperCase().slice(0, 2);
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v != null && v !== ''));
}
