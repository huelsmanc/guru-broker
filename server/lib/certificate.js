// Certificate of completion for a passed training: landscape letter page with the brokerage's
// logo and color, the agent's name, the class, the score and date, and the broker's signature.
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const ASCII = (s) => String(s ?? '')
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');

function color(hex, fallback = [0.12, 0.2, 0.36]) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || ''));
  if (!m) return rgb(...fallback);
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  // Very light brand colors would vanish on white paper: darken them.
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const k = lum > 0.6 ? 0.55 : 1;
  return rgb(r * k, g * k, b * k);
}

async function embedImage(pdf, bytes) {
  if (!bytes?.length) return null;
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (b[0] === 0x89 && b[1] === 0x50) return await pdf.embedPng(b);
    if (b[0] === 0xff && b[1] === 0xd8) return await pdf.embedJpg(b);
  } catch { /* unreadable picture: leave it out */ }
  return null;
}

export const certificateNumber = (attempt) => `${String(attempt.created_date || new Date().toISOString()).slice(0, 4)}-${String(attempt.id || '').slice(0, 8).toUpperCase()}`;

/**
 * @param {object} o
 *   agentName, trainingTitle, kind ('class'|'quiz'), score, date (Date|string), minutes,
 *   brokerageName, brandColor, logoBytes, signer: { name, title, signatureBytes }, number
 */
export async function buildCertificate(o) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(ASCII(`Certificate - ${o.trainingTitle} - ${o.agentName}`));
  pdf.setAuthor(ASCII(o.brokerageName || 'Guru Broker'));
  const W = 792, H = 612;
  const page = pdf.addPage([W, H]);
  const serif = await pdf.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanBoldItalic);
  const sans = await pdf.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.11, 0.13, 0.18);
  const soft = rgb(0.38, 0.41, 0.47);
  const brand = color(o.brandColor);

  // Frame: a brand-colored border with a thin inner line.
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: rgb(1, 1, 1) });
  page.drawRectangle({ x: 22, y: 22, width: W - 44, height: H - 44, borderColor: brand, borderWidth: 5 });
  page.drawRectangle({ x: 34, y: 34, width: W - 68, height: H - 68, borderColor: brand, borderWidth: 0.8, opacity: 0 });

  const center = (text, y, font, size, c = ink) => {
    let t = ASCII(text), s = size;
    while (font.widthOfTextAtSize(t, s) > W - 140 && s > 9) s -= 1;
    page.drawText(t, { x: (W - font.widthOfTextAtSize(t, s)) / 2, y, size: s, font, color: c });
    return s;
  };

  let y = H - 70;
  const logo = await embedImage(pdf, o.logoBytes);
  if (logo) {
    const sc = Math.min(150 / logo.width, 56 / logo.height, 1);
    const w = logo.width * sc, h = logo.height * sc;
    page.drawImage(logo, { x: (W - w) / 2, y: y - h + 8, width: w, height: h });
    y -= h + 14;
  } else {
    y -= 6;
  }
  if (o.brokerageName) { center(String(o.brokerageName).toUpperCase(), y, sansBold, 11, brand); y -= 40; } else y -= 24;

  center('CERTIFICATE OF COMPLETION', y, serifBold, 30, ink); y -= 34;
  center('This certifies that', y, serif, 14, soft); y -= 46;
  center(o.agentName || 'Agent', y, script, 36, ink);
  page.drawLine({ start: { x: W / 2 - 200, y: y - 10 }, end: { x: W / 2 + 200, y: y - 10 }, thickness: 0.8, color: brand });
  y -= 38;
  center(`has successfully completed the ${o.kind === 'class' ? 'class' : 'course'}`, y, serif, 14, soft); y -= 30;
  center(o.trainingTitle || 'Training', y, serifBold, 22, ink); y -= 26;
  const when = new Date(o.date || Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' });
  center(`with a score of ${Math.round(Number(o.score) || 0)}%${o.minutes ? `  |  about ${o.minutes} minutes` : ''}`, y, serif, 13, soft);

  // Signature (left) and date (right).
  const lineY = 112;
  const leftX = 110, rightX = W - 110 - 220;
  const sig = await embedImage(pdf, o.signer?.signatureBytes);
  if (sig) {
    const sc = Math.min(220 / sig.width, 58 / sig.height);
    page.drawImage(sig, { x: leftX + (220 - sig.width * sc) / 2, y: lineY + 4, width: sig.width * sc, height: sig.height * sc });
  } else if (o.signer?.name) {
    const t = ASCII(o.signer.name); let s = 26;
    while (script.widthOfTextAtSize(t, s) > 220 && s > 12) s -= 1;
    page.drawText(t, { x: leftX + (220 - script.widthOfTextAtSize(t, s)) / 2, y: lineY + 10, size: s, font: script, color: rgb(0.1, 0.16, 0.38) });
  }
  page.drawLine({ start: { x: leftX, y: lineY }, end: { x: leftX + 220, y: lineY }, thickness: 0.8, color: ink });
  const under = (x, lines) => lines.filter(Boolean).forEach((t, i) => {
    const font = i === 0 ? sansBold : sans, size = i === 0 ? 10 : 9;
    const txt = ASCII(t);
    page.drawText(txt, { x: x + (220 - font.widthOfTextAtSize(txt, size)) / 2, y: lineY - 14 - i * 12, size, font, color: i === 0 ? ink : soft });
  });
  under(leftX, [o.signer?.name || 'Broker', o.signer?.title || 'Broker', o.brokerageName]);

  const dt = ASCII(when);
  page.drawText(dt, { x: rightX + (220 - serif.widthOfTextAtSize(dt, 16)) / 2, y: lineY + 10, size: 16, font: serif, color: ink });
  page.drawLine({ start: { x: rightX, y: lineY }, end: { x: rightX + 220, y: lineY }, thickness: 0.8, color: ink });
  under(rightX, ['Date completed', o.number ? `Certificate no. ${o.number}` : null]);

  // Seal in the middle.
  const cx = W / 2, cy = lineY + 6;
  page.drawCircle({ x: cx, y: cy, size: 30, color: brand });
  page.drawCircle({ x: cx, y: cy, size: 25, borderColor: rgb(1, 1, 1), borderWidth: 1, opacity: 0 });
  const p = 'PASSED';
  page.drawText(p, { x: cx - sansBold.widthOfTextAtSize(p, 9) / 2, y: cy - 3, size: 9, font: sansBold, color: rgb(1, 1, 1) });

  return pdf.save();
}
