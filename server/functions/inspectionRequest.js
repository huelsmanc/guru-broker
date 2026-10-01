// New: inspection report -> inspection request.
//   { action: 'scan', transactionId, file_urls, name }
//       AI reads the inspection report and lists every finding (major to minor) with where it
//       is in the report. Saved on the deal as a draft request.
//   { action: 'build', transactionId, requestId, selected: [{ id, ask, note }], credit, response_by, notes }
//       Makes the Inspection Request PDF (requested items, the rest listed for reference,
//       buyer signature lines, a seller response section) and returns signing boxes for buyers.
//   { action: 'send', transactionId, requestId, to, cc, message }
//       Emails the buyer-signed request to the listing agent for the seller's review.
// Uses the caller's own access to the deal throughout.
import { createClientFromRequest } from '../lib/base44.js';
import { InvokeLLM, SendEmail } from '../lib/integrations.js';
import { resolveForUser, storePrivate, scopeFolder, readFileBytes } from '../lib/files.js';
import { createDoc, money } from '../lib/pdfdoc.js';
import { esc } from '../lib/esign.js';
import { adminClient } from '../lib/base44.js';

const SEVERITY = ['major', 'moderate', 'minor'];
const ASKS = ['repair', 'replace', 'credit', 'evaluate', 'none'];
const ASK_TEXT = { repair: 'Repair by a licensed professional', replace: 'Replace', credit: 'Credit at closing', evaluate: 'Further evaluation by a licensed professional, then repair as recommended' };
const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean) : v ? [v] : []);
const usDate = (d) => { const [y, m, dd] = String(d || '').slice(0, 10).split('-'); return y && m && dd ? `${m}/${dd}/${y}` : ''; };

const SCAN_SCHEMA = {
  type: 'object',
  properties: {
    inspector: { type: ['string', 'null'] },
    inspection_date: { type: ['string', 'null'], description: 'YYYY-MM-DD' },
    summary: { type: 'string', description: 'Two or three sentences for the buyer: overall condition and the biggest concerns' },
    items: {
      type: 'array',
      description: 'EVERY defect, deficiency, safety issue and repair/further-evaluation recommendation in the report. Skip pure maintenance tips and general information.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name, e.g. "Water heater TPR valve missing discharge pipe"' },
          location: { type: ['string', 'null'] },
          category: { type: 'string', enum: ['safety', 'structural', 'roof', 'electrical', 'plumbing', 'hvac', 'water_moisture', 'pest', 'exterior', 'interior', 'appliances', 'other'] },
          severity: { type: 'string', enum: SEVERITY, description: 'major: safety hazards, structural, active leaks, systems not working or near end of life, costly repairs. moderate: needs repair soon. minor: small or cosmetic' },
          description: { type: 'string', description: 'What the inspector found, in plain words' },
          reference: { type: ['string', 'null'], description: 'Where it is in the report: section number and/or page, e.g. "4.2 Roof, p. 12"' },
          suggested_ask: { type: 'string', enum: ASKS },
        },
        required: ['title', 'category', 'severity', 'description', 'suggested_ask'],
      },
    },
  },
  required: ['summary', 'items'],
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json();
    const tx = await base44.entities.Transaction.get(body.transactionId).catch(() => null);
    if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });
    const list = Array.isArray(tx.inspection_requests) ? tx.inspection_requests : [];
    const saveList = (next) => base44.entities.Transaction.update(tx.id, { inspection_requests: next });

    if (body.action === 'scan') {
      const given = (body.file_urls || []).filter(Boolean).slice(0, 5);
      if (!given.length) return Response.json({ error: 'Add the inspection report' }, { status: 400 });
      const urls = await resolveForUser(me, base44.entities, given);
      const r = await InvokeLLM({
        max_tokens: 12000, file_urls: urls, response_json_schema: SCAN_SCHEMA,
        system: 'You are an experienced buyer\'s agent reading a home inspection report. List every finding the inspector flagged, faithfully, with its location in the report. Never invent findings.',
        prompt: `Read this home inspection report for ${tx.property_address || 'the property'} and list every finding. Mark severity carefully and suggest what a buyer would typically ask the seller for (repair, replace, credit, further evaluation, or none for minor/cosmetic items).`,
      });
      const items = (r?.items || []).slice(0, 200).map((it, i) => ({
        id: `f${i + 1}`,
        title: String(it.title || 'Item').slice(0, 160),
        location: it.location ? String(it.location).slice(0, 120) : null,
        category: it.category || 'other',
        severity: SEVERITY.includes(it.severity) ? it.severity : 'moderate',
        description: String(it.description || '').slice(0, 600),
        reference: it.reference ? String(it.reference).slice(0, 80) : null,
        suggested_ask: ASKS.includes(it.suggested_ask) ? it.suggested_ask : 'repair',
      }));
      const request = {
        id: `ir_${Date.now().toString(36)}`, status: 'draft', created_at: new Date().toISOString(), created_by: me.email,
        report: { url: given[0], name: String(body.name || 'Inspection report').slice(0, 160) },
        inspector: r?.inspector || null, inspection_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r?.inspection_date || '')) ? r.inspection_date : null,
        summary: String(r?.summary || '').slice(0, 800), items,
      };
      await saveList([...list, request]);
      return Response.json({ request });
    }

    const request = list.find((x) => x.id === body.requestId);
    if (!request) return Response.json({ error: 'Inspection request not found' }, { status: 404 });

    if (body.action === 'build') {
      const picked = (body.selected || []).map((s) => ({ ...request.items.find((i) => i.id === s.id), ask: ASKS.includes(s.ask) ? s.ask : 'repair', note: String(s.note || '').slice(0, 300) })).filter((x) => x.id && x.ask !== 'none');
      if (!picked.length && !Number(body.credit)) return Response.json({ error: 'Pick at least one item, or enter a credit' }, { status: 400 });
      const others = request.items.filter((i) => !picked.some((p) => p.id === i.id));
      const buyers = names(tx.buyers);
      const sellers = names(tx.sellers);
      const doc = await createDoc();
      doc.title('Inspection Request', `${tx.property_address || ''}`);
      doc.para(`Buyer(s): ${buyers.join(', ') || '________________'}        Seller(s): ${sellers.join(', ') || '________________'}`, { size: 9 });
      doc.para(`Inspection${request.inspector ? ` by ${request.inspector}` : ''}${request.inspection_date ? ` on ${usDate(request.inspection_date)}` : ''}. Report: ${request.report?.name || 'attached inspection report'}.`, { size: 9 });
      doc.rule();
      doc.para('Under the inspection contingency of the purchase agreement, Buyer(s) request that Seller(s), at Seller\'s expense and before closing, address the items below. Repairs are to be completed in a workmanlike manner by appropriately licensed professionals, with receipts or invoices provided to Buyer(s) before closing. Items not listed are not requested.', { size: 10 });
      if (body.notes) doc.para(String(body.notes).slice(0, 1500), { size: 10 });
      doc.heading(`Requested items (${picked.length})`);
      picked.forEach((it, n) => {
        doc.para(`${n + 1}. ${it.title}${it.location ? ` (${it.location})` : ''}`, { isBold: true, size: 10, gap: 1 });
        doc.para(`${ASK_TEXT[it.ask] || 'Repair'}. ${it.description}${it.note ? ` Note: ${it.note}` : ''}`, { size: 9, indent: 14, gap: 1 });
        if (it.reference) doc.para(`Report reference: ${it.reference}`, { size: 8, indent: 14, gap: 4 });
      });
      if (Number(body.credit) > 0) {
        doc.space(4);
        doc.para(`${picked.length ? 'As an alternative to the repairs above, Buyer(s) will' : 'Buyer(s)'} accept a credit of ${money(Number(body.credit))} toward closing costs at closing${picked.length ? '' : ' in place of repairs'}, subject to lender approval.`, { isBold: true, size: 10 });
      }
      if (body.response_by) doc.para(`Please respond by ${usDate(body.response_by)}.`, { size: 10 });

      doc.heading('Buyer signature');
      const buyerLines = (buyers.length ? buyers : ['Buyer']).map((b) => doc.signatureLine(b));

      doc.heading('Seller response');
      doc.checkbox('Seller agrees to all requested items');
      doc.checkbox('Seller agrees to items # ______________________ only');
      doc.checkbox('Seller offers a credit of $______________ at closing in place of repairs');
      doc.checkbox('Seller declines the request');
      (sellers.length ? sellers : ['Seller']).forEach((s) => doc.signatureLine(s));

      if (others.length) {
        doc.heading(`Other findings in the report, not requested (${others.length})`);
        doc.para('Listed for reference so the full report is accounted for. These are not part of this request.', { size: 8 });
        others.forEach((it) => doc.para(`- [${it.severity}] ${it.title}${it.location ? ` (${it.location})` : ''}${it.reference ? ` - ${it.reference}` : ''}`, { size: 8, gap: 0 }));
      }
      const bytes = await doc.save();
      const pages = doc.pdf.getPageCount();
      const brokerageId = tx.brokerage_id || me.brokerage_id;
      const pdf_url = await storePrivate(scopeFolder(brokerageId, { kind: 'tx', id: tx.id }), `Inspection request - ${tx.property_address || 'property'}.pdf`, bytes, 'application/pdf');

      // Signing boxes on the buyer lines (document space: % of width, % of all pages stacked).
      const total = pages * 792;
      const fields = [];
      buyerLines.forEach((ln, i) => {
        const topOf = (h) => ((ln.pageIndex * 792 + (792 - ln.lineY) - h) / total) * 100;
        fields.push({ id: `ir-sig-${i}`, type: 'signature', x: (50 / 612) * 100, width: (230 / 612) * 100, y: topOf(26), hPct: (26 / total) * 100, required: true, value: '', signer_index: i });
        fields.push({ id: `ir-date-${i}`, type: 'date', x: (350 / 612) * 100, width: (130 / 612) * 100, y: topOf(16), hPct: (16 / total) * 100, required: true, value: '', signer_index: i });
      });

      const next = list.map((x) => (x.id === request.id ? { ...x, status: 'ready', pdf_url, fields, selected: picked.map(({ id, ask, note }) => ({ id, ask, note })), credit: Number(body.credit) || null, response_by: body.response_by || null, notes: body.notes || null, built_at: new Date().toISOString() } : x));
      const fresh = await base44.entities.Transaction.get(tx.id);
      await base44.entities.Transaction.update(tx.id, {
        inspection_requests: next,
        documents: [...(fresh.documents || []), { name: `Inspection request - ${tx.property_address || ''}.pdf`, url: pdf_url, uploaded_at: new Date().toISOString(), uploaded_by: me.full_name || me.email }],
      });
      return Response.json({ pdf_url, fields });
    }

    if (body.action === 'send') {
      const to = String(body.to || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return Response.json({ error: 'Enter the listing agent\'s email' }, { status: 400 });
      // The buyer-signed copy when signing is finished; otherwise the request as written.
      let bytes = null; let signed = false;
      if (request.submission_id) {
        const [sub] = await base44.asServiceRole.entities.ESignSubmission.filter({ id: request.submission_id }, '-created_date', 1);
        if (sub?.status === 'completed' && sub.signed_pdf_path) {
          const { data } = await adminClient().storage.from('private-files').download(String(sub.signed_pdf_path).replace(/^private-files\//, ''));
          if (data) { bytes = Buffer.from(await data.arrayBuffer()); signed = true; }
        }
      }
      if (!bytes && !body.allowUnsigned) return Response.json({ error: 'The buyers haven\'t finished signing yet', needsConfirm: true }, { status: 409 });
      if (!bytes) bytes = Buffer.from(await readFileBytes(request.pdf_url));
      const agentName = me.full_name || me.email;
      await SendEmail({
        to, cc: body.cc ? [String(body.cc).trim()] : undefined, reply_to: me.email,
        from_name: `${agentName} via Guru Broker`,
        subject: `Inspection request: ${tx.property_address || ''}`,
        body: `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2937">${esc(String(body.message || '').trim() || `Hi,\n\nAttached is my buyers' ${signed ? 'signed ' : ''}inspection request for ${tx.property_address || 'the property'}. Please review it with the sellers and let me know their response${request.response_by ? ` by ${usDate(request.response_by)}` : ''}.\n\nThank you,\n${agentName}`).replace(/\n/g, '<br/>')}</div>`,
        attachments: [{ filename: `Inspection request - ${tx.property_address || 'property'}.pdf`.replace(/[^\w .,-]/g, ''), content: bytes.toString('base64') }],
      });
      const next = list.map((x) => (x.id === request.id ? { ...x, status: 'sent', sent_at: new Date().toISOString(), sent_to: to, sent_signed: signed } : x));
      await base44.entities.Transaction.update(tx.id, { inspection_requests: next });
      return Response.json({ status: 'sent', signed });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('inspectionRequest:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
