// Print editor documents: each side of a piece is a list of elements (text, image, shape, logo
// mark) placed in inches-at-96px at trim size. Starter layouts fill themselves from the agent,
// the brokerage brand and a property (from a design, a deal or the MLS).
import { PRODUCTS } from '../../shared/print.js';

export const PX = 96;
export const FONTS = ['Montserrat', 'Inter', 'Playfair Display', 'Poppins', 'Oswald', 'Lora', 'Merriweather', 'Raleway', 'Great Vibes'];
export const uid = () => Math.random().toString(36).slice(2, 10);

export function pageSize(product) {
  const [w, h] = PRODUCTS[product].trim;
  return { W: w * PX, H: h * PX };
}
export const sidesOf = (product) => (PRODUCTS[product].sides === 2 ? ['front', 'back'] : ['front']);

const money = (n) => {
  const m = String(n ?? '').trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return '';
  const v = Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  return v > 0 ? `$${Math.round(v).toLocaleString('en-US')}` : '';
};
const title = (s) => String(s || '').replace(/\b([a-z])/g, (c) => c.toUpperCase());
function facts(l = {}) {
  return [l.beds && `${l.beds} Beds`, l.baths_total && `${Number(l.baths_total)} Baths`, l.living_area && `${Number(l.living_area).toLocaleString('en-US')} Sq Ft`].filter(Boolean).join('  |  ');
}
function addr(l = {}) {
  const a1 = title([l.street_address, l.unit && `#${l.unit}`].filter(Boolean).join(' '));
  const a2 = [title(l.city), [String(l.state || '').toUpperCase(), l.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [a1, a2];
}
const RIBBON = { just_listed: 'JUST LISTED', just_sold: 'JUST SOLD', under_contract: 'UNDER CONTRACT', open_house: 'OPEN HOUSE', coming_soon: 'COMING SOON', price_reduced: 'PRICE IMPROVED', agent_intro: 'MEET YOUR AGENT' };

// Element makers (sizes in the layout's own units, scaled later).
const T = (o) => ({ id: uid(), type: 'text', font: 'Montserrat', size: 14, weight: 400, italic: false, color: '#111827', align: 'left', lineHeight: 1.2, letterSpacing: 0, uppercase: false, ...o });
const I = (o) => ({ id: uid(), type: 'image', fit: 'cover', radius: 0, opacity: 1, ...o });
const S = (o) => ({ id: uid(), type: 'shape', shape: 'rect', fill: '#111827', stroke: '', strokeWidth: 0, radius: 0, opacity: 1, ...o });
const E = (o) => ({ id: uid(), type: 'eho', color: '#111827', size: 9, ...o });

/** A new element of the given type with sensible defaults. */
export const makeEl = (type, o = {}) => ({ text: T, image: I, shape: S, eho: E }[type])(o);

/** Returns the doc with one side changed. */
export const withPage = (doc, side, fn) => ({ ...doc, pages: { ...doc.pages, [side]: fn(doc.pages[side]) } });

function inputs(d = {}) {
  const c = d.content || {};
  const l = d.listing || {};
  const [a1, a2] = addr(l);
  const kind = d.kind || 'just_listed';
  return {
    ribbon: c.ribbon || RIBBON[kind] || 'JUST LISTED',
    headline: c.headline || (a1 ? `${title(RIBBON[kind] || 'Just listed').toLowerCase().replace(/^\w/, (x) => x.toUpperCase())} in ${title(l.city) || 'your neighborhood'}` : 'Thinking of selling?'),
    sub: c.subheadline || '',
    body: c.body || 'Curious what your home is worth in today\'s market? Call me for a free, no-pressure home value report.',
    price: money(l.price || l.list_price || l.close_price),
    a1, a2, facts: facts(l),
    photo: (d.photos || [])[0] || d.bgImage || '',
    photos: d.photos || [],
    agent: d.agent || {}, brand: d.brand || {},
    color: d.content?.palette?.primary || d.brand?.color || '#0f172a',
    accent: d.content?.palette?.accent || '#c9a227',
  };
}

const agentLine = (a) => [a.phone, a.email].filter(Boolean).join('  ·  ');

// ---- starter layouts (built on a base size, then scaled to the product) ---------------------
const LAYOUTS = {
  postcard_front: {
    base: [576, 384],
    list: {
      photo_split: { label: 'Photo + details', make: (v) => [
        I({ x: 0, y: 0, w: 320, h: 384, src: v.photo, placeholder: 'Property photo' }),
        S({ x: 320, y: 0, w: 256, h: 384, fill: v.color }),
        S({ x: 340, y: 26, w: 120, h: 22, fill: v.accent }),
        T({ x: 340, y: 29, w: 120, h: 18, text: v.ribbon, size: 9.5, weight: 800, color: '#ffffff', align: 'center', letterSpacing: 1.5 }),
        T({ x: 340, y: 64, w: 216, h: 70, text: v.headline, size: 20, weight: 800, color: '#ffffff', lineHeight: 1.1 }),
        T({ x: 340, y: 146, w: 216, h: 30, text: v.price, size: 22, weight: 800, color: v.accent }),
        T({ x: 340, y: 180, w: 216, h: 34, text: [v.a1, v.a2].filter(Boolean).join('\n'), size: 10, weight: 600, color: '#ffffff', lineHeight: 1.35 }),
        T({ x: 340, y: 220, w: 216, h: 16, text: v.facts, size: 8.5, weight: 600, color: '#ffffffcc' }),
        S({ x: 340, y: 300, w: 216, h: 1, fill: '#ffffff55' }),
        T({ x: 340, y: 310, w: 150, h: 14, text: v.agent.name || 'Your name', size: 10, weight: 700, color: '#ffffff' }),
        T({ x: 340, y: 326, w: 170, h: 26, text: agentLine(v.agent), size: 7.5, color: '#ffffffdd', lineHeight: 1.3 }),
        I({ x: 500, y: 306, w: 56, h: 30, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      ] },
      full_bleed: { label: 'Big photo', make: (v) => [
        I({ x: 0, y: 0, w: 576, h: 384, src: v.photo, placeholder: 'Property photo' }),
        S({ x: 0, y: 200, w: 576, h: 184, fill: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.78) 55%)' }),
        S({ x: 24, y: 24, w: 128, h: 26, fill: v.accent }),
        T({ x: 24, y: 29, w: 128, h: 18, text: v.ribbon, size: 10, weight: 800, color: '#ffffff', align: 'center', letterSpacing: 1.6 }),
        T({ x: 24, y: 262, w: 380, h: 34, text: v.headline, size: 22, weight: 800, color: '#ffffff' }),
        T({ x: 24, y: 300, w: 380, h: 18, text: [v.a1, v.a2].filter(Boolean).join(', '), size: 10, weight: 600, color: '#ffffffee' }),
        T({ x: 24, y: 322, w: 380, h: 30, text: v.price, size: 22, weight: 800, color: v.accent }),
        T({ x: 24, y: 354, w: 380, h: 14, text: v.facts, size: 8.5, weight: 600, color: '#ffffffcc' }),
        I({ x: 470, y: 326, w: 82, h: 40, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      ] },
      banner: { label: 'Banner', make: (v) => [
        I({ x: 0, y: 0, w: 576, h: 238, src: v.photo, placeholder: 'Property photo' }),
        S({ x: 0, y: 238, w: 576, h: 146, fill: v.color }),
        S({ x: 0, y: 232, w: 576, h: 6, fill: v.accent }),
        T({ x: 24, y: 252, w: 330, h: 16, text: v.ribbon, size: 9, weight: 800, color: v.accent, letterSpacing: 2 }),
        T({ x: 24, y: 270, w: 330, h: 50, text: v.headline, size: 19, weight: 800, color: '#ffffff', lineHeight: 1.1 }),
        T({ x: 24, y: 324, w: 330, h: 30, text: [v.a1, v.a2].filter(Boolean).join(', '), size: 9.5, color: '#ffffffdd' }),
        T({ x: 370, y: 254, w: 182, h: 30, text: v.price, size: 22, weight: 800, color: '#ffffff', align: 'right' }),
        T({ x: 370, y: 288, w: 182, h: 16, text: v.facts, size: 8, weight: 600, color: '#ffffffcc', align: 'right' }),
        I({ x: 452, y: 322, w: 100, h: 42, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      ] },
      agent_intro: { label: 'Agent intro', make: (v) => [
        S({ x: 0, y: 0, w: 576, h: 384, fill: '#f8fafc' }),
        S({ x: 0, y: 0, w: 220, h: 384, fill: v.color }),
        I({ x: 40, y: 72, w: 140, h: 140, src: v.agent.headshot, radius: 999, placeholder: 'Headshot', role: 'headshot' }),
        T({ x: 20, y: 228, w: 180, h: 18, text: v.agent.name || 'Your name', size: 13, weight: 800, color: '#ffffff', align: 'center' }),
        T({ x: 20, y: 248, w: 180, h: 14, text: v.agent.title || 'Real Estate Agent', size: 8.5, color: '#ffffffcc', align: 'center' }),
        T({ x: 20, y: 268, w: 180, h: 30, text: [v.agent.phone, v.agent.email].filter(Boolean).join('\n'), size: 8.5, color: '#ffffff', align: 'center', lineHeight: 1.4 }),
        T({ x: 248, y: 64, w: 300, h: 20, text: 'HELLO, NEIGHBOR', size: 10, weight: 800, color: v.accent, letterSpacing: 2.5 }),
        T({ x: 248, y: 90, w: 300, h: 80, text: 'Your neighborhood real estate expert', size: 24, weight: 800, color: v.color, lineHeight: 1.1 }),
        T({ x: 248, y: 182, w: 300, h: 90, text: v.body, size: 11, color: '#334155', lineHeight: 1.45 }),
        I({ x: 248, y: 300, w: 120, h: 50, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      ] },
    },
  },
  postcard_back: {
    base: [576, 384],
    list: {
      back_classic: { label: 'Message + contact', make: (v) => [
        S({ x: 0, y: 0, w: 8, h: 384, fill: v.color }),
        T({ x: 24, y: 24, w: 300, h: 46, text: v.headline, size: 15, weight: 800, color: v.color, lineHeight: 1.1 }),
        T({ x: 24, y: 76, w: 200, h: 150, text: v.body, size: 9.5, color: '#1f2937', lineHeight: 1.4 }),
        I({ x: 24, y: 254, w: 44, h: 44, src: v.agent.headshot, radius: 999, placeholder: 'Headshot', role: 'headshot' }),
        T({ x: 76, y: 254, w: 150, h: 14, text: v.agent.name || 'Your name', size: 10.5, weight: 700 }),
        T({ x: 76, y: 270, w: 150, h: 40, text: [v.agent.title || 'Real Estate Agent', v.agent.phone, v.agent.email, v.agent.license && `Lic. ${v.agent.license}`].filter(Boolean).join('\n'), size: 7.5, color: '#374151', lineHeight: 1.3 }),
        S({ x: 24, y: 322, w: 200, h: 1, fill: '#e5e7eb' }),
        I({ x: 24, y: 330, w: 90, h: 30, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
        E({ x: 124, y: 330, w: 100, h: 30, size: 7, align: 'left' }),
      ] },
      back_banner: { label: 'Color header', make: (v) => [
        S({ x: 0, y: 0, w: 576, h: 66, fill: v.color }),
        T({ x: 24, y: 18, w: 380, h: 30, text: v.headline, size: 17, weight: 800, color: '#ffffff' }),
        I({ x: 456, y: 14, w: 100, h: 38, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
        T({ x: 24, y: 84, w: 200, h: 160, text: v.body, size: 9.5, color: '#1f2937', lineHeight: 1.4 }),
        I({ x: 24, y: 262, w: 50, h: 50, src: v.agent.headshot, radius: 999, placeholder: 'Headshot', role: 'headshot' }),
        T({ x: 82, y: 264, w: 142, h: 14, text: v.agent.name || 'Your name', size: 10.5, weight: 700 }),
        T({ x: 82, y: 280, w: 142, h: 36, text: [v.agent.phone, v.agent.email, v.agent.license && `Lic. ${v.agent.license}`].filter(Boolean).join('\n'), size: 7.5, color: '#374151', lineHeight: 1.3 }),
        E({ x: 24, y: 340, w: 190, h: 18, size: 8, align: 'left' }),
      ] },
    },
  },
  flyer: {
    base: [816, 1056],
    list: {
      flyer_hero: { label: 'Hero photo', make: (v) => [
        I({ x: 0, y: 0, w: 816, h: 500, src: v.photo, placeholder: 'Property photo' }),
        S({ x: 40, y: 460, w: 190, h: 40, fill: v.accent }),
        T({ x: 40, y: 469, w: 190, h: 24, text: v.ribbon, size: 15, weight: 800, color: '#ffffff', align: 'center', letterSpacing: 2.5 }),
        T({ x: 40, y: 530, w: 736, h: 50, text: v.headline, size: 38, weight: 800, color: v.color }),
        T({ x: 40, y: 590, w: 736, h: 28, text: v.sub, size: 17, color: '#475569' }),
        T({ x: 40, y: 632, w: 400, h: 44, text: v.price, size: 34, weight: 800, color: v.accent }),
        T({ x: 40, y: 682, w: 500, h: 46, text: [v.a1, v.a2].filter(Boolean).join('\n'), size: 15, weight: 600, lineHeight: 1.4 }),
        T({ x: 40, y: 742, w: 736, h: 22, text: v.facts, size: 15, weight: 700, color: v.color }),
        T({ x: 40, y: 778, w: 736, h: 120, text: v.body, size: 13, color: '#334155', lineHeight: 1.5 }),
        S({ x: 0, y: 920, w: 816, h: 136, fill: v.color }),
        I({ x: 40, y: 942, w: 92, h: 92, src: v.agent.headshot, radius: 999, placeholder: 'Headshot', role: 'headshot' }),
        T({ x: 150, y: 950, w: 400, h: 26, text: v.agent.name || 'Your name', size: 21, weight: 800, color: '#ffffff' }),
        T({ x: 150, y: 980, w: 400, h: 50, text: [v.agent.title || 'Real Estate Agent', agentLine(v.agent)].filter(Boolean).join('\n'), size: 12, color: '#ffffffdd', lineHeight: 1.4 }),
        I({ x: 600, y: 948, w: 176, h: 56, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
        E({ x: 600, y: 1016, w: 176, h: 16, size: 10, color: '#ffffff' }),
      ] },
      flyer_grid: { label: 'Photo grid', make: (v) => [
        I({ x: 0, y: 0, w: 816, h: 420, src: v.photos[0] || v.photo, placeholder: 'Main photo' }),
        I({ x: 0, y: 424, w: 270, h: 160, src: v.photos[1] || '', placeholder: 'Photo' }),
        I({ x: 273, y: 424, w: 270, h: 160, src: v.photos[2] || '', placeholder: 'Photo' }),
        I({ x: 546, y: 424, w: 270, h: 160, src: v.photos[3] || '', placeholder: 'Photo' }),
        T({ x: 40, y: 610, w: 520, h: 20, text: v.ribbon, size: 14, weight: 800, color: v.accent, letterSpacing: 3 }),
        T({ x: 40, y: 636, w: 736, h: 50, text: v.headline, size: 34, weight: 800, color: v.color }),
        T({ x: 40, y: 696, w: 360, h: 40, text: v.price, size: 30, weight: 800, color: v.color }),
        T({ x: 420, y: 700, w: 356, h: 44, text: [v.a1, v.a2].filter(Boolean).join('\n'), size: 13, weight: 600, align: 'right', lineHeight: 1.4 }),
        T({ x: 40, y: 750, w: 736, h: 22, text: v.facts, size: 14, weight: 700, color: '#475569' }),
        T({ x: 40, y: 784, w: 736, h: 110, text: v.body, size: 13, color: '#334155', lineHeight: 1.5 }),
        S({ x: 40, y: 916, w: 736, h: 2, fill: v.accent }),
        I({ x: 40, y: 936, w: 84, h: 84, src: v.agent.headshot, radius: 999, placeholder: 'Headshot', role: 'headshot' }),
        T({ x: 140, y: 944, w: 400, h: 26, text: v.agent.name || 'Your name', size: 20, weight: 800, color: v.color }),
        T({ x: 140, y: 972, w: 400, h: 50, text: [v.agent.title || 'Real Estate Agent', agentLine(v.agent)].filter(Boolean).join('\n'), size: 12, color: '#475569', lineHeight: 1.4 }),
        I({ x: 600, y: 940, w: 176, h: 56, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
        E({ x: 600, y: 1008, w: 176, h: 16, size: 10 }),
      ] },
    },
  },
  card_front: {
    base: [336, 192],
    list: {
      card_classic: { label: 'Classic', make: (v) => [
        S({ x: 0, y: 0, w: 336, h: 192, fill: '#ffffff' }),
        S({ x: 0, y: 0, w: 6, h: 192, fill: v.color }),
        T({ x: 22, y: 26, w: 210, h: 20, text: v.agent.name || 'Your name', size: 14, weight: 800, color: v.color }),
        T({ x: 22, y: 48, w: 210, h: 12, text: v.agent.title || 'Real Estate Agent', size: 7, weight: 600, color: '#6b7280', uppercase: true, letterSpacing: 1 }),
        T({ x: 22, y: 84, w: 220, h: 50, text: [v.agent.phone, v.agent.email, v.agent.license && `Lic. ${v.agent.license}`].filter(Boolean).join('\n'), size: 8.5, color: '#111827', lineHeight: 1.45 }),
        I({ x: 252, y: 24, w: 62, h: 62, src: v.agent.headshot, radius: 999, placeholder: 'Headshot', role: 'headshot' }),
        I({ x: 230, y: 140, w: 86, h: 32, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      ] },
      card_photo: { label: 'With photo', make: (v) => [
        S({ x: 0, y: 0, w: 336, h: 192, fill: '#ffffff' }),
        I({ x: 0, y: 0, w: 128, h: 192, src: v.agent.headshot, placeholder: 'Headshot', role: 'headshot' }),
        T({ x: 146, y: 34, w: 176, h: 20, text: v.agent.name || 'Your name', size: 13, weight: 800, color: v.color }),
        T({ x: 146, y: 55, w: 176, h: 12, text: v.agent.title || 'Real Estate Agent', size: 7, weight: 600, color: '#6b7280', uppercase: true, letterSpacing: 1 }),
        T({ x: 146, y: 84, w: 176, h: 50, text: [v.agent.phone, v.agent.email, v.agent.license && `Lic. ${v.agent.license}`].filter(Boolean).join('\n'), size: 8, lineHeight: 1.45 }),
        I({ x: 146, y: 146, w: 80, h: 28, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      ] },
    },
  },
  card_back: {
    base: [336, 192],
    list: {
      card_back_color: { label: 'Logo on color', make: (v) => [
        S({ x: 0, y: 0, w: 336, h: 192, fill: v.color }),
        S({ x: 98, y: 46, w: 140, h: 70, fill: '#ffffff', radius: 8 }),
        I({ x: 106, y: 52, w: 124, h: 58, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
        T({ x: 40, y: 128, w: 256, h: 14, text: v.brand.brokerage || '', size: 8, weight: 700, color: '#ffffff', align: 'center', uppercase: true, letterSpacing: 1.5 }),
        E({ x: 108, y: 164, w: 120, h: 12, size: 7, color: '#ffffff' }),
      ] },
      card_back_white: { label: 'Logo on white', make: (v) => [
        S({ x: 0, y: 0, w: 336, h: 192, fill: '#ffffff' }),
        I({ x: 88, y: 50, w: 160, h: 70, src: v.brand.logo, fit: 'contain', placeholder: 'Logo', role: 'logo' }),
        S({ x: 0, y: 182, w: 336, h: 10, fill: v.color }),
        E({ x: 108, y: 150, w: 120, h: 12, size: 7 }),
      ] },
    },
  },
};

export function layoutGroup(product, side) {
  if (product === 'business_cards') return side === 'back' ? 'card_back' : 'card_front';
  if (product === 'flyer_letter') return 'flyer';
  return side === 'back' ? 'postcard_back' : 'postcard_front';
}
export const layoutsFor = (product, side) => Object.entries(LAYOUTS[layoutGroup(product, side)].list).map(([key, l]) => ({ key, label: l.label }));

/** A side laid out with a starter layout, filled from the given data and scaled to the product. */
export function makePage(product, side, layoutKey, data) {
  const group = LAYOUTS[layoutGroup(product, side)];
  const layout = group.list[layoutKey] || Object.values(group.list)[0];
  const { W, H } = pageSize(product);
  const kx = W / group.base[0]; const ky = H / group.base[1]; const k = Math.min(kx, ky);
  // Facts the property doesn't have (no price yet, say) are left out rather than kept as blank boxes.
  const els = layout.make(inputs(data)).filter((e) => e.type !== 'text' || String(e.text || '').trim()).map((e) => ({
    ...e, x: e.x * kx, y: e.y * ky, w: e.w * kx, h: e.h * ky,
    ...(e.size ? { size: +(e.size * k).toFixed(2) } : {}),
    ...(e.letterSpacing ? { letterSpacing: +(e.letterSpacing * k).toFixed(2) } : {}),
  }));
  return { bg: '#ffffff', layout: layoutKey, elements: els };
}

export function newDoc(product, data = {}, layouts = {}) {
  const pages = {};
  for (const side of sidesOf(product)) pages[side] = makePage(product, side, layouts[side] || layoutsFor(product, side)[0].key, data);
  // What the layouts were filled from, so a different layout can be picked later.
  const src = { listing: data.listing || {}, photos: data.photos || [], content: data.content || null, kind: data.kind || 'just_listed', bgImage: data.bgImage || '' };
  return { v: 1, product, pages, src };
}

/** Moves a document to another product of the same shape (4x6 <-> 6x9), scaling everything. */
export function resizeDoc(doc, product) {
  if (doc.product === product) return doc;
  const a = pageSize(doc.product); const b = pageSize(product);
  const kx = b.W / a.W; const ky = b.H / a.H; const k = Math.min(kx, ky);
  const pages = {};
  for (const side of sidesOf(product)) {
    const p = doc.pages[side];
    if (!p) continue;
    pages[side] = { ...p, elements: p.elements.map((e) => ({ ...e, x: e.x * kx, y: e.y * ky, w: e.w * kx, h: e.h * ky, ...(e.size ? { size: +(e.size * k).toFixed(2) } : {}), ...(e.strokeWidth ? { strokeWidth: e.strokeWidth * k } : {}) })) };
  }
  return { ...doc, product, pages };
}

/** Same document family? (Only postcards can switch sizes.) */
export const sameShape = (a, b) => a === b || (a?.startsWith('postcard_') && b?.startsWith('postcard_'));

/** Text still showing a "fill me in" value, or photo frames left empty: worth a warning before printing. */
export function emptySpots(doc) {
  const out = [];
  for (const [side, p] of Object.entries(doc?.pages || {})) {
    for (const e of p.elements) {
      if (e.type === 'image' && !e.src) out.push({ side, what: e.placeholder || 'Photo' });
      if (e.type === 'text' && /^your name$/i.test(String(e.text || '').trim())) out.push({ side, what: 'Your name' });
    }
  }
  return out;
}

/** Fills agent/brand pieces (photo, logo) that were empty when the layout was made. */
export function refreshBrand(doc, { agent = {}, brand = {} }) {
  const fix = (e) => (e.type === 'image' && !e.src ? { ...e, src: e.role === 'logo' ? brand.logo || '' : e.role === 'headshot' ? agent.headshot || '' : e.src } : e);
  return { ...doc, pages: Object.fromEntries(Object.entries(doc.pages).map(([k, p]) => [k, { ...p, elements: p.elements.map(fix) }])) };
}
