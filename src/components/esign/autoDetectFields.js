import { base44 } from '@/api/base44Client';
import { stackRatio } from '../../../shared/esignGeometry.js';

// "Auto-place fields with AI".
// 1. Read the PDF's text with pdf.js and find blanks: runs of underscores and
//    "Signature / Initials / Date" labels. Their positions come from the PDF itself.
// 2. Ask the AI only which signer and field type each blank is.
// 3. Turn them into fields in the editor's coordinate system.

const SIZES = { signature: 0.30, initial: 0.09, date: 0.18, text: 0.30 }; // width, fraction of page width
const HEIGHTS = { signature: 0.05, initial: 0.04, date: 0.028, text: 0.028 }; // height, fraction of page width

async function loadPdf(url) {
  const lib = await import('pdfjs-dist');
  lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.js`;
  return lib.getDocument({ url, withCredentials: false }).promise;
}

export async function findBlanks(url) {
  const pdf = await loadPdf(url);
  const pages = [];
  const candidates = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    pages.push({ width: vp.width, height: vp.height });
    const { items } = await page.getTextContent();
    // Group items into lines by baseline.
    const rows = [];
    for (const it of items) {
      if (!it.str) continue;
      const [x, y] = [it.transform[4], it.transform[5]];
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, str: it.str, width: it.width });
    }
    rows.sort((a, b) => b.y - a.y);
    rows.forEach((row, ri) => {
      row.parts.sort((a, b) => a.x - b.x);
      const lineText = row.parts.map((q) => q.str).join(' ');
      const above = rows[ri - 1]?.parts.map((q) => q.str).join(' ') || '';
      const below = rows[ri + 1]?.parts.map((q) => q.str).join(' ') || '';
      for (const part of row.parts) {
        const re = /_{4,}/g;
        let m;
        while ((m = re.exec(part.str))) {
          const perChar = part.width / Math.max(part.str.length, 1);
          const x0 = part.x + perChar * m.index;
          const w = perChar * m[0].length;
          if (w < 18) continue;
          const before = part.str.slice(0, m.index).slice(-40);
          candidates.push({
            id: `c${candidates.length}`,
            page: p,
            pageIndex: p - 1,
            x: x0, w, baseline: row.y,
            context: `${above.slice(-60)} || ${before} [BLANK] ${part.str.slice(m.index + m[0].length, m.index + m[0].length + 30)} || ${lineText.slice(0, 80)} || ${below.slice(0, 60)}`,
          });
        }
      }
    });
  }
  return { pages, candidates };
}

export async function autoDetectFields({ doc, signers }) {
  const { pages, candidates } = await findBlanks(doc.document_url);
  if (!candidates.length) return [];
  const res = await base44.functions.invoke('aiAssignFields', {
    title: doc.title,
    signers: (signers || []).map((s) => ({ name: s.name, email: s.email, role: s.role })),
    candidates: candidates.map(({ id, page, context }) => ({ id, page, context })),
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const ratio = stackRatio(pages);
  const offsets = [];
  pages.reduce((acc, p, i) => { offsets[i] = acc; return acc + p.height / p.width; }, 0);

  const out = [];
  for (const a of res.data?.assignments || []) {
    const c = byId.get(a.id);
    if (!c || a.type === 'skip' || !SIZES[a.type]) continue;
    const pg = pages[c.pageIndex];
    const hUnits = HEIGHTS[a.type];
    const wPts = Math.min(Math.max(c.w, SIZES[a.type] * pg.width * 0.6), SIZES[a.type] * pg.width * 1.3);
    // Box sits on the line: bottom edge just above the baseline.
    const topUnits = offsets[c.pageIndex] + (pg.height - c.baseline - 1) / pg.width - hUnits;
    out.push({
      id: `field-ai-${Date.now()}-${out.length}`,
      type: a.type,
      x: Math.max(0, Math.min((c.x / pg.width) * 100, 100 - (wPts / pg.width) * 100)),
      width: (wPts / pg.width) * 100,
      y: Math.max(0, (topUnits / ratio) * 100),
      hPct: (hUnits / ratio) * 100,
      required: a.type !== 'text',
      value: '',
      signer_index: Math.max(0, Math.min(Number(a.signer_index) || 0, Math.max((signers || []).length - 1, 0))),
      auto: true,
    });
  }
  return out;
}
