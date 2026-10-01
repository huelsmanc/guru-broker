// Checklists for transactions and agent onboarding (Brokermint-style).
// Every change goes through here so approvals, permissions and the activity log stay honest.
//
// actions:
//   templates                         -> list templates (creates the starter set the first time)
//   apply     { subject_type, subject_id, subject_email?, template_id }
//   add_item  { checklist_id, title, requires_document, due_date, assignee_email }
//   update_item { checklist_id, item_id, patch: { title, due_date, assignee_email, requires_document } }
//   attach    { checklist_id, item_id, url, name }          (upload / assign a document)
//   submit    { checklist_id, item_id }                     (request review)
//   approve | reject { checklist_id, item_id, note }        (needs "approve documents")
//   exempt    { checklist_id, item_id, note }               (admins)
//   complete  { checklist_id, item_id, done }               (checkbox tasks)
//   comment   { checklist_id, item_id, text }
//   remove_item { checklist_id, item_id } | remove { checklist_id }
import { applyTemplate } from '../lib/checklists.js';
import { esc } from '../lib/esign.js';
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can, notifyPeople, mentionablePeople } from '../lib/team.js';
import { isPrivateUrl, canAccess, parsePath, pathFromUrl } from '../lib/files.js';

const DOC = (title, extra = {}) => ({ title, requires_document: true, ...extra });
const TASK = (title, extra = {}) => ({ title, requires_document: false, ...extra });

export const STARTER_TEMPLATES = [
  { name: 'Buyer Checklist', deal_type: 'buyer', kind: 'transaction', items: [
    DOC('B2B'), DOC('Prospective Parties'), DOC('Buyer Rep Agreement'), DOC('Buyer Packet'), DOC('Copy of EMD'),
    DOC('Preapproval Letter'), DOC('Fully Executed Purchase Agreement'), DOC('Lead Brochure'), DOC('Signed Property Disclosures'),
    DOC('Signed Lead Form'), TASK('Schedule Home Inspection'), TASK('Home Inspection Completed'), TASK('Inspection Contingency'),
    DOC('Addendum/ Amendments', { required: false }), TASK('Mortgage Contingency'), TASK('Closing Date'),
    DOC('Commission Disbursement Authorization - CDA'), DOC('MGA W9'), DOC('Settlement Statement'),
  ] },
  { name: 'Listing Checklist', deal_type: 'listing', kind: 'transaction', items: [
    DOC('Listing Agreement'), DOC('Seller Property Disclosure'), DOC('Lead Based Paint Disclosure (pre-1978)'), DOC('MLS Input Sheet'),
    TASK('Photos scheduled'), TASK('Listing live on MLS'), DOC('Offer(s) received'), DOC('Fully Executed Purchase Agreement'),
    DOC('Copy of EMD'), DOC('Addendum/ Amendments', { required: false }), TASK('Inspection Contingency'), TASK('Appraisal'),
    TASK('Mortgage Contingency'), TASK('Closing Date'), DOC('Commission Disbursement Authorization - CDA'), DOC('Settlement Statement'),
  ] },
  { name: 'Rental Listing Checklist', deal_type: 'rental_listing', kind: 'transaction', items: [
    DOC('Rental Listing Agreement'), DOC('Lead Based Paint Disclosure (pre-1978)'), TASK('Listing live on MLS'), DOC('Rental Application(s)'),
    DOC('Signed Lease'), DOC('Security Deposit Receipt'), DOC('Commission Disbursement Authorization - CDA'),
  ] },
  { name: 'Rental Tenant Checklist', deal_type: 'rental_tenant', kind: 'transaction', items: [
    DOC('Tenant Representation Agreement'), DOC('Rental Application'), DOC('Signed Lease'), DOC('Move-in Inspection'), DOC('Commission Disbursement Authorization - CDA'),
  ] },
  { name: 'Dual Agent Checklist', deal_type: 'dual', kind: 'transaction', items: [
    DOC('Dual Agency Consent (signed by both parties)'), DOC('Listing Agreement'), DOC('Buyer Rep Agreement'), DOC('Fully Executed Purchase Agreement'),
    DOC('Copy of EMD'), DOC('Signed Property Disclosures'), TASK('Inspection Contingency'), TASK('Mortgage Contingency'), TASK('Closing Date'),
    DOC('Commission Disbursement Authorization - CDA'), DOC('Settlement Statement'),
  ] },
  { name: 'Referral Checklist', deal_type: 'referral', kind: 'transaction', items: [
    DOC('Referral Agreement'), DOC('Closing confirmation / Settlement Statement'), DOC('Referral fee check copy'),
  ] },
  { name: 'Agent Onboarding Checklist', deal_type: 'onboarding', kind: 'onboarding', items: [
    DOC('Drivers License'), DOC('Agent Information Sheet'), DOC('W9'), DOC('Independent contractor agreement'), DOC('MLS form'), DOC('MLS office delete'),
    DOC('Real estate license'), DOC('E&O insurance certificate', { required: false }), TASK('Direct deposit linked'),
  ] },
];

const newId = () => `it_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

async function ensureTemplates(E, brokerageId) {
  const rows = await E.ChecklistTemplate.filter({ brokerage_id: brokerageId }, 'name', 200);
  if (rows.length) return rows;
  for (const t of STARTER_TEMPLATES) {
    await E.ChecklistTemplate.create({ brokerage_id: brokerageId, ...t, items: t.items.map((i) => ({ id: newId(), required: true, ...i })), active: true });
  }
  return E.ChecklistTemplate.filter({ brokerage_id: brokerageId }, 'name', 200);
}

function checklistStatus(items) {
  const req = items.filter((i) => i.required !== false);
  if (req.length && req.every((i) => ['approved', 'exempt', 'done'].includes(i.status))) return 'complete';
  if (items.some((i) => i.status === 'review_requested')) return 'review';
  return 'open';
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const body = await req.json();
    const E = base44.asServiceRole.entities;
    const admin = isAdminRole(me.role);
    const myEmail = me.email.toLowerCase();
    const now = new Date().toISOString();

    if (body.action === 'templates') {
      const t = await ensureTemplates(E, me.brokerage_id);
      return Response.json({ templates: t.filter((x) => x.active !== false) });
    }

    // Who may work on a subject
    async function access(subjectType, subjectId, subjectEmail) {
      if (subjectType === 'transaction') {
        let tx = await base44.entities.Transaction.get(subjectId).catch(() => null); // user's own access rules
        if (!tx && can(me, 'docs.approve') && ['approve', 'reject', 'comment'].includes(body.action)) {
          // Document reviewers work the approval queue without full deal access.
          const t = await E.Transaction.get(subjectId).catch(() => null);
          if (t && t.brokerage_id === me.brokerage_id) return { tx: t, owner: false, manage: false };
        }
        if (!tx) throw Object.assign(new Error('Transaction not found'), { status: 404 });
        const isTc = String(tx.tc_email || '').toLowerCase() === myEmail;
        return { tx, owner: true, manage: admin || isTc || can(me, 'tx.checklist_manage') };
      }
      const own = String(subjectEmail || '').toLowerCase() === myEmail;
      if (!own && !admin && !can(me, 'users.manage')) throw Object.assign(new Error('Not allowed'), { status: 403 });
      return { owner: own, manage: admin || can(me, 'users.manage') };
    }

    if (body.action === 'apply') {
      const { subject_type = 'transaction', subject_id, template_id } = body;
      const subject_email = subject_type === 'onboarding' ? String(body.subject_email || '').toLowerCase() : null;
      const acc = await access(subject_type, subject_id, subject_email);
      if (subject_type === 'transaction' && !acc.manage && !can(me, 'tx.checklist_add')) return Response.json({ error: 'Not allowed' }, { status: 403 });
      const [tpl] = await E.ChecklistTemplate.filter({ id: template_id }, '-created_date', 1);
      if (!tpl || tpl.brokerage_id !== me.brokerage_id) return Response.json({ error: 'Template not found' }, { status: 404 });
      const owner = subject_type === 'transaction' ? acc.tx.agent_email : subject_email;
      const cl = await applyTemplate(E, tpl, { brokerageId: me.brokerage_id, subjectType: subject_type, subjectId: subject_id || subject_email, owner });
      return Response.json({ checklist: cl });
    }

    const [cl] = await E.Checklist.filter({ id: body.checklist_id }, '-created_date', 1);
    if (!cl || cl.brokerage_id !== me.brokerage_id) return Response.json({ error: 'Checklist not found' }, { status: 404 });
    const acc = await access(cl.subject_type, cl.subject_id, cl.subject_email);
    const items = [...(cl.items || [])];
    const idx = items.findIndex((i) => i.id === body.item_id);
    const item = idx >= 0 ? { ...items[idx], comments: [...(items[idx].comments || [])], history: [...(items[idx].history || [])] } : null;
    const log = (what) => item && item.history.push({ at: now, by: myEmail, what });
    const approver = admin || can(me, 'docs.approve');
    const fail = (msg, status = 403) => Response.json({ error: msg }, { status });
    let mentioned = [];
    if (body.action === 'mentionable') {
      return Response.json({ people: [...(await mentionablePeople(E, me.brokerage_id, { tx: acc.tx, subjectEmail: cl.subject_email })).values()].filter((p) => p.email !== myEmail) });
    }

    switch (body.action) {
      case 'remove':
        if (!(acc.manage || can(me, 'tx.checklist_remove'))) return fail('Not allowed');
        await E.Checklist.delete(cl.id);
        return Response.json({ status: 'removed' });
      case 'add_item':
        if (!acc.manage) return fail('Not allowed');
        items.push({ id: newId(), title: String(body.title || 'Task').slice(0, 200), requires_document: !!body.requires_document, required: body.required !== false, due_date: body.due_date || null, assignee_email: body.assignee_email || cl.subject_email, status: 'open', comments: [], history: [{ at: now, by: myEmail, what: 'created' }] });
        break;
      case 'remove_item':
        if (!acc.manage) return fail('Not allowed');
        if (idx < 0) return fail('Item not found', 404);
        items.splice(idx, 1);
        break;
      case 'update_item': {
        if (!item) return fail('Item not found', 404);
        if (!acc.manage) return fail('Not allowed');
        const allowed = ['title', 'due_date', 'assignee_email', 'requires_document', 'required'];
        for (const k of allowed) if (k in (body.patch || {})) item[k] = body.patch[k];
        log('edited');
        items[idx] = item;
        break;
      }
      case 'attach':
        if (!item) return fail('Item not found', 404);
        if (isPrivateUrl(body.url)) {
          if (!(await canAccess(me, parsePath(pathFromUrl(body.url)), base44.entities))) return fail('Not allowed to use that file');
        } else if (!/^https:\/\//.test(String(body.url || ''))) return fail('Missing document', 400);
        item.document_url = body.url; item.document_name = String(body.name || 'Document').slice(0, 200);
        item.uploaded_by = myEmail; item.uploaded_at = now;
        if (!['approved'].includes(item.status)) item.status = 'uploaded';
        log(`uploaded ${item.document_name}`);
        items[idx] = item;
        break;
      case 'submit':
        if (!item) return fail('Item not found', 404);
        if (item.requires_document && !item.document_url) return fail('Upload the document first', 400);
        item.status = 'review_requested'; item.submitted_at = now; log('submitted for review');
        items[idx] = item;
        break;
      case 'approve':
      case 'reject':
        if (!item) return fail('Item not found', 404);
        if (!approver) return fail('You need the "approve documents" permission');
        item.status = body.action === 'approve' ? 'approved' : 'rejected';
        item.reviewed_by = myEmail; item.reviewed_at = now;
        if (body.note) item.comments.push({ at: now, by: myEmail, text: String(body.note).slice(0, 2000) });
        log(body.action === 'approve' ? 'approved' : 'rejected');
        items[idx] = item;
        break;
      case 'exempt':
        if (!item) return fail('Item not found', 404);
        if (!admin) return fail('Admins only');
        item.status = 'exempt'; log('marked exempt');
        if (body.note) item.comments.push({ at: now, by: myEmail, text: String(body.note).slice(0, 2000) });
        items[idx] = item;
        break;
      case 'complete':
        if (!item) return fail('Item not found', 404);
        if (item.requires_document) return fail('This item needs a document; upload and submit it', 400);
        item.status = body.done === false ? 'open' : 'done'; item.completed_by = myEmail; item.completed_at = now;
        log(item.status === 'done' ? 'completed' : 'reopened');
        items[idx] = item;
        break;
      case 'comment': {
        if (!item) return fail('Item not found', 404);
        const text = String(body.text || '').slice(0, 2000);
        if (!text.trim()) return fail('Write a comment', 400);
        const wanted = new Set([...(Array.isArray(body.mentions) ? body.mentions : []), ...[...text.matchAll(/@([\w.+-]+@[\w.-]+\.\w+)/g)].map((m) => m[1])]
          .map((e) => String(e).toLowerCase()).filter((e) => e && e !== myEmail));
        const allowed = wanted.size ? await mentionablePeople(E, me.brokerage_id, { tx: acc.tx, subjectEmail: cl.subject_email }) : new Map();
        mentioned = [...wanted].filter((e) => allowed.has(e)).map((e) => allowed.get(e));
        item.comments.push({ at: now, by: myEmail, by_name: me.full_name || null, text, mentions: mentioned.map((p) => ({ email: p.email, name: p.name })) });
        log(mentioned.length ? `commented and mentioned ${mentioned.map((p) => p.name).join(', ')}` : 'commented');
        items[idx] = item;
        break;
      }
      default:
        return fail('Unknown action', 400);
    }

    const status = checklistStatus(items);
    const saved = await E.Checklist.update(cl.id, { items, status });

    // Notifications
    const label = acc.tx?.property_address || cl.subject_email;
    const link = cl.subject_type === 'transaction' ? `/Transactions/${cl.subject_id}?tab=checklists&checklist=${cl.id}` : `/Onboarding?user=${encodeURIComponent(cl.subject_email)}`;
    if (body.action === 'submit') {
      const people = (await E.User.filter({ brokerage_id: me.brokerage_id }, 'full_name', 2000))
        .filter((u) => !u.suspended && can(u, 'docs.approve') && u.email.toLowerCase() !== myEmail);
      await notifyPeople(E, { brokerageId: me.brokerage_id, people, link, referenceId: cl.id, referenceType: 'Checklist',
        title: `Review requested: ${item.title}`, message: `${me.full_name || me.email} submitted "${item.title}" (${label}) for approval.` });
    } else if (['approve', 'reject'].includes(body.action) && item.uploaded_by && item.uploaded_by !== myEmail) {
      await notifyPeople(E, { brokerageId: me.brokerage_id, people: [{ email: item.uploaded_by }], link, referenceId: cl.id, referenceType: 'Checklist',
        title: `${body.action === 'approve' ? 'Approved' : 'Needs changes'}: ${item.title}`,
        message: `${me.full_name || me.email} ${body.action === 'approve' ? 'approved' : 'sent back'} "${item.title}" (${label}).${body.note ? ` Note: ${body.note}` : ''}` });
    } else if (body.action === 'comment' && mentioned.length) {
      const text = String(body.text).slice(0, 300);
      await notifyPeople(E, { brokerageId: me.brokerage_id, people: mentioned, link: `${link}${link.includes('?') ? '&' : '?'}item=${item.id}`, referenceId: cl.id, referenceType: 'Checklist',
        title: `${me.full_name || me.email} mentioned you on ${item.title}`, message: `${label}: ${text}`,
        pushKind: 'mention', emailBody: `<p><b>${esc(me.full_name || me.email)}</b> mentioned you on <b>${esc(item.title)}</b> (${esc(label)}):</p><blockquote style="border-left:3px solid #10b981;margin:0;padding:6px 12px;color:#374151">${esc(text)}</blockquote>` });
    }
    return Response.json({ checklist: saved });
  } catch (error) {
    console.error('checklistAction:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
