import { base44 } from '@/api/base44Client';
import { stackRatio } from '../../../shared/esignGeometry.js';

// "Auto-place fields with AI" / "Fill with AI".
// 1. Read the PDF with pdf.js and find blanks: runs of underscores in the text, and drawn
//    horizontal lines (most official forms draw their blanks as lines). Positions come from
//    the PDF itself, so boxes land exactly on the lines.
// 2. Ask the AI what each blank is: a signer's signature/initials/date/entry, or something
//    the agent fills in (and, given the deal or offer, what to write there).
// 3. Turn them into fields in the editor's coordinate system.

const SIZES = { signature: 0.30, initial: 0.09, date: 0.18, text: 0.30 }; // width, fraction of page width
const HEIGHTS = { signature: 0.05, initial: 0.04, date: 0.028, text: 0.028 }; // height, fraction of page width

let libPromise;
async function loadLib() {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.js`;
      return lib;
    });
  }
  return libPromise;
}
async function loadPdf(url) {
  const lib = await loadLib();
  return lib.getDocument({ url, withCredentials: false }).promise;
}

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];

/** Horizontal lines drawn on a page (in PDF points, y up): [{ x0, x1, y }]. */
export function drawnLines(opList, OPS) {
  let ctm = [1, 0, 0, 1, 0, 0];
  const stack = [];
  const segs = [];
  const at = (x, y) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]];
  const add = (a, b) => {
    if (Math.abs(a[1] - b[1]) > 0.8) return;
    const x0 = Math.min(a[0], b[0]); const x1 = Math.max(a[0], b[0]);
    if (x1 - x0 >= 24) segs.push({ x0, x1, y: (a[1] + b[1]) / 2 });
  };
  const { fnArray, argsArray } = opList;
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]; const args = argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() || ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args);
    else if (fn === OPS.constructPath) {
      const [sub, coords] = args;
      let k = 0; let cur = null; let start = null;
      for (const op of sub) {
        if (op === OPS.moveTo) { cur = at(coords[k], coords[k + 1]); start = cur; k += 2; }
        else if (op === OPS.lineTo) { const nxt = at(coords[k], coords[k + 1]); if (cur) add(cur, nxt); cur = nxt; k += 2; }
        else if (op === OPS.curveTo) { cur = at(coords[k + 4], coords[k + 5]); k += 6; }
        else if (op === OPS.curveTo2 || op === OPS.curveTo3) { cur = at(coords[k + 2], coords[k + 3]); k += 4; }
        else if (op === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(k, k + 4); k += 4;
          const a = at(x, y); const b = at(x + w, y + h);
          // A thin filled rectangle is how many PDFs draw a line.
          if (Math.abs(b[1] - a[1]) <= 2.5 && Math.abs(b[0] - a[0]) >= 24) segs.push({ x0: Math.min(a[0], b[0]), x1: Math.max(a[0], b[0]), y: (a[1] + b[1]) / 2 });
        } else if (op === OPS.closePath) { cur = start; }
      }
    }
  }
  // Merge pieces of the same line.
  segs.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const out = [];
  for (const sg of segs) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.y - sg.y) < 1 && sg.x0 <= last.x1 + 2) last.x1 = Math.max(last.x1, sg.x1);
    else out.push({ ...sg });
  }
  return out;
}

export async function findBlanks(url) {
  const lib = await loadLib();
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
    const pageStart = candidates.length;
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

    // Blanks drawn as lines.
    let lines = [];
    try { lines = drawnLines(await page.getOperatorList(), lib.OPS); } catch { lines = []; }
    const textOf = (r) => (r ? r.parts.map((q) => q.str).join(' ') : '');
    for (const ln of lines) {
      if (ln.x1 - ln.x0 > vp.width * 0.97) continue; // page borders
      // Already found as underscores?
      if (candidates.slice(pageStart).some((c) => Math.abs(c.baseline - ln.y) < 5 && c.x < ln.x1 && c.x + c.w > ln.x0)) continue;
      // Underlined text (a heading, a filled-in value) isn't a blank.
      const over = items.filter((it) => it.str?.trim() && it.transform[5] > ln.y - 1 && it.transform[5] < ln.y + 12 && it.transform[4] < ln.x1 && it.transform[4] + it.width > ln.x0)
        .reduce((sum, it) => sum + Math.min(it.transform[4] + it.width, ln.x1) - Math.max(it.transform[4], ln.x0), 0);
      if (over > (ln.x1 - ln.x0) * 0.5) continue;
      const ri = rows.findIndex((r) => Math.abs(r.y - ln.y) < 9);
      const row = ri >= 0 ? rows[ri] : null;
      const left = row ? row.parts.filter((q) => q.x < ln.x0).map((q) => q.str).join(' ').slice(-50) : '';
      const right = row ? row.parts.filter((q) => q.x >= ln.x1 - 2).map((q) => q.str).join(' ').slice(0, 30) : '';
      const aboveRow = rows.find((r) => r.y > ln.y + 9 && r.y < ln.y + 30);
      const belowRow = [...rows].reverse().find((r) => r.y < ln.y - 2 && r.y > ln.y - 22);
      candidates.push({
        id: `c${candidates.length}`, page: p, pageIndex: p - 1,
        x: ln.x0, w: ln.x1 - ln.x0, baseline: ln.y + 1,
        context: `${textOf(aboveRow).slice(-60)} || ${left} [BLANK] ${right} || ${textOf(row).slice(0, 80)} || ${textOf(belowRow).slice(0, 60)}`,
      });
    }
  }
  return { pages, candidates };
}

export async function autoDetectFields({ doc, signers, facts, existing = [] }) {
  const { pages, candidates } = await findBlanks(doc.document_url);
  if (!candidates.length) return [];
  const res = await base44.functions.invoke('aiAssignFields', {
    title: doc.title,
    signers: (signers || []).map((s) => ({ name: s.name, email: s.email, role: s.role })),
    candidates: candidates.map(({ id, page, context }) => ({ id, page, context })),
    facts: facts || undefined,
  });
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const ratio = stackRatio(pages);
  const offsets = [];
  pages.reduce((acc, p, i) => { offsets[i] = acc; return acc + p.height / p.width; }, 0);

  const out = [];
  for (const a of res.data?.assignments || []) {
    const c = byId.get(a.id);
    const isFill = a.type === 'fill'; // the agent fills it in (with the AI's value when it knew it)
    if (!c || a.type === 'skip' || (!SIZES[a.type] && !isFill)) continue;
    const type = isFill ? 'text' : a.type;
    const pg = pages[c.pageIndex];
    const hUnits = HEIGHTS[type];
    // Fill-ins take the whole blank; signer boxes are sized to their kind.
    const wPts = isFill || type === 'text' ? Math.max(c.w, 40) : Math.min(Math.max(c.w, SIZES[type] * pg.width * 0.6), SIZES[type] * pg.width * 1.3);
    // Box sits on the line: bottom edge just above the baseline.
    const topUnits = offsets[c.pageIndex] + (pg.height - c.baseline - 1) / pg.width - hUnits;
    const box = {
      id: `field-ai-${Date.now()}-${out.length}`,
      type,
      x: Math.max(0, Math.min((c.x / pg.width) * 100, 100 - (wPts / pg.width) * 100)),
      width: (wPts / pg.width) * 100,
      y: Math.max(0, (topUnits / ratio) * 100),
      hPct: (hUnits / ratio) * 100,
      required: type !== 'text',
      value: isFill ? String(a.value || '').slice(0, 500) : '',
      ...(isFill ? { sender_fill: true, label: String(a.label || '').slice(0, 60) || undefined, from_deal: !!a.value } : {}),
      signer_index: Math.max(0, Math.min(Number(a.signer_index) || 0, Math.max((signers || []).length - 1, 0))),
      auto: true,
    };
    // Don't stack a box on top of one that's already there.
    const overlaps = [...existing, ...out].some((f) => Math.abs(Number(f.y) - box.y) < box.hPct * 1.2 && Number(f.x) < box.x + box.width && Number(f.x) + Number(f.width || 0) > box.x);
    if (!overlaps) out.push(box);
  }
  return out;
}
