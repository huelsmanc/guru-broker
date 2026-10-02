// Turns an on-screen design into a print-ready file: drawn at 300 dpi at trim size, then given a
// 1/8" bleed by stretching the edge pixels outward (so nothing important moves toward the cut).
import { jsPDF } from 'jspdf';
import { base44 } from '@/api/base44Client';
import { inlineImages } from '@/lib/inlineImages';
import { BLEED, PRODUCTS, printPixels } from '../../shared/print.js';

const loadHtmlToImage = () => import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm');
export const DPI = 300;
const CSS_DPI = 96;
const isSafari = () => /^((?!chrome|android|crios|fxios).)*safari/i.test(navigator.userAgent);

/** Draws a DOM node (laid out at trim size, 96 px per inch) to a canvas at 300 dpi. */
export async function drawTrim(node) {
  const { toCanvas } = await loadHtmlToImage();
  await inlineImages(node);
  const opts = { pixelRatio: DPI / CSS_DPI, cacheBust: false, backgroundColor: '#ffffff' };
  let canvas = await toCanvas(node, opts);
  if (isSafari()) canvas = await toCanvas(node, opts);
  return canvas;
}

/** Adds the bleed around a trim-size canvas by extending its edges; the result is exactly the printer's pixel size. */
export function addBleed(trim, productKey) {
  const [tw, th] = PRODUCTS[productKey].trim;
  const W = Math.round(tw * DPI); const H = Math.round(th * DPI);
  const full = printPixels(productKey, DPI);
  let src = trim;
  if (trim.width !== W || trim.height !== H) { // html-to-image can be a pixel off
    src = document.createElement('canvas'); src.width = W; src.height = H;
    src.getContext('2d').drawImage(trim, 0, 0, W, H);
  }
  const l = Math.floor((full.w - W) / 2); const r = full.w - W - l;
  const t = Math.floor((full.h - H) / 2); const b = full.h - H - t;
  const out = document.createElement('canvas');
  out.width = full.w; out.height = full.h;
  const g = out.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(src, l, t);
  g.drawImage(src, 0, 0, 1, H, 0, t, l, H); // left
  g.drawImage(src, W - 1, 0, 1, H, l + W, t, r, H); // right
  g.drawImage(src, 0, 0, W, 1, l, 0, W, t); // top
  g.drawImage(src, 0, H - 1, W, 1, l, t + H, W, b); // bottom
  g.drawImage(src, 0, 0, 1, 1, 0, 0, l, t); // corners
  g.drawImage(src, W - 1, 0, 1, 1, l + W, 0, r, t);
  g.drawImage(src, 0, H - 1, 1, 1, 0, t + H, l, b);
  g.drawImage(src, W - 1, H - 1, 1, 1, l + W, t + H, r, b);
  return out;
}

export const toBlob = (canvas, type = 'image/png', quality = 0.92) => new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the print file'))), type, quality));

/** A PDF with one page per canvas, sized to the product's trim plus bleed. */
export function makePdf(productKey, canvases) {
  const [w, h] = PRODUCTS[productKey].trim;
  const pw = w + BLEED * 2; const ph = h + BLEED * 2; // 1/8" each side
  const doc = new jsPDF({ unit: 'in', format: [pw, ph], orientation: pw > ph ? 'landscape' : 'portrait' });
  canvases.forEach((c, i) => {
    if (i > 0) doc.addPage([pw, ph], pw > ph ? 'landscape' : 'portrait');
    doc.addImage(c.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, pw, ph);
  });
  return doc.output('blob');
}

/** Uploads a print file into the agent's own private folder. */
export async function uploadPrintFile(user, blob, name) {
  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });
  const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'user', id: user.id } });
  return file_url;
}
