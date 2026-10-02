import { base44 } from '@/api/base44Client';
import { DEADLINES } from '../../shared/dealTimeline.js';
import { supabase } from '@/api/base44Client';
import { dealAppend } from '../../shared/dealAppend.js';

// Small, safe changes to a deal, used by the dashboard, the AI copilot and document intake.
// Each one is the person's own action (their access rules apply) and is noted on the deal.

const labelOf = (field) => (field === 'sale_price' ? 'Sale price' : DEADLINES.find((d) => d.field === field)?.label || field);
const fmt = (field, v) => {
  if (v == null || v === '') return 'blank';
  if (field === 'sale_price') return `$${Number(v).toLocaleString('en-US')}`;
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : String(v);
};

/** Adds a line to the deal's update feed. */
export async function postUpdate(tx, user, message, extra = {}) {
  const update = { id: Date.now().toString(), message: String(message).slice(0, 2000), posted_by: user?.full_name || user?.email, posted_at: new Date().toISOString(), ...extra };
  await dealAppend(supabase, tx.id, 'updates', update);
  return base44.entities.Transaction.get(tx.id);
}

/** Changes a date (or the price) and notes what changed and why. */
export async function changeField(tx, user, field, value, reason) {
  const allowed = new Set([...DEADLINES.map((d) => d.field), 'sale_price']);
  if (!allowed.has(field)) throw new Error('That field can\'t be changed here');
  const fresh = await base44.entities.Transaction.get(tx.id);
  const before = fresh[field];
  const v = field === 'sale_price' ? Number(value) : String(value || '').slice(0, 10) || null;
  const done = (fresh.completed_dates || []).filter((f) => f !== field); // a moved deadline isn't done yet
  await base44.entities.Transaction.update(tx.id, { [field]: v, ...(field === 'sale_price' ? {} : { completed_dates: done }) });
  await postUpdate(fresh, user, `${labelOf(field)} changed from ${fmt(field, before)} to ${fmt(field, v)}${reason ? ` (${reason})` : ''}.`, { milestone: 'Date change' }).catch(() => {});
}

/** Marks a deadline done (or not done). */
export async function setDeadlineDone(tx, field, done = true) {
  const fresh = await base44.entities.Transaction.get(tx.id);
  const list = new Set(fresh.completed_dates || []);
  if (done) list.add(field); else list.delete(field);
  return base44.entities.Transaction.update(tx.id, { completed_dates: [...list] });
}

/** Adds a task to the deal's first checklist. */
export async function addTask(tx, { title, due_date }) {
  const [cl] = await base44.entities.Checklist.filter({ subject_type: 'transaction', subject_id: tx.id }, 'created_date', 1);
  if (!cl) throw new Error('Add a checklist to this deal first (Checklists tab).');
  return base44.functions.invoke('checklistAction', { action: 'add_item', checklist_id: cl.id, title, due_date: due_date || null, requires_document: false });
}

/** Files a document onto a checklist item and takes it out of Unsorted. */
export async function fileDocument(tx, { checklist_id, item_id, url, name }) {
  await base44.functions.invoke('checklistAction', { action: 'attach', checklist_id, item_id, url, name });
  const fresh = await base44.entities.Transaction.get(tx.id);
  const docs = (fresh.documents || []).filter((d) => d.url !== url);
  if (docs.length !== (fresh.documents || []).length) await base44.entities.Transaction.update(tx.id, { documents: docs });
}
