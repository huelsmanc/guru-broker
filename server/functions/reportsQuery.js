// New: admin reports. Every report returns { columns, rows, summary } so the Reports page
// can show a table, totals and a CSV download the same way for all of them.
import { doneFields } from '../../shared/dealTimeline.js';
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { agentContext } from '../lib/backoffice.js';

const n = (v) => Number(v) || 0;
const sum = (rows, k) => Math.round(rows.reduce((s, r) => s + n(r[k]), 0) * 100) / 100;
const inRange = (d, from, to) => d && (!from || d >= from) && (!to || d <= to);

export const REPORTS = {
  closed_sales: 'Closed sales',
  commissions: 'Commissions by deal',
  agent_production: 'Agent production',
  cap_status: 'Cap status',
  payouts: 'Payouts',
  pipeline: 'Open transactions and deadlines',
  offers: 'Offers',
  esign: 'E-sign requests',
  licenses: 'License and E&O expirations',
  activity: 'Platform activity',
  support_chats: 'Support chats (Ask the broker)',
};

async function run(entities, brokerageId, { report, from, to, agent, status }) {
  const E = entities;
  const agentOk = (email) => !agent || String(email || '').toLowerCase() === agent.toLowerCase();

  if (report === 'closed_sales') {
    const txs = (await E.Transaction.filter({ brokerage_id: brokerageId, status: 'closed' }, '-closing_date', 5000))
      .filter((t) => inRange(t.closed_date || t.closing_date, from, to) && agentOk(t.agent_email));
    const recs = await E.CommissionRecord.filter({ brokerage_id: brokerageId, status: { $in: ['approved', 'paid'] } }, '-closed_date', 10000);
    const byTx = new Map();
    for (const r of recs) { const x = byTx.get(r.transaction_id) || { cd: 0, net: 0 }; x.cd += n(r.company_dollar); x.net += n(r.agent_net); byTx.set(r.transaction_id, x); }
    const rows = txs.map((t) => ({
      closed: t.closed_date || t.closing_date, property: t.property_address, agent: t.agent_name || t.agent_email,
      price: n(t.sale_price), gross: n(t.commission_calc?.gross ?? t.commission_amount),
      company_dollar: byTx.get(t.id)?.cd ?? 0, agent_net: byTx.get(t.id)?.net ?? 0,
    }));
    return {
      columns: [['closed', 'Closed', 'date'], ['property', 'Property'], ['agent', 'Agent'], ['price', 'Sale price', 'money'], ['gross', 'Gross commission', 'money'], ['company_dollar', 'Company dollar', 'money'], ['agent_net', 'Agent net', 'money']],
      rows,
      summary: { Deals: rows.length, Volume: sum(rows, 'price'), 'Gross commission': sum(rows, 'gross'), 'Company dollar': sum(rows, 'company_dollar') },
    };
  }

  if (report === 'commissions' || report === 'agent_production') {
    const recs = (await E.CommissionRecord.filter({ brokerage_id: brokerageId, status: { $in: ['approved', 'paid'] } }, '-closed_date', 10000))
      .filter((r) => inRange(r.closed_date, from, to) && agentOk(r.agent_email));
    if (report === 'commissions') {
      const rows = recs.map((r) => ({ closed: r.closed_date, property: r.property_address, agent: r.agent_name, plan: r.calc?.plan?.name || '', share: n(r.gross_share), company_dollar: n(r.company_dollar), fees: n(r.fees), team_lead: n(r.team_lead), revshare: n(r.revshare_total), agent_net: n(r.agent_net) }));
      return {
        columns: [['closed', 'Closed', 'date'], ['property', 'Property'], ['agent', 'Agent'], ['plan', 'Plan'], ['share', 'GCI', 'money'], ['company_dollar', 'Company dollar', 'money'], ['fees', 'Fees', 'money'], ['team_lead', 'Team lead', 'money'], ['revshare', 'Revenue share', 'money'], ['agent_net', 'Agent net', 'money']],
        rows,
        summary: { Records: rows.length, GCI: sum(rows, 'share'), 'Company dollar': sum(rows, 'company_dollar'), Fees: sum(rows, 'fees'), 'Agent net': sum(rows, 'agent_net') },
      };
    }
    const by = new Map();
    for (const r of recs) {
      const k = r.agent_email;
      const x = by.get(k) || { agent: r.agent_name || k, email: k, units: 0, volume: 0, gci: 0, company_dollar: 0, agent_net: 0 };
      x.units += n(r.calc?.units_share || 1); x.volume += n(r.calc?.volume_share); x.gci += n(r.gross_share); x.company_dollar += n(r.company_dollar); x.agent_net += n(r.agent_net);
      by.set(k, x);
    }
    const rows = [...by.values()].map((x) => ({ ...x, units: Math.round(x.units * 100) / 100 })).sort((a, b) => b.gci - a.gci);
    return {
      columns: [['agent', 'Agent'], ['units', 'Units', 'number'], ['volume', 'Volume', 'money'], ['gci', 'GCI', 'money'], ['company_dollar', 'Company dollar', 'money'], ['agent_net', 'Agent net', 'money']],
      rows, chart: { label: 'agent', value: 'gci' },
      summary: { Agents: rows.length, Units: sum(rows, 'units'), Volume: sum(rows, 'volume'), GCI: sum(rows, 'gci'), 'Company dollar': sum(rows, 'company_dollar') },
    };
  }

  if (report === 'cap_status') {
    const people = (await E.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000)).filter((u) => !u.suspended && agentOk(u.email));
    const rows = [];
    for (const u of people) {
      const ctx = await agentContext(E, u.email, { brokerageId });
      const cap = n(ctx.plan.config?.cap?.amount);
      if (!ctx.plan.id && !ctx.ytd.gci) continue;
      rows.push({ agent: ctx.name, plan: ctx.plan.name, cap_year_start: ctx.cap_year_start, gci: ctx.ytd.gci, paid: ctx.ytd.company_dollar, cap: cap || null, remaining: cap ? Math.max(0, cap - ctx.ytd.company_dollar) : null, pct: cap ? Math.min(100, Math.round((ctx.ytd.company_dollar / cap) * 100)) : null });
    }
    rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    return {
      columns: [['agent', 'Agent'], ['plan', 'Plan'], ['cap_year_start', 'Cap year began', 'date'], ['gci', 'GCI this cap year', 'money'], ['paid', 'Paid toward cap', 'money'], ['cap', 'Cap', 'money'], ['remaining', 'Remaining', 'money'], ['pct', '% capped', 'number']],
      rows, chart: { label: 'agent', value: 'pct' },
      summary: { Agents: rows.length, Capped: rows.filter((r) => r.pct === 100).length },
    };
  }

  if (report === 'payouts') {
    const q = { brokerage_id: brokerageId };
    if (status) q.status = status;
    const ps = (await E.Payout.filter(q, '-created_date', 10000)).filter((p) => inRange(String(p.created_date).slice(0, 10), from, to) && agentOk(p.payee_email) && p.status !== 'void');
    const rows = ps.map((p) => ({ created: String(p.created_date).slice(0, 10), payee: p.payee_name || p.payee_email, kind: p.kind, memo: p.memo, amount: n(p.amount), status: p.status, method: p.method || '', paid: p.paid_at ? String(p.paid_at).slice(0, 10) : '' }));
    return {
      columns: [['created', 'Created', 'date'], ['payee', 'Payee'], ['kind', 'Type'], ['memo', 'For'], ['amount', 'Amount', 'money'], ['status', 'Status'], ['method', 'Method'], ['paid', 'Paid', 'date']],
      rows,
      summary: { Payouts: rows.length, Total: sum(rows, 'amount'), Paid: sum(rows.filter((r) => r.status === 'paid'), 'amount'), 'Waiting approval': sum(rows.filter((r) => r.status === 'pending_approval'), 'amount') },
    };
  }

  if (report === 'pipeline') {
    const today = new Date().toISOString().slice(0, 10);
    const keys = ['inspection_contingency_date', 'appraisal_date', 'financing_contingency_date', 'loan_approval_date', 'title_deadline_date', 'closing_date'];
    const txs = (await E.Transaction.filter({ brokerage_id: brokerageId, status: { $in: ['active', 'clear_to_close'] } }, 'closing_date', 5000)).filter((t) => agentOk(t.agent_email));
    const rows = txs.map((t) => {
      const next = keys.map((k) => [k, t[k]]).filter(([k, v]) => v && v >= today && !doneFields(t).has(k)).sort((a, b) => a[1].localeCompare(b[1]))[0];
      return { property: t.property_address, agent: t.agent_name || t.agent_email, tc: t.tc_name || '', status: t.status, price: n(t.sale_price), next_deadline: next ? next[0].replace(/_/g, ' ').replace(' date', '') : '', due: next ? next[1] : '', closing: t.closing_date || '' };
    }).sort((a, b) => (a.due || '9').localeCompare(b.due || '9'));
    return {
      columns: [['property', 'Property'], ['agent', 'Agent'], ['tc', 'TC'], ['status', 'Status'], ['price', 'Price', 'money'], ['next_deadline', 'Next deadline'], ['due', 'Due', 'date'], ['closing', 'Closing', 'date']],
      rows, summary: { 'Open deals': rows.length, 'Pending volume': sum(rows, 'price') },
    };
  }

  if (report === 'offers') {
    const os = (await E.Offer.filter({ brokerage_id: brokerageId }, '-created_date', 5000)).filter((o) => inRange(String(o.created_date).slice(0, 10), from, to) && agentOk(o.agent_email) && (!status || o.status === status));
    const rows = os.map((o) => ({ created: String(o.created_date).slice(0, 10), property: o.property_address, agent: o.agent_name, offer: n(o.offer_price), list: n(o.list_price), status: o.status, review: o.review_status || '' }));
    const accepted = rows.filter((r) => r.status === 'accepted').length;
    return {
      columns: [['created', 'Created', 'date'], ['property', 'Property'], ['agent', 'Agent'], ['offer', 'Offer', 'money'], ['list', 'List', 'money'], ['status', 'Status'], ['review', 'Broker review']],
      rows, summary: { Offers: rows.length, Accepted: accepted, 'Win rate %': rows.length ? Math.round((accepted / rows.length) * 100) : 0 },
    };
  }

  if (report === 'esign') {
    const subs = (await E.ESignSubmission.filter({ brokerage_id: brokerageId }, '-created_date', 5000)).filter((s) => inRange(String(s.created_date).slice(0, 10), from, to) && agentOk(s.created_by_email) && (!status || s.status === status));
    const docs = new Map((await E.ESignDocument.filter({ brokerage_id: brokerageId }, '-created_date', 10000)).map((d) => [d.id, d]));
    const rows = subs.map((s) => ({ sent: String(s.submitted_at || s.created_date).slice(0, 10), document: docs.get(s.document_id)?.title || '', sender: s.created_by_name || s.created_by_email, signers: (s.signers || []).map((x) => x.email).join(', '), signed: `${(s.signers || []).filter((x) => x.signed).length}/${(s.signers || []).length}`, status: s.status, completed: s.completed_at ? String(s.completed_at).slice(0, 10) : '' }));
    return {
      columns: [['sent', 'Sent', 'date'], ['document', 'Document'], ['sender', 'Sent by'], ['signers', 'Signers'], ['signed', 'Signed'], ['status', 'Status'], ['completed', 'Completed', 'date']],
      rows, summary: { Requests: rows.length, Completed: rows.filter((r) => r.status === 'completed').length, Waiting: rows.filter((r) => ['pending', 'in_progress'].includes(r.status)).length },
    };
  }

  if (report === 'licenses') {
    const soon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
    const people = (await E.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000)).filter((u) => !u.suspended && agentOk(u.email));
    const rows = [];
    for (const u of people) {
      for (const [k, label] of [['license_expiration', 'License'], ['eo_expiration', 'E&O']]) {
        if (!u[k]) { rows.push({ agent: u.full_name || u.email, item: label, number: k === 'license_expiration' ? u.license_number || '' : '', expires: '', state: 'missing' }); continue; }
        if (u[k] <= soon) rows.push({ agent: u.full_name || u.email, item: label, number: k === 'license_expiration' ? u.license_number || '' : '', expires: u[k], state: u[k] < new Date().toISOString().slice(0, 10) ? 'expired' : 'expiring' });
      }
    }
    return { columns: [['agent', 'Agent'], ['item', 'Item'], ['number', 'Number'], ['expires', 'Expires', 'date'], ['state', 'Status']], rows, summary: { Expired: rows.filter((r) => r.state === 'expired').length, 'Next 90 days': rows.filter((r) => r.state === 'expiring').length, Missing: rows.filter((r) => r.state === 'missing').length } };
  }

  if (report === 'support_chats') {
    // Agent questions to the broker/AI: volume, status, category and how fast someone replied.
    const convs = (await E.Conversation.filter({ brokerage_id: brokerageId }, '-created_date', 5000))
      .filter((c) => inRange(String(c.created_date).slice(0, 10), from, to) && agentOk(c.agent_email) && (!status || c.status === status));
    const ids = new Set(convs.map((c) => c.id));
    const msgs = ids.size ? (await E.Message.filter({ brokerage_id: brokerageId }, 'created_date', 20000)).filter((m) => ids.has(m.conversation_id)) : [];
    const byConv = new Map();
    for (const m of msgs) { if (!byConv.has(m.conversation_id)) byConv.set(m.conversation_id, []); byConv.get(m.conversation_id).push(m); }
    const rows = convs.map((c) => {
      const list = (byConv.get(c.id) || []).sort((a, b) => String(a.created_date).localeCompare(String(b.created_date)));
      const firstAsk = list.find((m) => m.sender_role === 'agent');
      const firstReply = firstAsk && list.find((m) => m.sender_role !== 'agent' && m.created_date > firstAsk.created_date);
      const humanReply = firstAsk && list.find((m) => m.sender_role === 'broker' && m.created_date > firstAsk.created_date);
      const mins = (m) => (m ? Math.max(0, Math.round((new Date(m.created_date) - new Date(firstAsk.created_date)) / 60000)) : null);
      return {
        started: c.created_date, agent: c.agent_name || c.agent_email, title: c.title || c.last_message_preview || '',
        category: String(c.category || 'general').replace(/_/g, ' '), status: c.status || '', handled_by: c.handled_by || '',
        messages: list.length, first_reply: mins(firstReply), broker_reply: mins(humanReply),
      };
    });
    const avg = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null); return v.length ? `${Math.round(v.reduce((a, b) => a + b, 0) / v.length)} min` : '-'; };
    const cats = {};
    for (const r of rows) cats[r.category] = (cats[r.category] || 0) + 1;
    return {
      columns: [['started', 'Started', 'datetime'], ['agent', 'Agent'], ['title', 'Topic'], ['category', 'Category'], ['status', 'Status'], ['handled_by', 'Handled by'], ['messages', 'Messages', 'number'], ['first_reply', 'First reply (min)', 'number'], ['broker_reply', 'Broker reply (min)', 'number']],
      rows,
      summary: { Conversations: rows.length, Resolved: rows.filter((r) => r.status === 'resolved').length, Active: rows.filter((r) => r.status === 'active').length, 'Avg first reply': avg('first_reply'), 'Avg broker reply': avg('broker_reply'), ...(Object.keys(cats).length ? { 'Top category': Object.entries(cats).sort((a, b) => b[1] - a[1])[0][0] } : {}) },
    };
  }

  if (report === 'activity') {
    const q = { brokerage_id: brokerageId };
    if (agent) q.actor_email = agent.toLowerCase();
    const ev = (await E.ActivityEvent.filter(q, '-created_date', 5000)).filter((e) => inRange(String(e.created_date).slice(0, 10), from, to));
    const rows = ev.map((e) => ({ when: e.created_date, who: e.actor_email, action: e.op, what: e.table_name.replace(/_/g, ' '), item: e.summary, fields: (e.changed || []).join(', ') }));
    return { columns: [['when', 'When', 'datetime'], ['who', 'Who'], ['action', 'Action'], ['what', 'Type'], ['item', 'Item'], ['fields', 'Changed']], rows, summary: { Events: rows.length } };
  }
  throw Object.assign(new Error('Unknown report'), { status: 400 });
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!can(me, 'reports.company')) return Response.json({ error: 'Admins only' }, { status: 403 });
    const body = await req.json();
    if (body.list) return Response.json({ reports: REPORTS });
    const out = await run(base44.asServiceRole.entities, me.brokerage_id, body);
    out.columns = out.columns.map(([key, label, type]) => ({ key, label, type: type || 'text' }));
    return Response.json({ title: REPORTS[body.report], ...out });
  } catch (error) {
    console.error('reportsQuery:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
