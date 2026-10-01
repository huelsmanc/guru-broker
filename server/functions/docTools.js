// New: page tools for documents (split, rotate, reorder, delete, combine).
//   { action: 'build', sources: [url], pages: [{ s, p, r }], name, transactionId? }
//       -> { file_url, page_count }  a new PDF made of those pages (s = source index,
//          p = page index from 0, r = extra rotation in degrees), saved privately to the deal
//          (or the person's own folder). Sources can be PDFs or JPG/PNG photos (one page each).
//   { action: 'suggest', transactionId, pages: [{ n, text }], items: [{ key, title }] }
//       -> { documents: [{ name, pages: [n...], item_key }] }  AI reads a scanned packet and
//          says where each document starts and ends, and which checklist item it belongs on.
// Files are checked against the person's own access, the same as opening them.
import { createClientFromRequest } from '../lib/base44.js';
import { PDFDocument, degrees } from 'pdf-lib';
import { pathFromUrl, parsePath, canAccess, readFileBytes, storePrivate, scopeFolder } from '../lib/files.js';
import { InvokeLLM } from '../lib/integrations.js';

const MAX_SOURCES = 12;
const MAX_PAGES = 400;
const kindOf = (b) => (b[0] === 0x25 && b[1] === 0x50 ? 'pdf' : b[0] === 0xff && b[1] === 0xd8 ? 'jpg' : b[0] === 0x89 && b[1] === 0x50 ? 'png' : null);

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me) return Response.json({ error: 'Not authenticated' }, { status: 401 });
    const body = await req.json();
    let tx = null;
    if (body.transactionId) {
      tx = await base44.entities.Transaction.get(body.transactionId).catch(() => null);
      if (!tx) return Response.json({ error: 'Transaction not found' }, { status: 404 });
    }

    if (body.action === 'suggest') {
      const pages = (body.pages || []).slice(0, 150).map((p) => ({ n: Number(p.n), text: String(p.text || '').replace(/\s+/g, ' ').slice(0, 700) }));
      if (!pages.length) return Response.json({ documents: [] });
      const items = (body.items || []).slice(0, 80).map((i) => ({ key: String(i.key), title: String(i.title || '').slice(0, 120) }));
      const r = await InvokeLLM({
        max_tokens: 2500,
        response_json_schema: {
          type: 'object',
          properties: {
            documents: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: 'Short document name, e.g. "Purchase and Sale Agreement"' },
                  pages: { type: 'array', items: { type: 'integer' } },
                  item_key: { type: ['string', 'null'], description: 'The checklist item it belongs on, or null' },
                },
                required: ['name', 'pages'],
              },
            },
          },
          required: ['documents'],
        },
        system: 'You split scanned real estate document packets into their separate documents. Use page headers, titles, page "x of y" markers and signature pages to find where each document starts and ends. Every page belongs to exactly one document, in order.',
        prompt: `${tx ? `Deal: ${tx.property_address}\n` : ''}Checklist items (key: title):\n${items.map((i) => `${i.key}: ${i.title}`).join('\n') || '(none)'}\n\nPages (start of each page's text):\n${pages.map((p) => `[${p.n}] ${p.text || '(no text: scanned image or blank)'}`).join('\n')}`,
      });
      const valid = new Set(pages.map((p) => p.n));
      const keys = new Set(items.map((i) => i.key));
      const used = new Set();
      const documents = (r?.documents || []).map((d) => ({
        name: String(d.name || 'Document').slice(0, 120),
        pages: (d.pages || []).map(Number).filter((n) => valid.has(n) && !used.has(n) && used.add(n)),
        item_key: d.item_key && keys.has(String(d.item_key)) ? String(d.item_key) : null,
      })).filter((d) => d.pages.length);
      return Response.json({ documents });
    }

    if (body.action === 'build') {
      const sources = (body.sources || []).slice(0, MAX_SOURCES);
      const picks = (body.pages || []).slice(0, MAX_PAGES);
      if (!sources.length || !picks.length) return Response.json({ error: 'Pick at least one page' }, { status: 400 });
      const sb = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
      const loaded = [];
      for (const url of sources) {
        const path = pathFromUrl(url);
        if (path) {
          if (!(await canAccess(me, parsePath(path), base44.entities))) return Response.json({ error: 'Not allowed to use one of those files' }, { status: 403 });
        } else if (!(sb && String(url || '').startsWith(`${sb}/storage/v1/object/public/`))) {
          return Response.json({ error: 'That file can\'t be edited here' }, { status: 400 });
        }
        const bytes = await readFileBytes(url);
        const kind = kindOf(bytes);
        if (!kind) return Response.json({ error: 'Only PDFs and JPG/PNG photos can be edited' }, { status: 400 });
        loaded.push({ kind, bytes, pdf: kind === 'pdf' ? await PDFDocument.load(bytes, { ignoreEncryption: true }) : null });
      }
      const out = await PDFDocument.create();
      for (const pick of picks) {
        const src = loaded[Number(pick.s) || 0];
        if (!src) return Response.json({ error: 'Unknown source' }, { status: 400 });
        const rot = ((Math.round((Number(pick.r) || 0) / 90) * 90) % 360 + 360) % 360;
        if (src.kind === 'pdf') {
          const idx = Number(pick.p) || 0;
          if (idx < 0 || idx >= src.pdf.getPageCount()) return Response.json({ error: 'Page out of range' }, { status: 400 });
          const [page] = await out.copyPages(src.pdf, [idx]);
          page.setRotation(degrees((page.getRotation().angle + rot) % 360));
          out.addPage(page);
        } else {
          const img = src.kind === 'jpg' ? await out.embedJpg(src.bytes) : await out.embedPng(src.bytes);
          const width = 612;
          const height = Math.min(1008, (img.height / img.width) * width);
          const page = out.addPage([width, height]);
          const scale = Math.min(width / img.width, height / img.height);
          page.drawImage(img, { x: (width - img.width * scale) / 2, y: height - img.height * scale, width: img.width * scale, height: img.height * scale });
          if (rot) page.setRotation(degrees(rot));
        }
      }
      const bytes = await out.save();
      const brokerageId = tx?.brokerage_id || me.brokerage_id || (me.role === 'super_admin' ? 'platform' : null);
      if (!brokerageId) return Response.json({ error: 'Join a brokerage first' }, { status: 400 });
      const scope = tx ? { kind: 'tx', id: tx.id } : { kind: 'user', id: me.id };
      const name = `${String(body.name || 'Document').replace(/\.pdf$/i, '').slice(0, 120)}.pdf`;
      const file_url = await storePrivate(scopeFolder(brokerageId, scope), name, bytes, 'application/pdf');
      return Response.json({ file_url, page_count: out.getPageCount(), name });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    console.error('docTools:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
