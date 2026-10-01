// New: the AI on a deal. Everything goes through the caller's own access (if they can't
// open the deal, the AI can't read it). Three modes:
//   { mode: 'brief', transactionId, sig?, refresh? } -> where things stand + next steps
//   { mode: 'chat', transactionId, messages }     -> an answer, plus actions the person can apply
//   { mode: 'intake', transactionId, file_url, name } -> what a new document is, where it files,
//                                                    and any date/price changes it contains
// The AI only suggests; nothing on the deal changes until the person taps Apply.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM } from '../lib/integrations.js';
import { resolveForUser } from '../lib/files.js';
import { DEADLINES, dealDeadlines, dealStage, dealHealth, stageLabel, todayStr, countdown } from '../../shared/dealTimeline.js';

const CHANGEABLE = new Set([...DEADLINES.map((d) => d.field), 'sale_price']);
const tz = () => process.env.APP_TIMEZONE || 'America/New_York';
const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean).join(', ') : v || '');

/** Everything the AI may know about this deal, as compact facts. */
async function dealContext(base44, tx) {
  const E = base44.entities;
  const today = todayStr(tz());
  const [lists, contacts, subs] = await Promise.all([
    E.Checklist.filter({ subject_type: 'transaction', subject_id: tx.id }, 'created_date', 20).catch(() => []),
    E.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 100).catch(() => []),
    E.ESignSubmission.filter({ transaction_id: tx.id }, '-created_date', 30).catch(() => []),
  ]);
  const items = lists.flatMap((l) => (l.items || []).map((i) => ({ ...i, checklist_id: l.id, checklist: l.name })));
  const facts = {
    today,
    property: tx.property_address,
    status: tx.status,
    stage: stageLabel(dealStage(tx, today)),
    deal_type: tx.deal_type || tx.transaction_type || null,
    price: tx.sale_price ?? null,
    buyers: names(tx.buyers) || tx.buyer_name || null,
    sellers: names(tx.sellers) || tx.seller_name || null,
    agent: `${tx.agent_name || ''} <${tx.agent_email || ''}>`,
    tc: tx.tc_email ? `${tx.tc_name || ''} <${tx.tc_email}>` : null,
    title_company: tx.title_company || null,
    deadlines: dealDeadlines(tx, today).map((d) => ({ field: d.field, what: d.label, date: d.date, done: d.done, when: d.done ? 'done' : countdown(d.daysLeft) })),
    health: dealHealth(tx, { checklist: items, today }),
    people: contacts.map((c) => ({ name: c.name, role: c.role, email: c.email || null, phone: c.phone || null, company: c.company || null })),
    checklist: items.slice(0, 80).map((i) => ({ id: i.id, checklist_id: i.checklist_id, title: i.title, status: i.status, due: i.due_date || null, needs_document: !!i.requires_document, has_document: !!i.document_url })),
    unsorted_documents: (tx.documents || []).slice(-15).map((d) => d.name),
    signing: subs.map((s) => ({ status: s.status, signed: (s.signers || []).filter((x) => x.signed).length, of: (s.signers || []).length })),
    recent_updates: (tx.updates || []).slice(-6).map((u) => `${String(u.posted_at || '').slice(0, 10)} ${u.milestone ? `[${u.milestone}] ` : ''}${u.message || ''}`),
  };
  return { facts, items, contacts };
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One sentence: where the deal stands' },
    next_steps: {
      type: 'array',
      items: { type: 'object', properties: { text: { type: 'string' }, who: { type: ['string', 'null'], description: 'agent, TC, buyer, seller, lender, title...' }, due: { type: ['string', 'null'], description: 'YYYY-MM-DD if tied to a date' } }, required: ['text'] },
    },
    risks: { type: 'array', items: { type: 'string' } },
  },
  required: ['headline', 'next_steps', 'risks'],
};

const CHAT_SCHEMA = {
  type: 'object',
  properties: {
    reply: { type: 'string', description: 'The answer, plain and short. Use the deal facts; say when something isn\'t known.' },
    actions: {
      type: 'array',
      description: 'Only when the person asks for something to be done or drafted, or a clear next step follows. Each is applied only if the person taps it.',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['update_date', 'add_task', 'draft_email', 'draft_text', 'log_update', 'mark_done'] },
          label: { type: 'string', description: 'Button text, e.g. "Move closing to 11/20"' },
          field: { type: ['string', 'null'], description: 'update_date / mark_done: one of the deadline fields' },
          date: { type: ['string', 'null'], description: 'update_date: YYYY-MM-DD' },
          title: { type: ['string', 'null'], description: 'add_task: task title' },
          due_date: { type: ['string', 'null'] },
          to_name: { type: ['string', 'null'] },
          to: { type: ['string', 'null'], description: 'draft_email: email address; draft_text: phone number' },
          subject: { type: ['string', 'null'] },
          body: { type: ['string', 'null'], description: 'draft_email / draft_text / log_update text' },
        },
        required: ['type', 'label'],
      },
    },
  },
  required: ['reply', 'actions'],
};

const INTAKE_SCHEMA = {
  type: 'object',
  properties: {
    document_type: { type: 'string' },
    summary: { type: 'string', description: 'One or two sentences' },
    checklist_item_id: { type: ['string', 'null'], description: 'The id of the open checklist item this document satisfies, or null' },
    changes: {
      type: 'array',
      description: 'Only dates or price this document sets or changes compared with the deal (e.g. an addendum moving closing)',
      items: { type: 'object', properties: { field: { type: 'string' }, to: { type: ['string', 'number'] }, reason: { type: 'string' } }, required: ['field', 'to', 'reason'] },
    },
    issues: { type: 'array', items: { type: 'string' }, description: 'Missing signatures/initials, blanks, conflicts' },
  },
  required: ['document_type', 'summary', 'changes', 'issues'],
};

function signature(facts) {
  const { health, ...rest } = facts;
  const str = JSON.stringify(rest);
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return String(h);
}

const SYSTEM = 'You are the transaction coordinator assistant inside a real estate brokerage app. You know only the deal facts given. Be accurate, brief and practical; never invent dates, amounts, names or emails. Dates as MM/DD/YYYY in prose, YYYY-MM-DD in fields. Not legal advice.';

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json();
    const tx = await base44.entities.Transaction.get(body.transactionId).catch(() => null); // the caller's own access
    if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });
    const { facts, items } = await dealContext(base44, tx);

    if (body.mode === 'brief') {
      // The browser keeps the last brief; when nothing on the deal has changed (same day,
      // same dates, checklist, signing...) it's reused instead of asking the AI again.
      const sig = signature(facts);
      if (!body.refresh && body.sig === sig) return Response.json({ unchanged: true, sig, health: facts.health });
      const r = await InvokeLLM({
        max_tokens: 1200, system: SYSTEM, response_json_schema: BRIEF_SCHEMA,
        prompt: `Give the agent a quick status brief for this deal: one headline, then 2-5 concrete next steps (most urgent first, who does it, and the date if there is one), then real risks only.\nDeal: ${JSON.stringify(facts)}`,
      });
      const brief = { headline: String(r?.headline || '').slice(0, 300), next_steps: (r?.next_steps || []).slice(0, 6), risks: (r?.risks || []).slice(0, 5), at: new Date().toISOString() };
      return Response.json({ brief, sig, health: facts.health });
    }

    if (body.mode === 'chat') {
      const messages = (Array.isArray(body.messages) ? body.messages : []).slice(-12)
        .map((m) => `${m.role === 'assistant' ? 'Assistant' : (me.full_name || 'Agent')}: ${String(m.content || '').slice(0, 2000)}`).join('\n');
      if (!messages) return Response.json({ error: 'Ask something' }, { status: 400 });
      const r = await InvokeLLM({
        max_tokens: 1800, system: SYSTEM, response_json_schema: CHAT_SCHEMA,
        prompt: `You're helping ${me.full_name || 'the agent'} (${me.email}) with this deal.
Deadline fields you may reference: ${DEADLINES.map((d) => `${d.field} (${d.label})`).join(', ')}.
For drafts, write in the agent's voice, signed with their name, no placeholders like [Name]; use people's real emails/phones from the facts or leave "to" empty.
Deal facts: ${JSON.stringify(facts)}

Conversation:
${messages}`,
      });
      const actions = (r?.actions || []).slice(0, 5).filter((a) => {
        if (['update_date', 'mark_done'].includes(a.type)) return CHANGEABLE.has(a.field) && a.field !== 'sale_price' && (a.type === 'mark_done' || /^\d{4}-\d{2}-\d{2}$/.test(String(a.date || '')));
        if (a.type === 'add_task') return !!a.title;
        return !!a.body;
      });
      return Response.json({ reply: String(r?.reply || '').slice(0, 4000), actions });
    }

    if (body.mode === 'intake') {
      if (!body.file_url) return Response.json({ error: 'No document' }, { status: 400 });
      const [url] = await resolveForUser(me, base44.entities, [body.file_url]);
      const open = items.filter((i) => !['approved', 'exempt'].includes(i.status)).map((i) => ({ id: i.id, title: i.title, needs_document: !!i.requires_document, has_document: !!i.document_url }));
      const r = await InvokeLLM({
        max_tokens: 1500, system: SYSTEM, response_json_schema: INTAKE_SCHEMA, file_urls: [url],
        prompt: `A document named "${String(body.name || '').slice(0, 120)}" was added to this deal. Read it and say what it is, which open checklist item it belongs to (prefer items that need a document and don't have one yet; null if none fits), and any dates or price it sets or changes compared with the deal.
Allowed change fields: ${[...CHANGEABLE].join(', ')}.
Deal deadlines and price: ${JSON.stringify({ price: facts.price, deadlines: facts.deadlines })}
Open checklist items: ${JSON.stringify(open)}`,
      });
      const item = items.find((i) => i.id === r?.checklist_item_id) || null;
      const label = (f) => (f === 'sale_price' ? 'Sale price' : DEADLINES.find((d) => d.field === f)?.label || f);
      const changes = (r?.changes || []).filter((c) => CHANGEABLE.has(c.field)).map((c) => {
        const to = c.field === 'sale_price' ? Number(String(c.to).replace(/[^0-9.]/g, '')) : String(c.to).slice(0, 10);
        return { field: c.field, label: label(c.field), from: tx[c.field] ?? null, to, reason: String(c.reason || '').slice(0, 200) };
      }).filter((c) => (c.field === 'sale_price' ? c.to > 0 : /^\d{4}-\d{2}-\d{2}$/.test(c.to)) && String(c.from ?? '') !== String(c.to));
      return Response.json({
        document_type: String(r?.document_type || 'Document').slice(0, 120),
        summary: String(r?.summary || '').slice(0, 500),
        file_to: item ? { checklist_id: item.checklist_id, item_id: item.id, title: item.title, checklist: item.checklist } : null,
        changes,
        issues: (r?.issues || []).slice(0, 6).map((x) => String(x).slice(0, 300)),
      });
    }

    return Response.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (error) {
    console.error('dealAssistant:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
