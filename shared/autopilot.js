// Deal autopilot: who gets reminded about each deadline, and when. Pure functions shared by the
// server (which sends) and the deal page (which shows what's coming), so they always agree.
//   - The deal team (agent, TC, co-agents): 3 days before, the day before, and the morning after if
//     it's still not marked done. Plus their morning "due today" list.
//   - Other parties with an email on the deal (clients, lender, title, inspector, the other agent):
//     the day before the deadlines that involve them (closing: 3 days and 1 day before).
import { dealDeadlines, todayStr, daysBetween } from './dealTimeline.js';

const lc = (e) => String(e || '').toLowerCase().trim();
export const OPEN = (tx) => !['closed', 'cancelled', 'canceled', 'withdrawn', 'expired', 'draft', 'pre_contract'].includes(String(tx?.status || 'active'));

/** What kind of party a deal contact is, from its role. */
export function partyKind(c) {
  const r = lc(c?.role);
  if (/title|escrow|closing attorney|settlement/.test(r)) return 'title';
  if (/lender|loan|mortgage/.test(r)) return 'lender';
  if (/inspect/.test(r)) return 'inspector';
  if (/apprais/.test(r)) return 'appraiser';
  if (/agent/.test(r)) return 'other_agent';
  if (/attorney|lawyer/.test(r)) return 'attorney';
  if (c?.is_client || /buyer|seller|tenant|landlord/.test(r)) return /buyer|tenant/.test(r) ? 'buyer_client' : /seller|landlord/.test(r) ? 'seller_client' : 'client';
  return 'other';
}

// Which parties each deadline involves.
const ALL_CLIENTS = ['buyer_client', 'seller_client', 'client'];
export const WHO = {
  earnest_money_due_date: ['buyer_client', 'title'],
  inspection_date: [...ALL_CLIENTS, 'inspector'],
  inspection_contingency_date: [...ALL_CLIENTS, 'other_agent'],
  appraisal_date: [...ALL_CLIENTS, 'lender'],
  financing_contingency_date: ['buyer_client', 'client', 'lender', 'other_agent'],
  loan_approval_date: ['buyer_client', 'client', 'lender'],
  title_deadline_date: ['title'],
  final_walkthrough_date: [...ALL_CLIENTS, 'other_agent'],
  closing_date: [...ALL_CLIENTS, 'lender', 'title', 'other_agent', 'attorney'],
};
const TEAM_STEPS = [{ step: 'd3', offset: -3, label: '3 days before' }, { step: 'd1', offset: -1, label: 'the day before' }, { step: 'late', offset: 1, label: 'if not done' }];
const PARTY_STEPS = (field) => (field === 'closing_date' ? [{ step: 'p3', offset: -3, label: '3 days before' }, { step: 'p1', offset: -1, label: 'the day before' }] : [{ step: 'p1', offset: -1, label: 'the day before' }]);

export function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The deal team (agent, TC, co-agents), once each. */
export function teamOf(tx) {
  const out = new Map();
  const add = (email, name, role) => { const e = lc(email); if (e && !out.has(e)) out.set(e, { email: e, name: name || e.split('@')[0], role }); };
  add(tx?.agent_email, tx?.agent_name, 'agent');
  add(tx?.tc_email, tx?.tc_name, 'tc');
  for (const a of tx?.co_agents || []) add(a?.email, a?.name, 'agent');
  return [...out.values()];
}

/** Parties for a deadline (contacts with an email whose role the deadline involves). */
export function partiesFor(field, contacts = []) {
  const kinds = new Set(WHO[field] || []);
  const seen = new Set();
  return contacts.filter((c) => c?.email && /\S+@\S+\.\S+/.test(c.email) && kinds.has(partyKind(c)))
    .filter((c) => { const e = lc(c.email); if (seen.has(e)) return false; seen.add(e); return true; })
    .map((c) => ({ email: lc(c.email), name: c.name || lc(c.email).split('@')[0], kind: partyKind(c), contact_id: c.id }));
}

/** The settings that apply to a deal: on unless turned off; other parties on unless off for the deal or brokerage. */
export function autopilotOf(tx, brokerageDefaults = {}) {
  const a = tx?.autopilot || {};
  return { on: a.on !== false, parties: a.parties !== undefined ? a.parties !== false : brokerageDefaults.parties !== false };
}

/**
 * Every reminder still to come (from today on), in date order:
 * [{ key, send_on, field, label, date, step, when, audience: 'team'|'parties', to: [{email,name,...}] }]
 */
export function planFor(tx, contacts = [], { today = todayStr(), brokerageDefaults = {}, sent = tx?.autopilot_sent || [] } = {}) {
  const cfg = autopilotOf(tx, brokerageDefaults);
  if (!cfg.on || !OPEN(tx)) return [];
  const already = new Set(sent);
  const team = teamOf(tx);
  const out = [];
  for (const d of dealDeadlines(tx, today)) {
    if (d.done || d.field === 'acceptance_date') continue;
    for (const s of TEAM_STEPS) {
      const sendOn = addDays(d.date, s.offset);
      const key = `${d.field}:${d.date}:${s.step}`;
      if (sendOn < today || already.has(key) || !team.length) continue;
      out.push({ key, send_on: sendOn, field: d.field, label: d.label, date: d.date, step: s.step, when: s.label, audience: 'team', to: team });
    }
    if (!cfg.parties) continue;
    const parties = partiesFor(d.field, contacts);
    if (!parties.length) continue;
    for (const s of PARTY_STEPS(d.field)) {
      const sendOn = addDays(d.date, s.offset);
      const key = `${d.field}:${d.date}:${s.step}`;
      if (sendOn < today || already.has(key)) continue;
      out.push({ key, send_on: sendOn, field: d.field, label: d.label, date: d.date, step: s.step, when: s.label, audience: 'parties', to: parties });
    }
  }
  return out.sort((a, b) => a.send_on.localeCompare(b.send_on) || (a.audience === 'team' ? -1 : 1));
}

/** Deadline roles we'd like an email for (to show "add the lender's email" hints). */
export function missingParties(tx, contacts = []) {
  const kinds = new Set(contacts.filter((c) => c?.email).map(partyKind));
  const need = [];
  const open = dealDeadlines(tx).filter((d) => !d.done).map((d) => d.field);
  if (open.some((f) => ['appraisal_date', 'loan_approval_date', 'financing_contingency_date', 'closing_date'].includes(f)) && !kinds.has('lender') && !/cash/i.test(String(tx?.financing_type || ''))) need.push('lender');
  if (open.some((f) => ['title_deadline_date', 'closing_date', 'earnest_money_due_date'].includes(f)) && !kinds.has('title')) need.push('title company');
  if (!['buyer_client', 'seller_client', 'client'].some((k) => kinds.has(k))) need.push('client');
  return need;
}

/** For the morning list: deadlines overdue, due today and in the next 2 days. */
export function dueSoon(tx, today = todayStr()) {
  if (!OPEN(tx)) return [];
  return dealDeadlines(tx, today).filter((d) => !d.done && d.field !== 'acceptance_date' && d.daysLeft <= 2)
    .map((d) => ({ field: d.field, label: d.label, date: d.date, daysLeft: daysBetween(today, d.date) }));
}

// ---------------------------------------------------------------- dates from contract terms
const BASE = { acceptance: 'acceptance_date', offer: 'offer_date', closing: 'closing_date', inspection: 'inspection_date' };
/** Add calendar or business days (business days skip weekends). */
export function addBusinessDays(date, n) {
  let d = date; let left = Math.abs(n); const step = n < 0 ? -1 : 1;
  while (left > 0) { d = addDays(d, step); const wd = new Date(`${d}T12:00:00Z`).getUTCDay(); if (wd !== 0 && wd !== 6) left -= 1; }
  return d;
}
/**
 * Deadlines written as "10 days after acceptance" are worked out here (not left to the AI's maths).
 * terms: [{ field, days, from: 'acceptance'|'offer'|'closing'|'inspection', business_days }]
 * Returns { dates, computed: [fields] }.
 */
export function fillRelativeDates(dates = {}, terms = []) {
  const out = { ...dates }; const computed = [];
  for (let pass = 0; pass < 2; pass += 1) { // a second pass for chains (e.g. off the closing date found in pass one)
    for (const t of terms || []) {
      const base = out[BASE[t?.from]];
      if (!t?.field || !Number.isFinite(Number(t.days)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(base || '').slice(0, 10))) continue;
      const v = t.business_days ? addBusinessDays(String(base).slice(0, 10), Number(t.days)) : addDays(String(base).slice(0, 10), Number(t.days));
      if (out[t.field] !== v) { out[t.field] = v; if (!computed.includes(t.field)) computed.push(t.field); }
    }
  }
  return { dates: out, computed };
}
