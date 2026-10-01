// CMA report PDF: a branded listing-presentation style layout.
//   Page 1  cover: brokerage header, house photo, address, suggested price, key numbers, agent
//   Page 2+ comparable sales as photo cards
//   Last    side-by-side table, price range chart, market notes, disclaimer
// Images are passed in as data URLs (JPEG/PNG); anything else is skipped.
import { jsPDF } from 'jspdf';

const W = 215.9; // US Letter, mm
const H = 279.4;
const M = 16; // margin
const CW = W - M * 2;

const hex = (h, fallback = [31, 61, 43]) => {
  const m = String(h || '').trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
// Keep the brand color dark enough for white text on it.
const usable = (rgb) => { let c = rgb; for (let i = 0; i < 6 && lum(c) > 0.5; i++) c = c.map((v) => Math.round(v * 0.8)); return c; };
const tint = (rgb, k) => rgb.map((v) => Math.round(v + (255 - v) * k));

const INK = [24, 28, 33];
const MUTED = [104, 112, 122];
const LINE = [226, 229, 233];
const SOFT = [246, 247, 249];

// Standard PDF fonts only know Western characters: swap the rest.
const clean = (s) => String(s ?? '')
  .replace(/[≈∼]/g, '~').replace(/[–—]/g, '-').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/•/g, '·').replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ]/g, '')
  .replace(/\s+/g, ' ').trim();
const num = (v) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isFinite(n) && n > 0 ? n : null; };
const money = (v) => { const n = num(v); return n ? `$${Math.round(n).toLocaleString('en-US')}` : '-'; };
const short = (v) => { const n = num(v); if (!n) return '-'; return n >= 1e6 ? `$${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(n / 1000)}K`; };
const fmtDate = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '-'; };
const imgType = (data) => { const m = typeof data === 'string' && data.match(/^data:image\/(jpeg|jpg|png);base64,/i); return m ? (m[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG') : null; };

/** "$500,000 - $550,000", "$480K-$525K", "around $525,000" -> { low, high } */
export function parseRange(text) {
  const vals = [...String(text || '').matchAll(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/g)]
    .map(([, n, u]) => { let v = Number(n.replace(/,/g, '')); if (/k/i.test(u || '')) v *= 1e3; if (/m/i.test(u || '')) v *= 1e6; return v; })
    .filter((v) => v >= 20000);
  if (!vals.length) return null;
  return { low: Math.min(...vals), high: Math.max(...vals) };
}

export function buildCmaPdf({ address, beds, baths, report, subjectPhoto, compPhotos = [], brand = {}, agent = {}, generatedAt = new Date() }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'letter', compress: true });
  const C = usable(hex(brand.color));
  const comps = (report?.comparables || []).filter(Boolean).slice(0, 8);
  const ma = report?.marketAnalysis || {};
  const range = parseRange(ma.recommendedPriceRange);
  const sold = comps.map((c) => num(c.soldPrice)).filter(Boolean);
  const median = sold.length ? [...sold].sort((a, b) => a - b)[Math.floor(sold.length / 2)] : null;
  const ppsf = comps.map((c) => (num(c.soldPrice) && num(c.sqft) ? num(c.soldPrice) / num(c.sqft) : null)).filter(Boolean);
  const avgPpsf = num(ma.avgPricePerSqft) || (ppsf.length ? ppsf.reduce((a, b) => a + b, 0) / ppsf.length : null);
  const doms = comps.map((c) => Number(c.daysOnMarket)).filter((n) => Number.isFinite(n) && n >= 0);
  const avgDom = Number.isFinite(Number(ma.avgDaysOnMarket)) && Number(ma.avgDaysOnMarket) > 0 ? Number(ma.avgDaysOnMarket) : (doms.length ? doms.reduce((a, b) => a + b, 0) / doms.length : null);
  const [street, ...rest] = clean(address).split(',');
  const cityLine = rest.join(',').trim();
  const titleCase = (s) => s.replace(/\b([a-z])([a-z]*)/g, (_, a, b) => a.toUpperCase() + b).replace(/\b(Ct|Ny|Nj|Ma|Ri|Ca|Fl|Tx)\b(?=\s*\d|$)/g, (s2) => s2.toUpperCase());

  const font = (size, style = 'normal', color = INK) => { pdf.setFont('helvetica', style); pdf.setFontSize(size); pdf.setTextColor(...color); };
  const box = (x, y, w, h, fill, r = 2.5, stroke) => {
    pdf.setFillColor(...fill);
    if (stroke) { pdf.setDrawColor(...stroke); pdf.setLineWidth(0.25); }
    pdf.roundedRect(x, y, w, h, r, r, stroke ? 'FD' : 'F');
  };
  const text = (s, x, y, opts) => pdf.text(clean(s), x, y, opts);
  const wrap = (s, w) => pdf.splitTextToSize(clean(s), w);
  const image = (data, x, y, w, h) => {
    const t = imgType(data);
    if (!t) return false;
    try {
      // Cover-crop: keep the box size, trim the image's overflow by drawing it larger under a clip.
      const p = pdf.getImageProperties(data);
      const k = Math.max(w / p.width, h / p.height);
      const iw = p.width * k; const ih = p.height * k;
      pdf.saveGraphicsState();
      pdf.rect(x, y, w, h, null); pdf.clip(); pdf.discardPath();
      pdf.addImage(data, t, x - (iw - w) / 2, y - (ih - h) / 2, iw, ih, undefined, 'FAST');
      pdf.restoreGraphicsState();
      return true;
    } catch { return false; }
  };
  const placeholder = (x, y, w, h, label = 'No photo available') => {
    box(x, y, w, h, SOFT, 0);
    font(8, 'normal', MUTED); text(label, x + w / 2, y + h / 2 + 1, { align: 'center' });
  };

  let page = 1;
  const header = (title) => {
    pdf.setFillColor(...C); pdf.rect(0, 0, W, 3, 'F');
    font(8, 'bold', C); text((brand.name || 'Comparative Market Analysis').toUpperCase(), M, 12);
    font(8, 'normal', MUTED); text(`${titleCase(street || '')}  ·  CMA`, W - M, 12, { align: 'right' });
    font(18, 'bold'); text(title, M, 25);
    return 33;
  };
  const footer = () => {
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.25); pdf.line(M, H - 14, W - M, H - 14);
    font(7.5, 'normal', MUTED);
    const who = [agent.name, agent.phone, agent.email].filter(Boolean).join('  ·  ');
    text(who || brand.name || '', M, H - 9);
    text(`Page ${page}`, W - M, H - 9, { align: 'right' });
  };
  const newPage = (title) => { footer(); pdf.addPage(); page += 1; return header(title); };

  // ---------- Page 1: cover ----------
  const bandH = 26;
  pdf.setFillColor(...C); pdf.rect(0, 0, W, bandH, 'F');
  let lx = M;
  if (brand.logo && imgType(brand.logo)) {
    try {
      const p = pdf.getImageProperties(brand.logo);
      const lh = 14; const lw = Math.min(46, (p.width / p.height) * lh);
      box(M - 1.5, (bandH - lh) / 2 - 1.5, lw + 3, lh + 3, [255, 255, 255], 2);
      pdf.addImage(brand.logo, imgType(brand.logo), M, (bandH - lh) / 2, lw, lh, undefined, 'FAST');
      lx = M + lw + 6;
    } catch { /* no logo */ }
  }
  font(13, 'bold', [255, 255, 255]); text(brand.name || 'Comparative Market Analysis', lx, bandH / 2 + (brand.tagline ? -0.5 : 2));
  if (brand.tagline) { font(8, 'normal', tint(C, 0.75)); text(brand.tagline, lx, bandH / 2 + 4.5); }
  font(8, 'bold', tint(C, 0.8)); text('COMPARATIVE MARKET ANALYSIS', W - M, bandH / 2 - 0.5, { align: 'right' });
  font(8, 'normal', tint(C, 0.8)); text(fmtDate(generatedAt), W - M, bandH / 2 + 4.5, { align: 'right' });

  let y = bandH;
  const photoH = 92;
  if (!image(subjectPhoto, 0, y, W, photoH)) placeholder(0, y, W, photoH, 'Add a photo of the home in CMA Builder');
  y += photoH + 11;

  // bed/bath chips on the right; the address gets the rest of the line (shrinking to fit)
  const chips = [beds && `${beds} bed`, baths && `${baths} bath`].filter(Boolean);
  let cx = W - M;
  font(9, 'bold', C);
  for (const ch of [...chips].reverse()) {
    const w = pdf.getTextWidth(ch) + 8;
    cx -= w; box(cx, y - 6, w, 7, tint(C, 0.88), 3.5); text(ch, cx + w / 2, y - 1.3, { align: 'center' });
    cx -= 2;
  }
  const title = titleCase(street || clean(address));
  const room = cx - 4 - M;
  let size = 24;
  font(size, 'bold');
  while (size > 15 && pdf.getTextWidth(clean(title)) > room) { size -= 1; font(size, 'bold'); }
  const tl = pdf.splitTextToSize(clean(title), room).slice(0, 2);
  pdf.text(tl, M, y);
  y += (tl.length - 1) * size * 0.42 + 7;
  if (cityLine) { font(11, 'normal', MUTED); text(titleCase(cityLine), M, y); y += 8; } else { y += 2; }

  // Suggested price
  const heroH = 38;
  box(M, y, CW, heroH, tint(C, 0.92), 3);
  pdf.setFillColor(...C); pdf.rect(M, y, 2.2, heroH, 'F');
  font(8.5, 'bold', C); text('SUGGESTED LIST PRICE', M + 8, y + 9);
  font(26, 'bold', C);
  const priceLine = range ? (range.low === range.high ? money(range.low) : `${money(range.low)}  -  ${money(range.high)}`) : clean(ma.recommendedPriceRange || 'See analysis');
  text(priceLine, M + 8, y + 21);
  font(9, 'normal', INK);
  const sum = wrap(report?.summary || '', CW - 16).slice(0, 2);
  pdf.text(sum, M + 8, y + 29);
  y += heroH + 7;

  // Key numbers
  const tiles = [
    ['Comparable sales', comps.length ? String(comps.length) : '-'],
    ['Median sold price', median ? money(median) : '-'],
    ['Avg price / sq ft', avgPpsf ? money(avgPpsf) : '-'],
    ['Avg days on market', avgDom != null ? `${Math.round(avgDom)} days` : '-'],
  ];
  const tw = (CW - 3 * 4) / 4;
  tiles.forEach(([label, value], i) => {
    const x = M + i * (tw + 4);
    box(x, y, tw, 22, [255, 255, 255], 2.5, LINE);
    font(7.5, 'normal', MUTED); text(label, x + 5, y + 8);
    font(14, 'bold'); text(value, x + 5, y + 17);
  });
  y += 30;

  if (ma.marketCondition) {
    font(8.5, 'bold', MUTED); text('MARKET', M, y);
    font(9.5, 'normal'); const ml = wrap(ma.marketCondition, CW - 22).slice(0, 2); pdf.text(ml, M + 22, y);
    y += 10;
  }

  // Prepared by
  const py = Math.max(y + 2, H - 44);
  pdf.setDrawColor(...LINE); pdf.line(M, py, W - M, py);
  let ax = M;
  if (agent.photo && imgType(agent.photo)) { if (image(agent.photo, M, py + 5, 16, 16)) ax = M + 21; }
  font(7.5, 'bold', MUTED); text('PREPARED BY', ax, py + 8);
  font(11, 'bold'); text(agent.name || brand.name || '', ax, py + 14);
  font(8.5, 'normal', MUTED); text([agent.title, brand.name].filter(Boolean).join(', '), ax, py + 19);
  font(8.5, 'normal'); text([agent.phone, agent.email].filter(Boolean).join('   '), W - M, py + 14, { align: 'right' });
  if (brand.phone && brand.phone !== agent.phone) { font(8.5, 'normal', MUTED); text(`Office ${brand.phone}`, W - M, py + 19, { align: 'right' }); }
  footer();

  // ---------- Comparable sales cards ----------
  pdf.addPage(); page += 1;
  y = header('Comparable sales');
  font(9, 'normal', MUTED);
  text(report?.source === 'mls' ? `${comps.length} recent sales from the MLS, chosen for location, size and age.` : `${comps.length} recent nearby sales. Figures from public sources; verify before relying on them.`, M, y - 2);
  y += 4;
  const perRow = comps.length > 4 ? 3 : 2;
  const gap = perRow === 3 ? 4.5 : 6; const cardW = (CW - gap * (perRow - 1)) / perRow;
  const imgH = perRow === 3 ? 38 : 46; const cardH = perRow === 3 ? 102 : 104;
  comps.forEach((c, i) => {
    const col = i % perRow;
    if (col === 0 && i > 0) y += cardH + gap;
    if (col === 0 && y + cardH > H - 18) { y = newPage('Comparable sales (continued)'); }
    const x = M + col * (cardW + gap);
    box(x, y, cardW, cardH, [255, 255, 255], 3, LINE);
    if (!image(compPhotos[i], x + 0.3, y + 0.3, cardW - 0.6, imgH)) placeholder(x + 0.3, y + 0.3, cardW - 0.6, imgH);
    // number + price badge
    box(x + 4, y + 4, 8, 7, [255, 255, 255], 3.5); font(8.5, 'bold', C); text(String(i + 1), x + 8, y + 9, { align: 'center' });
    const badge = short(c.soldPrice); font(10, 'bold', [255, 255, 255]);
    const bw = pdf.getTextWidth(badge) + 7; box(x + cardW - bw - 4, y + 4, bw, 8, C, 4); text(badge, x + cardW - bw / 2 - 4, y + 9.5, { align: 'center' });

    let cy = y + imgH + 7;
    const [cs, ...cr] = clean(c.address).split(',');
    font(perRow === 3 ? 9.5 : 10.5, 'bold'); text(pdf.splitTextToSize(cs, cardW - 8)[0], x + 4, cy);
    font(8, 'normal', MUTED); text(pdf.splitTextToSize(cr.join(',').trim(), cardW - 8)[0] || '', x + 4, cy + 4.5);
    cy += 10;
    // facts row
    const facts = [['Beds', c.beds ?? '-'], ['Baths', c.baths ?? '-'], ['Sq ft', num(c.sqft) ? Math.round(num(c.sqft)).toLocaleString('en-US') : '-'], ['DOM', Number.isFinite(Number(c.daysOnMarket)) && c.daysOnMarket !== null && c.daysOnMarket !== '' ? `${c.daysOnMarket}` : '-']];
    const fw = (cardW - 8) / 4;
    const small = perRow === 3;
    box(x + 4, cy - 1, cardW - 8, 12, SOFT, 2);
    facts.forEach(([l, v], k) => {
      font(6.5, 'normal', MUTED); text(l.toUpperCase(), x + 4 + k * fw + fw / 2, cy + 3.5, { align: 'center' });
      font(small ? 8.5 : 9.5, 'bold'); text(String(v), x + 4 + k * fw + fw / 2, cy + 8.5, { align: 'center' });
    });
    cy += 17;
    const rows = [
      ['Sold', money(c.soldPrice)],
      ['Sold on', fmtDate(c.soldDate)],
      ['List price', money(c.listPrice)],
      ['Price / sq ft', num(c.soldPrice) && num(c.sqft) ? money(num(c.soldPrice) / num(c.sqft)) : '-'],
    ];
    if (c.adjustedPrice) rows.push(['Adjusted to subject', money(c.adjustedPrice)]);
    if (small) rows.forEach((r) => { if (r[0] === 'Adjusted to subject') r[0] = 'Adjusted'; });
    rows.forEach(([l, v]) => {
      font(8, 'normal', MUTED); text(l, x + 4, cy);
      font(8.5, 'bold', /^Adjusted/.test(l) ? C : INK); text(v, x + cardW - 4, cy, { align: 'right' });
      cy += 5;
    });
    if (c.notes) {
      font(7.5, 'normal', MUTED);
      const lines = wrap(c.notes, cardW - 8);
      const room = Math.max(0, Math.floor((y + cardH - 3 - cy) / 3.4));
      pdf.text(lines.slice(0, room), x + 4, cy + 1, { lineHeightFactor: 1.25 });
    }
  });

  // ---------- Side by side + chart + notes ----------
  y = newPage('Side-by-side comparison');
  const cols = [['Property', 52], ['Sold', 22], ['Date', 22], ['Bd', 9], ['Ba', 10], ['Sq ft', 15], ['$/sq ft', 16], ['DOM', 11]];
  const scale = CW / cols.reduce((a, [, w]) => a + w, 0);
  const colX = []; let acc = M; cols.forEach(([, w]) => { colX.push(acc); acc += w * scale; });
  const row = (vals, yy, { bold, fill, color } = {}) => {
    if (fill) box(M, yy - 5, CW, 8, fill, 1.5);
    vals.forEach((v, k) => {
      font(8, bold ? 'bold' : 'normal', color || INK);
      const w = cols[k][1] * scale - 2;
      const s = pdf.splitTextToSize(clean(v), w)[0] || '';
      if (k === 0) text(s, colX[k] + 2, yy); else text(s, colX[k] + w, yy, { align: 'right' });
    });
  };
  pdf.setFillColor(...C); pdf.roundedRect(M, y - 5, CW, 8, 1.5, 1.5, 'F');
  cols.forEach(([l], k) => { font(7.5, 'bold', [255, 255, 255]); const w = cols[k][1] * scale - 2; if (k === 0) text(l, colX[k] + 2, y); else text(l, colX[k] + w, y, { align: 'right' }); });
  y += 8;
  row([`Subject: ${titleCase(street || '')}`, range ? `${short(range.low)}-${short(range.high).replace('$', '')}` : '-', 'Suggested', beds || '-', baths || '-', '-', '-', '-'], y, { bold: true, fill: tint(C, 0.9), color: C });
  y += 8;
  comps.forEach((c, i) => {
    row([`${i + 1}. ${clean(c.address).split(',')[0]}`, money(c.soldPrice), fmtDate(c.soldDate), c.beds ?? '-', c.baths ?? '-', num(c.sqft) ? Math.round(num(c.sqft)).toLocaleString('en-US') : '-', num(c.soldPrice) && num(c.sqft) ? money(num(c.soldPrice) / num(c.sqft)) : '-', Number.isFinite(Number(c.daysOnMarket)) && c.daysOnMarket !== null && c.daysOnMarket !== '' ? String(c.daysOnMarket) : '-'], y, { fill: i % 2 ? undefined : SOFT });
    y += 8;
  });

  // Price chart: each sale as a dot, suggested range shaded.
  const prices = [...sold, ...(range ? [range.low, range.high] : [])];
  if (prices.length >= 2) {
    y += 8;
    font(12, 'bold'); text('Where the price lands', M, y);
    y += 6;
    const lo = Math.min(...prices); const hi = Math.max(...prices);
    const pad = (hi - lo) * 0.08 || hi * 0.05;
    const a = lo - pad; const b = hi + pad;
    const X = (v) => M + 4 + ((v - a) / (b - a)) * (CW - 8);
    const ch = 30;
    box(M, y, CW, ch + 12, SOFT, 3);
    const axisY = y + ch - 4;
    pdf.setDrawColor(...LINE); pdf.setLineWidth(0.6); pdf.line(M + 4, axisY, W - M - 4, axisY);
    if (range) {
      pdf.setFillColor(...tint(C, 0.75)); pdf.roundedRect(X(range.low), y + 5, Math.max(1.5, X(range.high) - X(range.low)), axisY - y - 5, 1.5, 1.5, 'F');
      font(7.5, 'bold', C); text('Suggested range', (X(range.low) + X(range.high)) / 2, y + 4, { align: 'center' });
    }
    comps.forEach((c, i) => {
      const v = num(c.soldPrice); if (!v) return;
      const px = X(v); const py2 = axisY - 6 - (i % 3) * 5;
      pdf.setFillColor(...C); pdf.circle(px, py2, 2.3, 'F');
      font(6.5, 'bold', [255, 255, 255]); text(String(i + 1), px, py2 + 0.9, { align: 'center' });
    });
    font(7, 'normal', MUTED);
    [a + pad, (lo + hi) / 2, b - pad].forEach((v) => text(short(v), X(v), axisY + 5, { align: 'center' }));
    y += ch + 18;
  }

  const section = (title, body) => {
    if (!clean(body)) return;
    font(9.5, 'normal');
    const lines = wrap(body, CW);
    if (y + 10 + lines.length * 4.4 > H - 20) y = newPage('Market notes');
    font(11, 'bold', C); text(title, M, y);
    font(9.5, 'normal'); pdf.text(lines, M, y + 6, { lineHeightFactor: 1.35 });
    y += 9 + lines.length * 4.6;
  };
  section('Market conditions', [ma.marketCondition, ma.marketTrend].filter(Boolean).join('. ').replace(/\.\./g, '.'));
  section('Pricing adjustments', ma.priceAdjustments);
  section('Condition and updates', report?.rehabAssessment);

  if (y > H - 34) y = newPage('Notes');
  font(7, 'normal', MUTED);
  pdf.text(wrap(`This comparative market analysis is an opinion of value prepared by a real estate licensee to help price the property. It is not an appraisal and should not be relied on as one. ${report?.source === 'mls' ? 'Sales data from the MLS; deemed reliable but not guaranteed.' : 'Sales data gathered from public sources and may be incomplete; verify before relying on it.'} Prepared ${fmtDate(generatedAt)}.`, CW), M, H - 24, { lineHeightFactor: 1.3 });
  footer();

  return pdf.output('arraybuffer');
}
