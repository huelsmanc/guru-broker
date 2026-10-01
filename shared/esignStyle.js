// How a box's text and strike-out lines look. Shared by the field editor, the signing page and
// the signed PDF so what you see while setting up is exactly what prints.
//
// field.style (all optional):
//   bold, italic: boolean
//   size: text size in points on a letter-width page (default 10)
//   color: text color, one of TEXT_COLORS (default ink)
//   align: 'left' | 'center' | 'right'
//   For a strike-out: color (STRIKE_COLORS) and weight ('thin' | 'medium' | 'thick')

import { TEXT_PT } from './esignGeometry.js';

export const TEXT_COLORS = [
  { key: 'ink', label: 'Black', hex: '#111827' },
  { key: 'blue', label: 'Blue', hex: '#1d4ed8' },
  { key: 'navy', label: 'Navy', hex: '#1e3a8a' },
  { key: 'red', label: 'Red', hex: '#b91c1c' },
  { key: 'green', label: 'Green', hex: '#15803d' },
  { key: 'gray', label: 'Gray', hex: '#4b5563' },
];
export const STRIKE_COLORS = [
  { key: 'ink', label: 'Black', hex: '#111827' },
  { key: 'red', label: 'Red', hex: '#dc2626' },
  { key: 'blue', label: 'Blue', hex: '#1d4ed8' },
];
export const STRIKE_WEIGHTS = { thin: 0.8, medium: 1.4, thick: 2.4 }; // points
export const TEXT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18];
export const STYLED_TYPES = new Set(['text', 'date', 'dropdown']);

const hexOk = (h) => /^#[0-9a-f]{6}$/i.test(String(h || ''));
const pick = (list, v, fallback) => (list.find((c) => c.key === v || c.hex.toLowerCase() === String(v || '').toLowerCase()) || fallback);

/** Normalized style for a field (safe to trust from stored data). */
export function fieldLook(field) {
  const s = (field && typeof field.style === 'object' && field.style) || {};
  if (field?.type === 'strike') {
    const color = pick(STRIKE_COLORS, s.color, STRIKE_COLORS[0]).hex;
    const weight = STRIKE_WEIGHTS[s.weight] ? s.weight : 'medium';
    return { color, weight, thickness: STRIKE_WEIGHTS[weight] };
  }
  const size = Number(s.size);
  return {
    bold: !!s.bold,
    italic: !!s.italic,
    size: Number.isFinite(size) && size >= 6 && size <= 24 ? size : TEXT_PT,
    color: hexOk(s.color) ? s.color : pick(TEXT_COLORS, s.color, TEXT_COLORS[0]).hex,
    align: ['center', 'right'].includes(s.align) ? s.align : 'left',
  };
}

/** CSS for text in a box, given the on-screen width of the page in pixels. */
export function textCss(field, pageWidthPx) {
  const l = fieldLook(field);
  return {
    fontSize: (pageWidthPx * l.size) / 612,
    fontWeight: l.bold ? 700 : 400,
    fontStyle: l.italic ? 'italic' : 'normal',
    color: l.color,
    textAlign: l.align,
    lineHeight: 1.2,
  };
}

/** Line thickness on screen for a strike-out. */
export const strikePx = (field, pageWidthPx) => Math.max(1, (pageWidthPx * fieldLook(field).thickness) / 612);

/** "#1d4ed8" -> [r, g, b] in 0..1 (for the PDF). */
export function rgb01(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
