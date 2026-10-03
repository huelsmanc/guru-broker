// E-sign from a checklist item (agent onboarding: ICA, W-9, policies...; also deal checklists).
//   send     { checklist_id, item_id, message? }  -> sends the item's e-sign form to the agent
//                                                   (and to the sender to countersign, when the form has a 2nd signer)
//   send_all { checklist_id }                      -> every form item that isn't out yet
//   my_link  { checklist_id, item_id, back? }      -> the signing page for me, when it's my turn
//   void     { checklist_id, item_id }             -> cancel the request (the item goes back to open)
//   forms    { checklist_id }                      -> which items have a form ready to send (admins)
// The item follows the request from here on (see server/lib/checklistEsign.js).
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can, notifyPeople } from '../lib/team.js';
import { startSigning, whoseTurn, tokenOf, signingLink, audit } from '../lib/esign.js';
import { changeItem } from '../lib/checklistEsign.js';

class Problem extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const lc = (e) => String(e || '').toLowerCase().trim();
const realName = (u) => [u?.display_name, u?.full_name].map((v) => String(v || '').trim()).find((v) => v && !v.includes('@')) || '';
const LIVE = ['sent', 'partly_signed'];

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) throw new Problem('Not signed in', 401);
    const body = await req.json().catch(() => ({}));
    const E = base44.asServiceRole.entities;
    const admin = isAdminRole(me.role);

    const [cl] = await E.Checklist.filter({ id: String(body.checklist_id || '') }, '-created_date', 1);
    if (!cl || (cl.brokerage_id !== me.brokerage_id && me.role !== 'super_admin')) throw new Problem('Checklist not found', 404);

    // Who manages this checklist (sends and cancels), and who it's about.
    let manage = false; let subject = null; let tx = null;
    if (cl.subject_type === 'onboarding') {
      manage = admin || can(me, 'users.manage');
      [subject] = await E.User.filter({ email: lc(cl.subject_email) }, '-created_date', 1);
    } else {
      tx = await base44.entities.Transaction.get(cl.subject_id).catch(() => null); // the user's own access
      manage = !!tx && (admin || lc(tx.tc_email) === lc(me.email) || can(me, 'tx.checklist_manage'));
      if (tx) [subject] = await E.User.filter({ email: lc(tx.agent_email) }, '-created_date', 1);
    }
    // Checklists put on agents before the template got its e-sign form still pick it up (same item name).
    let tplItems = null;
    const formOf = async (item) => {
      if (item.esign_template_id) return item.esign_template_id;
      if (!cl.template_id) return null;
      if (!tplItems) { const [t] = await E.ChecklistTemplate.filter({ id: cl.template_id }, '-created_date', 1); tplItems = t?.items || []; }
      const norm = (x) => String(x || '').trim().toLowerCase();
      return tplItems.find((t) => t.esign_template_id && norm(t.title) === norm(item.title))?.esign_template_id || null;
    };
    const itemOf = (id) => (cl.items || []).find((i) => i.id === id);

    async function sendOne(item) {
      item = { ...item, esign_template_id: await formOf(item) };
      if (!item.esign_template_id) throw new Problem(`"${item.title}" has no form to sign. Upload one with "Send for signature" instead.`);
      if (LIVE.includes(item.esign?.status)) throw new Problem(`"${item.title}" is already out for signature.`, 409);
      if (item.esign?.status === 'signed' || ['approved', 'exempt'].includes(item.status)) throw new Problem(`"${item.title}" is already done.`, 409);
      const [tpl] = await E.ESignTemplate.filter({ id: item.esign_template_id }, '-created_date', 1);
      if (!tpl || tpl.brokerage_id !== cl.brokerage_id) throw new Problem(`The form for "${item.title}" was removed. Pick another in the checklist template.`, 404);
      const fields = (tpl.fields || []).map((f, i) => ({ ...f, id: f.id || `field-${i}-${Date.now()}` }));
      if (fields.some((f) => f.sender_fill && (f.value == null || f.value === ''))) {
        throw new Problem(`"${tpl.title}" has boxes you fill in before sending. Use "Review and send" to fill them.`);
      }
      const person = subject || { email: cl.subject_email };
      if (!person.email) throw new Problem('This checklist has no agent to send to.');
      const roles = Array.isArray(tpl.roles) && tpl.roles.length ? tpl.roles : ['Agent'];
      if (roles.length > 2) throw new Problem(`"${tpl.title}" has ${roles.length} signers. Use "Review and send" to choose them.`);
      const countersigner = roles.length === 2 ? me : null; // the broker sending it signs second
      if (countersigner && lc(countersigner.email) === lc(person.email)) throw new Problem('You can’t countersign your own form. Ask another admin to send it.');
      const signers = [
        { name: realName(person) || lc(person.email).split('@')[0], email: lc(person.email), role: roles[0] },
        ...(countersigner ? [{ name: realName(countersigner) || lc(countersigner.email).split('@')[0], email: lc(countersigner.email), role: roles[1] }] : []),
      ];
      const doc = await E.ESignDocument.create({
        brokerage_id: cl.brokerage_id, title: item.title || tpl.title,
        ...(tx ? { transaction_id: tx.id } : {}),
        checklist_id: cl.id, checklist_item_id: item.id,
        document_url: tpl.document_url, fields, signers, status: 'draft',
        created_by_email: lc(me.email), created_by_name: realName(me) || me.email,
      });
      const sub = await startSigning({
        entities: E, doc, signers, sequenceType: 'sequential', transactionId: tx?.id, req,
        sender: { ...me, full_name: realName(me) || me.full_name },
        message: body.message || (cl.subject_type === 'onboarding' ? `Please review and sign "${item.title}" for your onboarding.` : undefined),
        options: { remindDays: 2 },
      });
      // An alert in the app (and on their phone) too, with a button that opens the form.
      await notifyPeople(E, {
        brokerageId: cl.brokerage_id, people: [{ email: signers[0].email, full_name: signers[0].name }],
        title: `Please sign: ${item.title}`, message: `${realName(me) || 'Your broker'} sent "${item.title}" for your signature.`,
        link: cl.subject_type === 'onboarding' ? '/Profile#onboarding' : `/Transactions/${tx?.id || ''}`,
        referenceId: sub.id, referenceType: 'ESign', email: false, pushKind: 'esign',
      }).catch(() => {});
      return { item: item.id, submission_id: sub.id, signers: signers.map((s) => s.name) };
    }

    switch (body.action) {
      case 'forms': {
        // Which items have a form ready to send (and who signs it), for the checklist screen.
        if (!manage) return Response.json({ forms: {} });
        const ids = {};
        for (const i of cl.items || []) { const t = await formOf(i); if (t) ids[i.id] = t; }
        const tpls = Object.keys(ids).length ? await E.ESignTemplate.filter({ id: { $in: [...new Set(Object.values(ids))] } }, '-created_date', 100) : [];
        const byId = new Map(tpls.filter((t) => t.brokerage_id === cl.brokerage_id).map((t) => [t.id, t]));
        const forms = {};
        for (const [item, t] of Object.entries(ids)) if (byId.has(t)) forms[item] = { template_id: t, title: byId.get(t).title, roles: byId.get(t).roles || ['Agent'] };
        return Response.json({ forms });
      }

      case 'send': {
        if (!manage) throw new Problem('Only admins can send forms for signature.', 403);
        const item = itemOf(body.item_id);
        if (!item) throw new Problem('Item not found', 404);
        return Response.json({ sent: [await sendOne(item)] });
      }

      case 'send_all': {
        if (!manage) throw new Problem('Only admins can send forms for signature.', 403);
        const withForms = [];
        for (const i of cl.items || []) if (await formOf(i)) withForms.push(i);
        const todo = withForms.filter((i) => !LIVE.includes(i.esign?.status) && i.esign?.status !== 'signed' && !['approved', 'exempt'].includes(i.status));
        const sent = []; const failed = [];
        for (const it of todo) {
          try { sent.push(await sendOne(it)); } catch (e) { failed.push({ item: it.id, title: it.title, error: e.message }); }
        }
        return Response.json({ sent, failed });
      }

      case 'my_link': {
        const item = itemOf(body.item_id);
        if (!item?.esign?.submission_id) throw new Problem('Nothing to sign here', 404);
        const [sub] = await E.ESignSubmission.filter({ id: item.esign.submission_id }, '-created_date', 1);
        if (!sub || sub.status === 'voided') throw new Problem('This request was cancelled.', 410);
        if (sub.status === 'completed') throw new Problem('Everyone has already signed.', 409);
        const signer = (sub.signers || []).find((s) => lc(s.email) === lc(me.email) && !s.signed);
        if (!signer) throw new Problem("You're not a signer on this, or you already signed.", 403);
        if (!whoseTurn(sub).some((s) => lc(s.email) === lc(me.email))) throw new Problem("It's not your turn yet. You'll get an alert when it is.", 409);
        const back = /^\/(?!\/)[\w\-/?=&#.%]*$/.test(String(body.back || '')) ? body.back : '';
        const url = signingLink(await tokenOf(signer)).replace(/^https?:\/\/[^/]+/, '');
        return Response.json({ url: back ? `${url}&back=${encodeURIComponent(back)}` : url });
      }

      case 'void': {
        if (!manage) throw new Problem('Only admins can cancel.', 403);
        const item = itemOf(body.item_id);
        if (!item?.esign?.submission_id) throw new Problem('Nothing out for signature here', 404);
        const [sub] = await E.ESignSubmission.filter({ id: item.esign.submission_id }, '-created_date', 1);
        if (sub?.status === 'completed') throw new Problem('Already signed by everyone.', 409);
        if (sub && sub.status !== 'voided') {
          await E.ESignSubmission.update(sub.id, { status: 'voided', voided_at: new Date().toISOString(), voided_by: me.email });
          await E.ESignDocument.update(sub.document_id, { status: 'voided' }).catch(() => {});
          await audit(E, { document_id: sub.document_id, action: 'voided', details: `Cancelled from the checklist by ${me.email}` });
        }
        const at = new Date().toISOString();
        await changeItem(cl.id, item.id, (it) => ({ ...it, esign: { ...it.esign, status: 'voided', voided_at: at }, history: [...it.history, { at, by: lc(me.email), what: 'cancelled the signing request' }] }));
        return Response.json({ voided: true });
      }

      default:
        throw new Problem('Unknown action');
    }
  } catch (e) {
    if (!e.status || e.status >= 500) console.error('checklistEsign:', e);
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
};
