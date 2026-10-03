// Deal facts a form box can be tied to ("Populate with"). On a library form the box stays blank and
// fills itself in from whichever deal (or offer) the form is used on.
// Works with a transaction, an offer, or both merged ({ ...deal, ...offer }).

const money = (v) => (v == null || v === '' ? '' : `$${Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 })}`);
const usDate = (d) => { if (!d) return ''; const [y, m, day] = String(d).slice(0, 10).split('-'); return y && m && day ? `${m}/${day}/${y}` : String(d); };
const names = (v, fallback) => {
  if (Array.isArray(v) && v.length) return v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean);
  return String(fallback || '').split(/\s*(?:,|&|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
};
const listOf = (v, fallback) => names(v, fallback).join(', ');
const usDateTime = (d) => { if (!d) return ''; const t = new Date(d); return Number.isNaN(t.getTime()) ? String(d) : t.toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const days = (v) => (v == null || v === '' ? '' : String(v));
const today = () => new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });

export const DEAL_KEYS = [
  { key: 'property_address', group: 'property', label: 'Street address', get: (d) => d.property_address },
  { key: 'city', group: 'property', label: 'City', get: (d) => d.city },
  { key: 'state', group: 'property', label: 'State', get: (d) => d.state },
  { key: 'zip', group: 'property', label: 'ZIP', get: (d) => d.zip },
  { key: 'full_address', group: 'property', label: 'Full address', get: (d) => [d.property_address, d.city, [d.state, d.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
  { key: 'mls_number', group: 'property', label: 'MLS #', get: (d) => d.mls_number },
  { key: 'list_price', group: 'property', label: 'List price', get: (d) => money(d.list_price) },
  { key: 'sale_price', group: 'money', label: 'Price', get: (d) => money(d.offer_price ?? d.sale_price) },
  { key: 'earnest_money', group: 'money', label: 'Earnest money', get: (d) => money(d.earnest_money) },
  { key: 'loan_amount', group: 'money', label: 'Loan amount', get: (d) => money(d.loan_amount) },
  { key: 'down_payment_percent', group: 'money', label: 'Down payment %', get: (d) => (d.down_payment_percent == null || d.down_payment_percent === '' ? '' : `${d.down_payment_percent}%`) },
  { key: 'seller_concessions', group: 'money', label: 'Seller concessions', get: (d) => money(d.seller_concessions) },
  { key: 'financing_type', group: 'terms', label: 'Financing type', get: (d) => (d.financing_type === 'cash' ? 'Cash' : d.financing_type || '') },
  { key: 'inspection_days', group: 'terms', label: 'Inspection days', get: (d) => days(d.inspection_days) },
  { key: 'financing_days', group: 'terms', label: 'Financing days', get: (d) => days(d.financing_days) },
  { key: 'included_items', group: 'terms', label: 'Included items', get: (d) => d.included_items },
  { key: 'special_terms', group: 'terms', label: 'Special terms', get: (d) => d.special_terms },
  { key: 'offer_expiration', group: 'terms', label: 'Offer expires', get: (d) => usDateTime(d.offer_expiration) },
  { key: 'acceptance_date', group: 'dates', label: 'Acceptance date', get: (d) => usDate(d.acceptance_date) },
  { key: 'earnest_money_due', group: 'dates', label: 'Earnest money due', get: (d) => usDate(d.earnest_money_due_date) },
  { key: 'inspection_date', group: 'dates', label: 'Inspection deadline', get: (d) => usDate(d.inspection_contingency_date || d.inspection_date) },
  { key: 'appraisal_date', group: 'dates', label: 'Appraisal deadline', get: (d) => usDate(d.appraisal_date) },
  { key: 'financing_deadline', group: 'dates', label: 'Financing deadline', get: (d) => usDate(d.financing_contingency_date || d.loan_approval_date) },
  { key: 'final_walkthrough', group: 'dates', label: 'Final walk-through', get: (d) => usDate(d.final_walkthrough_date) },
  { key: 'closing_date', group: 'dates', label: 'Closing date', get: (d) => usDate(d.closing_date) },
  { key: 'today', group: 'dates', label: "Today's date", get: () => today() },
  { key: 'buyers', group: 'people', label: 'All buyers', get: (d) => listOf(d.buyers, d.buyer_name) },
  { key: 'buyer_1', group: 'people', label: 'Buyer 1', get: (d) => names(d.buyers, d.buyer_name)[0] || '' },
  { key: 'buyer_2', group: 'people', label: 'Buyer 2', get: (d) => names(d.buyers, d.buyer_name)[1] || '' },
  { key: 'sellers', group: 'people', label: 'All sellers', get: (d) => listOf(d.sellers, d.seller_name) },
  { key: 'seller_1', group: 'people', label: 'Seller 1', get: (d) => names(d.sellers, d.seller_name)[0] || '' },
  { key: 'seller_2', group: 'people', label: 'Seller 2', get: (d) => names(d.sellers, d.seller_name)[1] || '' },
  { key: 'agent_name', group: 'agent', label: 'Agent', get: (d) => d.agent_name },
  { key: 'agent_email', group: 'agent', label: 'Agent email', get: (d) => d.agent_email },
  { key: 'listing_agent_name', group: 'agent', label: 'Listing agent', get: (d) => d.listing_agent_name },
  { key: 'brokerage_name', group: 'agent', label: 'Brokerage', get: (d) => d.brokerage_name },
];

/** "Populate with" groups, in the order they're offered. */
export const DEAL_GROUPS = [
  { id: 'property', label: 'Property' },
  { id: 'money', label: 'Price & money' },
  { id: 'people', label: 'Buyers & sellers' },
  { id: 'dates', label: 'Dates' },
  { id: 'terms', label: 'Terms' },
  { id: 'agent', label: 'Agent & brokerage' },
];

// Facts with a few set answers: a checkbox can tick itself when the fact matches.
export const CHOICE_KEYS = [
  { key: 'financing_type', label: 'Financing', options: ['conventional', 'FHA', 'VA', 'USDA', 'cash', 'other'], get: (d) => d.financing_type || '' },
  { key: 'appraisal_contingency', label: 'Appraisal contingency', options: ['yes', 'no'], get: (d) => (d.appraisal_contingency == null ? '' : d.appraisal_contingency === false ? 'no' : 'yes') },
  { key: 'inspection_contingency', label: 'Inspection contingency', options: ['yes', 'no'], get: (d) => (d.inspection_days == null && !d.inspection_contingency_date ? '' : Number(d.inspection_days) > 0 || d.inspection_contingency_date ? 'yes' : 'no') },
  { key: 'financing_contingency', label: 'Financing contingency', options: ['yes', 'no'], get: (d) => (d.financing_type === 'cash' ? 'no' : d.financing_days == null && !d.financing_contingency_date ? '' : 'yes') },
  { key: 'seller_concessions_any', label: 'Seller concessions', options: ['yes', 'no'], get: (d) => (d.seller_concessions == null || d.seller_concessions === '' ? '' : Number(d.seller_concessions) > 0 ? 'yes' : 'no') },
];

export const dealKeyLabel = (key) => {
  const k = DEAL_KEYS.find((x) => x.key === key);
  return k ? `${DEAL_GROUPS.find((g) => g.id === k.group)?.label || ''} › ${k.label}` : '';
};

/** Facts from the deal that can be dropped onto the document as pre-filled text. */
export function dealFacts(deal) {
  if (!deal) return [];
  return DEAL_KEYS.map((k) => ({ key: k.key, label: k.label, value: String(k.get(deal) || '') })).filter((f) => f.value);
}

/** Fills boxes tied to a deal fact (from a template) with this deal's values. */
export function fillFromDeal(fields, deal) {
  if (!deal) return fields;
  return (fields || []).map((f) => {
    if (f.type === 'checkbox' && f.deal_key && f.deal_equals) {
      const c = CHOICE_KEYS.find((x) => x.key === f.deal_key);
      const v = c ? c.get(deal) : '';
      return v ? { ...f, value: String(v).toLowerCase() === String(f.deal_equals).toLowerCase() ? 'X' : '', sender_fill: true } : f;
    }
    if (!f.deal_key || String(f.value || '').trim()) return f;
    const k = DEAL_KEYS.find((x) => x.key === f.deal_key);
    const v = k ? String(k.get(deal) || '') : '';
    return v ? { ...f, value: v, from_deal: true } : f;
  });
}

/** "$1,234.50" from whatever was typed ("1234.5", "$1,234.50"); other text is left alone. */
export function moneyText(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  const n = Number(s.replace(/[$,\s]/g, ''));
  if (!Number.isFinite(n)) return s;
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;
}
