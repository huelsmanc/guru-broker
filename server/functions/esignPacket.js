// New: build one signing packet from several files and/or saved templates.
// { parts: [{ url } | { templateId } | { formId }], title, transactionId? }
//   -> { document_url, fields, pages }  (fields from templates moved to their new place)
// PDFs are copied page by page; photos (JPG/PNG) become a page each.
import { createClientFromRequest } from '../lib/base44.js';
import { PDFDocument } from 'pdf-lib';
import { pathFromUrl, parsePath, canAccess, readFileBytes, storePrivate, scopeFolder } from '../lib/files.js';
import { stackRatio, heightPct } from '../../shared/esignGeometry.js';

const MAX_PARTS = 15;
const MAX_PAGES = 200;

const kindOf = (b) => (b[0] === 0x25 && b[1] === 0x50 ? 'pdf' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : null);

/** Moves fields drawn on one part into the stacked packet. offset/partRatio/total in page-widths. */
export function remapFields(fields, { offset, partRatio, total, prefix }) {
  return (fields || []).map((f) => {
    const h = heightPct(f, partRatio);
    const { height, ...rest } = f;
    const out = { ...rest, id: `${prefix}${f.id}`, y: ((offset + (Number(f.y) / 100) * partRatio) / total) * 100, hPct: (h * partRatio) / total };
    if (f.show_if) {
      const c = typeof f.show_if === 'string' ? { field_id: f.show_if } : f.show_if;
      out.show_if = { ...c, field_id: `${prefix}${c.field_id}` };
    }
    return out;
  });
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const { parts, title, transactionId } = await req.json();
    if (!Array.isArray(parts) || !parts.length) return Response.json({ error: 'Add at least one file' }, { status: 400 });
    if (parts.length > MAX_PARTS) return Response.json({ error: `Up to ${MAX_PARTS} files per packet` }, { status: 400 });
    const brokerageId = me.brokerage_id || (me.role === 'super_admin' ? 'platform' : null);
    if (!brokerageId) return Response.json({ error: 'Join a brokerage first' }, { status: 400 });

    // Load every part, checking the person may use each file.
    const loaded = [];
    for (const part of parts) {
      let url = part?.url;
      let fields = [];
      if (part?.formId) {
        // A contract form from the library (platform-wide or this brokerage's).
        // Through the person's own access: platform forms only for brokerages in that state.
        const [cf] = await base44.entities.ContractForm.filter({ id: part.formId }, '-created_date', 1).catch(() => []);
        if (!cf) return Response.json({ error: 'Form not found' }, { status: 404 });
        url = cf.document_url;
        fields = cf.fields || [];
      } else if (part?.templateId) {
        const [t] = await base44.asServiceRole.entities.ESignTemplate.filter({ id: part.templateId }, '-created_date', 1);
        if (!t || (t.brokerage_id && t.brokerage_id !== me.brokerage_id && me.role !== 'super_admin')) return Response.json({ error: 'Template not found' }, { status: 404 });
        url = t.document_url;
        fields = t.fields || [];
      } else {
        const path = pathFromUrl(url);
        const sb = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
        if (path) {
          if (!(await canAccess(me, parsePath(path), base44.entities))) return Response.json({ error: 'Not allowed to use one of those files' }, { status: 403 });
        } else if (!(sb && String(url || '').startsWith(`${sb}/storage/v1/object/public/`))) {
          return Response.json({ error: 'Unsupported file link' }, { status: 400 });
        }
      }
      const bytes = await readFileBytes(url);
      const kind = kindOf(bytes);
      if (!kind) return Response.json({ error: 'Only PDFs and JPG/PNG photos can go in a packet' }, { status: 400 });
      loaded.push({ bytes, kind, fields });
    }

    const out = await PDFDocument.create();
    const placed = [];
    for (const [i, p] of loaded.entries()) {
      const sizes = [];
      if (p.kind === 'pdf') {
        const src = await PDFDocument.load(p.bytes, { ignoreEncryption: true });
        const pages = await out.copyPages(src, src.getPageIndices());
        for (const pg of pages) { out.addPage(pg); const { width, height } = pg.getSize(); sizes.push({ width, height }); }
      } else {
        const img = p.kind === 'jpg' ? await out.embedJpg(p.bytes) : await out.embedPng(p.bytes);
        const width = 612;
        const height = Math.min(1008, (img.height / img.width) * width);
        const page = out.addPage([width, height]);
        const scale = Math.min(width / img.width, height / img.height);
        page.drawImage(img, { x: (width - img.width * scale) / 2, y: height - img.height * scale, width: img.width * scale, height: img.height * scale });
        sizes.push({ width, height });
      }
      if (out.getPageCount() > MAX_PAGES) return Response.json({ error: `Packets can have up to ${MAX_PAGES} pages` }, { status: 400 });
      placed.push({ ratio: stackRatio(sizes), fields: p.fields, prefix: `p${i + 1}_` });
    }

    const total = placed.reduce((s, p) => s + p.ratio, 0);
    let offset = 0;
    const fields = [];
    for (const p of placed) {
      fields.push(...remapFields(p.fields, { offset, partRatio: p.ratio, total, prefix: p.prefix }));
      offset += p.ratio;
    }

    const bytes = await out.save();
    const scope = transactionId ? { kind: 'tx', id: transactionId } : { kind: 'user', id: me.id };
    if (transactionId && me.role !== 'super_admin') {
      const ok = await canAccess(me, { brokerageId, kind: 'tx', id: transactionId }, base44.entities);
      if (!ok) return Response.json({ error: 'Not allowed on that deal' }, { status: 403 });
    }
    const document_url = await storePrivate(scopeFolder(brokerageId, scope), `${title || 'Signing packet'}.pdf`, bytes, 'application/pdf');
    return Response.json({ document_url, fields, pages: out.getPageCount() });
  } catch (error) {
    console.error('esignPacket:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
