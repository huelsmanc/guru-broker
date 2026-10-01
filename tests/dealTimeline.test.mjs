import assert from 'node:assert/strict';
import { dealDeadlines, nextDeadline, dealStage, dealHealth, daysBetween, countdown } from '../shared/dealTimeline.js';

const today = '2026-10-01';
assert.equal(daysBetween('2026-10-01', '2026-10-04'), 3);
assert.equal(daysBetween('2026-10-01', '2026-09-29'), -2);
assert.equal(countdown(0), 'today'); assert.equal(countdown(-3), '3 days late');

const tx = { status: 'active', sale_price: 470000, tc_email: 'tc@x', acceptance_date: '2026-09-20', inspection_date: '2026-09-28', inspection_contingency_date: '2026-10-02', financing_contingency_date: '2026-10-20', closing_date: '2026-11-05', completed_dates: ['inspection_date'] };
const list = dealDeadlines(tx, today);
assert.deepEqual(list.map((d) => d.field), ['acceptance_date', 'inspection_date', 'inspection_contingency_date', 'financing_contingency_date', 'closing_date']);
assert.ok(list[0].done, 'acceptance in the past counts as done');
assert.ok(list[1].done && !list[1].overdue, 'marked done');
assert.ok(list[2].soon && list[2].daysLeft === 1);
assert.equal(nextDeadline(tx, today).field, 'inspection_contingency_date');
assert.equal(dealStage(tx, today), 'inspection');
assert.equal(dealStage({ ...tx, completed_dates: ['inspection_date', 'inspection_contingency_date'] }, today), 'financing');
assert.equal(dealStage({ ...tx, completed_dates: ['inspection_date', 'inspection_contingency_date', 'financing_contingency_date'] }, today), 'clear_to_close');
assert.equal(dealStage({ status: 'active' }, today), 'pre_contract');
assert.equal(dealStage({ ...tx, status: 'closed' }, today), 'closed');

let h = dealHealth(tx, { today });
assert.equal(h.level, 'good'); assert.match(h.reasons[0].text, /Inspection contingency ends tomorrow/);
h = dealHealth({ ...tx, completed_dates: [] }, { today });
assert.equal(h.reasons[0].severity, 'critical'); assert.match(h.reasons[0].text, /Home inspection was due 3 days ago/);
h = dealHealth({ ...tx, closing_date: '2026-10-03', completed_dates: ['inspection_date', 'inspection_contingency_date', 'financing_contingency_date'] },
  { today, checklist: [{ requires_document: true, status: 'open', title: 'CD' }, { status: 'rejected' }] });
assert.equal(h.level, 'risk'); assert.ok(h.reasons.some((r) => /Closing in 2 days with 1 required document/.test(r.text)));
console.log('deal timeline: all checks passed');
