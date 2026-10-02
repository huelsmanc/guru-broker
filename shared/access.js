// Access levels, mirrored from the database rules in supabase/migrations/0015_access_levels.sql.
// The database is what actually decides who sees a deal; these helpers are for the screens
// (which buttons to show) and for picking who to notify.
import { can, isAdminRole, normalizeRole } from './permissions.generated.js';

export const US_STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'PR', 'VI', 'GU'];
const KNOWN = new Set(US_STATES);

/** "12 Elm St, Austin, TX 78701" → "TX" (same rules as public.state_from_address). */
export function stateFromAddress(addr) {
  const a = String(addr || '');
  const s = (a.match(/,\s*([a-z]{2})\.?[\s,]+\d{5}/i)?.[1]
    || a.match(/\s([A-Z]{2})\s+\d{5}(-\d{4})?\s*$/)?.[1]
    || a.match(/,\s*([a-z]{2})\.?\s*(,\s*(usa?|united states))?\s*$/i)?.[1] || '').toUpperCase();
  return KNOWN.has(s) ? s : null;
}

export const isStateBroker = (u) => !!u && normalizeRole(u.role) === 'state_broker';
const statesOf = (list) => (Array.isArray(list) ? list : []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean);
export const managedStates = (u) => (isStateBroker(u) ? statesOf(u.managed_states) : []);
export const licenseStates = (p) => statesOf([p?.license_state, ...(Array.isArray(p?.licenses) ? p.licenses.map((l) => l?.state) : [])]);

/** TC role (or "see all deals" permission), or a TC / compliance duty: reviews every deal. */
export const reviewsAllDeals = (u) => !!u && (can(u, 'tx.all') || (u.duties || []).some((d) => d === 'tc' || d === 'compliance'));

/** Is this deal in the state broker's states (property state, or the agent's license states)? */
export function oversees(u, tx, agentProfile) {
  const mine = managedStates(u);
  if (!mine.length || !tx) return false;
  const st = tx.property_state || stateFromAddress(tx.property_address);
  if (st && mine.includes(st)) return true;
  return licenseStates(agentProfile).some((s) => mine.includes(s));
}

/** May approve or reject items on a deal's checklist (the person can already see the deal). */
export const approvesDealItems = (u) => !!u && (isAdminRole(u.role) || u.role === 'super_admin' || can(u, 'docs.approve') || reviewsAllDeals(u) || isStateBroker(u));
