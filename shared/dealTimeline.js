// Where a deal stands, from its dates and status. Shared by the pipeline board, the deal
// dashboard, reminders and the AI (so they all agree). Pure functions; dates are YYYY-MM-DD.

export const DEADLINES = [
  { field: 'acceptance_date', label: 'Contract accepted', short: 'Accepted', stage: 'under_contract' },
  { field: 'inspection_date', label: 'Home inspection', short: 'Inspection', stage: 'inspection' },
  { field: 'inspection_contingency_date', label: 'Inspection contingency ends', short: 'Inspection contingency', stage: 'inspection' },
  { field: 'appraisal_date', label: 'Appraisal', short: 'Appraisal', stage: 'financing' },
  { field: 'financing_contingency_date', label: 'Financing contingency ends', short: 'Financing contingency', stage: 'financing' },
  { field: 'loan_approval_date', label: 'Loan commitment', short: 'Loan commitment', stage: 'financing' },
  { field: 'title_deadline_date', label: 'Title commitment', short: 'Title', stage: 'title' },
  { field: 'closing_date', label: 'Closing', short: 'Closing', stage: 'closing' },
];

export const STAGES = [
  { key: 'pre_contract', label: 'Pre-contract' },
  { key: 'under_contract', label: 'Under contract' },
  { key: 'inspection', label: 'Inspection' },
  { key: 'financing', label: 'Appraisal & financing' },
  { key: 'title', label: 'Title' },
  { key: 'clear_to_close', label: 'Clear to close' },
  { key: 'closed', label: 'Closed' },
];
export const stageLabel = (key) => STAGES.find((s) => s.key === key)?.label || key;

/** Today's date as YYYY-MM-DD where the brokerage is (US Eastern unless told otherwise). */
export function todayStr(tz = 'America/New_York', now = new Date()) {
  try { return now.toLocaleDateString('en-CA', { timeZone: tz }); } catch { return now.toISOString().slice(0, 10); }
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). Negative when `to` is in the past. */
export function daysBetween(from, to) {
  const a = Date.UTC(...from.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  const b = Date.UTC(...to.split('-').map((n, i) => (i === 1 ? Number(n) - 1 : Number(n))));
  return Math.round((b - a) / 864e5);
}

const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

/**
 * Every deadline on the deal, in date order, with countdowns.
 * [{ field, label, short, stage, date, done, daysLeft, overdue, soon }]
 */
export function dealDeadlines(tx, today = todayStr()) {
  const done = new Set(tx?.completed_dates || []);
  const closed = tx?.status === 'closed';
  return DEADLINES
    .filter((d) => isDate(tx?.[d.field]))
    .map((d) => {
      const date = String(tx[d.field]).slice(0, 10);
      const isDone = closed || done.has(d.field) || (d.field === 'acceptance_date' && date <= today);
      const daysLeft = daysBetween(today, date);
      return { ...d, date, done: isDone, daysLeft, overdue: !isDone && daysLeft < 0, soon: !isDone && daysLeft >= 0 && daysLeft <= 3 };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The next deadline that isn't done (or null). */
export function nextDeadline(tx, today = todayStr()) {
  return dealDeadlines(tx, today).find((d) => !d.done) || null;
}

/** Which stage the deal is in. */
export function dealStage(tx, today = todayStr()) {
  if (!tx) return 'pre_contract';
  if (tx.status === 'closed') return 'closed';
  if (tx.status === 'clear_to_close') return 'clear_to_close';
  const list = dealDeadlines(tx, today);
  if (!isDate(tx.acceptance_date) && !list.length) return 'pre_contract';
  const open = list.filter((d) => !d.done && d.field !== 'acceptance_date');
  if (!open.length) return isDate(tx.closing_date) ? 'clear_to_close' : 'under_contract';
  const first = open[0].stage;
  return first === 'closing' ? 'clear_to_close' : first;
}

/** "in 3 days", "today", "2 days late" */
export function countdown(daysLeft) {
  if (daysLeft === 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  if (daysLeft === -1) return '1 day late';
  if (daysLeft < 0) return `${-daysLeft} days late`;
  return `in ${daysLeft} days`;
}

/**
 * How healthy the deal is, 0-100, with the reasons (worst first).
 * checklist: the deal's checklist items (optional).
 */
export function dealHealth(tx, { checklist = [], today = todayStr() } = {}) {
  const reasons = [];
  if (['closed', 'cancelled'].includes(tx?.status)) return { score: 100, level: 'good', reasons };
  const list = dealDeadlines(tx, today);
  for (const d of list) {
    if (d.overdue) reasons.push({ severity: 'critical', text: `${d.label} was due ${countdown(d.daysLeft).replace(' late', '')} ago`, field: d.field });
    else if (d.soon) reasons.push({ severity: 'warning', text: `${d.label} ${countdown(d.daysLeft)}`, field: d.field });
  }
  const items = checklist || [];
  const rejected = items.filter((i) => i.status === 'rejected');
  if (rejected.length) reasons.push({ severity: 'critical', text: `${rejected.length} document${rejected.length === 1 ? '' : 's'} sent back by the broker` });
  const lateItems = items.filter((i) => i.due_date && !['approved', 'exempt', 'done'].includes(i.status) && i.due_date < today);
  if (lateItems.length) reasons.push({ severity: 'warning', text: `${lateItems.length} checklist item${lateItems.length === 1 ? '' : 's'} past due` });
  const closing = list.find((d) => d.field === 'closing_date');
  if (closing && !closing.done && closing.daysLeft <= 7) {
    const openDocs = items.filter((i) => i.requires_document && i.required !== false && !['approved', 'exempt'].includes(i.status));
    if (openDocs.length) reasons.push({ severity: closing.daysLeft <= 3 ? 'critical' : 'warning', text: `Closing ${countdown(closing.daysLeft)} with ${openDocs.length} required document${openDocs.length === 1 ? '' : 's'} not approved` });
  }
  if (!isDate(tx?.closing_date)) reasons.push({ severity: 'info', text: 'No closing date yet' });
  if (!tx?.sale_price) reasons.push({ severity: 'info', text: 'No sale price yet' });
  if (!tx?.tc_email && tx?.status !== 'pre_contract') reasons.push({ severity: 'info', text: 'No transaction coordinator' });
  const weight = { critical: 30, warning: 12, info: 3 };
  const score = Math.max(0, 100 - reasons.reduce((s, r) => s + weight[r.severity], 0));
  const rank = { critical: 0, warning: 1, info: 2 };
  reasons.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { score, level: score >= 80 ? 'good' : score >= 55 ? 'watch' : 'risk', reasons };
}
