// New: everything an agent (or broker) needs today, in one call, using the caller's own
// access rules: cap progress, pending commissions, upcoming deadlines, documents to upload
// or fix, checklist tasks due, offers in play, and (for admins) what's waiting on them.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { agentContext, calculateForTransaction } from '../lib/backoffice.js';

const lc = (e) => String(e || '').toLowerCase();
const DATES = [['inspection_contingency_date', 'Inspection contingency'], ['appraisal_date', 'Appraisal'], ['financing_contingency_date', 'Financing contingency'],
  ['loan_approval_date', 'Loan approval'], ['title_deadline_date', 'Title'], ['inspection_date', 'Inspection'], ['closing_date', 'Closing']];

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const my = lc(me.email);
    const E = base44.entities; // caller's access
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const admin = isAdminRole(me.role);

    const txs = (await E.Transaction.filter({ brokerage_id: me.brokerage_id, status: { $in: ['active', 'pending', 'clear_to_close'] } }, 'closing_date', 500))
      .filter((t) => lc(t.agent_email) === my || lc(t.tc_email) === my || (t.co_agents || []).some((a) => lc(a.email) === my));

    // Deadlines in the next 14 days (and overdue ones not marked done).
    const deadlines = [];
    for (const t of txs) {
      for (const [k, label] of DATES) {
        const d = t[k];
        if (!d || (t.completed_dates || {})[k]) continue;
        if (d <= in14) deadlines.push({ transaction_id: t.id, property: t.property_address, label, date: d, overdue: d < today });
      }
    }
    deadlines.sort((a, b) => a.date.localeCompare(b.date));

    // Checklist work assigned to me.
    const lists = txs.length ? await E.Checklist.filter({ subject_type: 'transaction', subject_id: { $in: txs.map((t) => t.id) } }, 'created_date', 1000) : [];
    const onboarding = await E.Checklist.filter({ subject_type: 'onboarding', subject_email: my }, 'created_date', 20).catch(() => []);
    const txName = new Map(txs.map((t) => [t.id, t.property_address]));
    const todo = [];
    for (const cl of [...lists, ...onboarding]) {
      for (const it of cl.items || []) {
        if (lc(it.assignee_email) !== my && !(cl.subject_type === 'transaction' && lc(cl.subject_email) === my && !it.assignee_email)) continue;
        if (['approved', 'exempt', 'done', 'review_requested'].includes(it.status)) continue;
        if (it.required === false && it.status === 'open') continue;
        todo.push({ checklist_id: cl.id, item_id: it.id, title: it.title, status: it.status, needs_document: !!it.requires_document, due: it.due_date || null,
          where: cl.subject_type === 'transaction' ? txName.get(cl.subject_id) : 'Onboarding', link: cl.subject_type === 'transaction' ? `/Transactions/${cl.subject_id}?tab=checklists&checklist=${cl.id}&item=${it.id}` : '/Profile#onboarding' });
      }
    }
    const rank = (x) => (x.status === 'rejected' ? 0 : x.due && x.due < today ? 1 : x.due === today ? 2 : x.due ? 3 : 4);
    todo.sort((a, b) => rank(a) - rank(b) || String(a.due || '9').localeCompare(String(b.due || '9')));

    // Money: pending (open deals with a saved commission or an estimate) and cap progress.
    // Estimated with my real plan, cap position and splits (same math as the Finances tab).
    let pending = 0;
    for (const t of txs.filter((x) => lc(x.agent_email) === my || (x.co_agents || []).some((a) => lc(a.email) === my)).slice(0, 40)) {
      try {
        const { result } = await calculateForTransaction(base44.asServiceRole.entities, t);
        const mine = (result?.agents || []).find((a) => lc(a.email) === my);
        if (mine) pending += Number(mine.agent_net) || 0;
      } catch { /* deal without commission details yet */ }
    }
    let cap = null;
    try {
      const ctx = await agentContext(base44.asServiceRole.entities, my, { brokerageId: me.brokerage_id });
      const amount = Number(ctx.plan.config?.cap?.amount) || null;
      cap = { plan: ctx.plan.name, amount, paid: ctx.ytd.company_dollar, gci: ctx.ytd.gci, year_start: ctx.cap_year_start, pct: amount ? Math.min(100, Math.round((ctx.ytd.company_dollar / amount) * 100)) : null };
    } catch { /* no plan */ }

    const offers = (await E.Offer.filter({ agent_email: my, status: { $in: ['draft', 'review_requested', 'sent', 'countered'] } }, '-updated_date', 20).catch(() => []))
      .map((o) => ({ id: o.id, property: o.property_address, status: o.status, review: o.review_status || null, price: o.offer_price }));

    const out = {
      name: me.display_name || me.full_name, deals: txs.length, closing_this_month: txs.filter((t) => t.closing_date && t.closing_date.slice(0, 7) === today.slice(0, 7)).length,
      deadlines: deadlines.slice(0, 12), todo: todo.slice(0, 80), todo_count: todo.length, pending_net: Math.round(pending * 100) / 100, cap, offers,
    };

    if (admin || can(me, 'docs.approve') || can(me, 'accounting.access')) {
      const S = base44.asServiceRole.entities;
      const waiting = {};
      if (admin || can(me, 'docs.approve')) {
        const review = await S.Checklist.filter({ brokerage_id: me.brokerage_id, status: 'review' }, '-updated_date', 500);
        waiting.docs = review.reduce((n, cl) => n + (cl.items || []).filter((i) => i.status === 'review_requested').length, 0);
      }
      if (admin || can(me, 'accounting.access')) waiting.payouts = (await S.Payout.filter({ brokerage_id: me.brokerage_id, status: 'pending_approval' }, '-created_date', 500)).length;
      if (admin) {
        waiting.offer_reviews = (await S.Offer.filter({ brokerage_id: me.brokerage_id, review_status: 'requested' }, '-created_date', 200)).length;
        const soon = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
        waiting.licenses = (await S.User.filter({ brokerage_id: me.brokerage_id }, 'full_name', 5000)).filter((u) => !u.suspended && ((u.license_expiration && u.license_expiration <= soon) || (u.eo_expiration && u.eo_expiration <= soon))).length;
      }
      out.waiting = waiting;
    }
    return Response.json(out);
  } catch (error) {
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
