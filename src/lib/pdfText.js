// Text of each page of a PDF, read in the browser with pdf.js (no upload, no AI).
let libPromise;
function loadLib() {
  if (!libPromise) {
    libPromise = import('pdfjs-dist').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${lib.version}/pdf.worker.min.js`;
      return lib;
    });
  }
  return libPromise;
}

/** Opens a PDF (File/Blob or URL) with pdf.js. */
export async function openPdf(source) {
  const lib = await loadLib();
  const data = source instanceof Blob ? { data: new Uint8Array(await source.arrayBuffer()) } : { url: source, withCredentials: false };
  return lib.getDocument(data).promise;
}

/** A small picture of one page (data URL), `width` pixels wide. */
export async function pageThumb(pdf, n, width = 180) {
  const page = await pdf.getPage(n);
  const vp1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: (width * Math.min(window.devicePixelRatio || 1, 2)) / vp1.width });
  const canvas = document.createElement('canvas');
  canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
  await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
  return canvas.toDataURL('image/jpeg', 0.7);
}

/** Text of one page, lines in reading order. */
export async function pageText(pdf, n) {
  const page = await pdf.getPage(n);
  const { items } = await page.getTextContent();
  const rows = [];
  for (const it of items) {
    if (!it.str?.trim()) continue;
    const y = Math.round(it.transform[5]);
    let row = rows.find((r) => Math.abs(r.y - y) < 3);
    if (!row) rows.push((row = { y, parts: [] }));
    row.parts.push({ x: it.transform[4], s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join(' ')).join('\n').replace(/[ \t]+/g, ' ');
}

/** source: a File/Blob or a URL. Returns [{ n, text }] with lines kept in reading order. */
export async function pdfPageTexts(source, { onProgress } = {}) {
  const lib = await loadLib();
  const data = source instanceof Blob ? { data: new Uint8Array(await source.arrayBuffer()) } : { url: source, withCredentials: false };
  const pdf = await lib.getDocument(data).promise;
  const out = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const { items } = await page.getTextContent();
    // Group into lines by baseline, top to bottom, left to right.
    const rows = [];
    for (const it of items) {
      if (!it.str?.trim()) continue;
      const y = Math.round(it.transform[5]);
      let row = rows.find((r) => Math.abs(r.y - y) < 3);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x: it.transform[4], s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    out.push({ n, text: rows.map((r) => r.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ')).join('\n').replace(/[ \t]+/g, ' ') });
    onProgress?.(n, pdf.numPages);
  }
  return out;
}

/** Splits pages into groups of about `maxChars` characters (a page is never split). */
export function chunkPages(pages, maxChars = 14000) {
  const chunks = [];
  let cur = []; let size = 0;
  for (const p of pages) {
    const len = Math.min(p.text.length, 9000);
    if (cur.length && size + len > maxChars) { chunks.push(cur); cur = []; size = 0; }
    cur.push(p); size += len;
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}
