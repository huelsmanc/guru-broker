// Small PDF writer for statements and CDAs (pdf-lib, standard fonts).
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ASCII = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');

export const money = (n) => `${Number(n) < 0 ? '-' : ''}$${Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function createDoc() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 740;
  const M = 50;
  const W = 512;
  const ensure = (h) => { if (y - h < 50) { page = pdf.addPage([612, 792]); y = 740; } };
  const api = {
    pdf,
    text(t, { size = 10, isBold = false, x = M, color, gap } = {}) {
      ensure(size + 6);
      page.drawText(ASCII(t), { x, y, size, font: isBold ? bold : font, color: color || rgb(0.12, 0.14, 0.2) });
      y -= gap ?? size + 5;
    },
    heading(t) { api.space(6); api.text(t, { size: 13, isBold: true, gap: 20 }); },
    title(t, sub) { api.text(t, { size: 18, isBold: true, gap: 24 }); if (sub) api.text(sub, { size: 10, color: rgb(0.4, 0.42, 0.48), gap: 22 }); },
    space(h = 8) { y -= h; },
    rule() { ensure(10); page.drawLine({ start: { x: M, y: y + 4 }, end: { x: M + W, y: y + 4 }, thickness: 0.6, color: rgb(0.8, 0.82, 0.86) }); y -= 8; },
    // columns: [{ text, width, align }]
    row(cols, { isBold = false, size = 9 } = {}) {
      ensure(size + 6);
      let x = M;
      for (const c of cols) {
        const t = ASCII(c.text);
        const f = isBold ? bold : font;
        const w = f.widthOfTextAtSize(t, size);
        const tx = c.align === 'right' ? x + c.width - w : x;
        page.drawText(t.length > 90 ? `${t.slice(0, 88)}..` : t, { x: tx, y, size, font: f, color: rgb(0.12, 0.14, 0.2) });
        x += c.width;
      }
      y -= size + 6;
    },
    // Wrapped paragraph text.
    para(t, { size = 10, isBold = false, indent = 0, color, gap = 4 } = {}) {
      const f = isBold ? bold : font;
      const max = W - indent;
      for (const raw of ASCII(t).split('\n')) {
        let line = '';
        for (const word of raw.split(/\s+/).filter(Boolean)) {
          const test = line ? `${line} ${word}` : word;
          if (f.widthOfTextAtSize(test, size) > max && line) { ensure(size + 4); page.drawText(line, { x: M + indent, y, size, font: f, color: color || rgb(0.12, 0.14, 0.2) }); y -= size + 3; line = word; } else line = test;
        }
        ensure(size + 4);
        if (line) page.drawText(line, { x: M + indent, y, size, font: f, color: color || rgb(0.12, 0.14, 0.2) });
        y -= size + 3;
      }
      y -= gap;
    },
    checkbox(label, { size = 10, indent = 0 } = {}) {
      ensure(size + 8);
      page.drawRectangle({ x: M + indent, y: y - 1, width: 9, height: 9, borderWidth: 0.8, borderColor: rgb(0.2, 0.2, 0.2) });
      page.drawText(ASCII(label), { x: M + indent + 15, y, size, font, color: rgb(0.12, 0.14, 0.2) });
      y -= size + 8;
    },
    /** Where the next signature line will be: { pageIndex, top } (top in points from the page top). */
    position() { return { pageIndex: pdf.getPageCount() - 1, top: 792 - y }; },
    signatureLine(label) {
      ensure(50);
      y -= 28;
      const at = { pageIndex: pdf.getPageCount() - 1, lineY: y };
      page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      page.drawLine({ start: { x: M + 300, y }, end: { x: M + 440, y }, thickness: 0.8, color: rgb(0.2, 0.2, 0.2) });
      y -= 12;
      page.drawText(ASCII(label), { x: M, y, size: 9, font });
      page.drawText('Date', { x: M + 300, y, size: 9, font });
      y -= 10;
      return at; // where the line is, so signing boxes can be placed on it
    },
    async save() { return pdf.save(); },
  };
  return api;
}
