// Field geometry shared by the field editor, the signing page and the final PDF.
//
// Fields are stored in "document space":
//   x, width  -> % of the page width
//   y         -> % of the total height of all pages stacked (each page scaled to the same width)
//   hPct      -> height as % of that same total height (new fields)
//   height    -> legacy: height in screen pixels as drawn in the old editor
//
// Legacy pixel heights were drawn in an editor roughly this wide; used to convert them.
export const LEGACY_EDITOR_WIDTH = 800;

/**
 * Height of the whole stacked document divided by its width.
 * pages: [{ width, height }] in any unit (points or pixels).
 */
export function stackRatio(pages) {
  return pages.reduce((sum, p) => sum + p.height / p.width, 0) || 1;
}

/** Field height as % of total stacked height. */
export function heightPct(field, ratio) {
  if (typeof field.hPct === 'number' && field.hPct > 0) return field.hPct;
  const px = Number(field.height) || 40;
  return ((px / LEGACY_EDITOR_WIDTH) / ratio) * 100;
}

/** CSS box for a field inside a container that stacks all pages at 100% width. */
export function fieldStyle(field, ratio) {
  return {
    left: `${field.x}%`,
    top: `${field.y}%`,
    width: `${field.width || 18}%`,
    height: `${heightPct(field, ratio)}%`,
  };
}

/**
 * Maps a field onto a specific PDF page, in PDF points with a bottom-left origin.
 * pages: [{ width, height }] in points, in page order.
 * Returns { pageIndex, x, y, width, height }.
 */
export function fieldToPdfBox(field, pages) {
  const ratio = stackRatio(pages);
  const top = (Number(field.y) / 100) * ratio; // in "page widths"
  const h = (heightPct(field, ratio) / 100) * ratio;
  let start = 0;
  let pageIndex = pages.length - 1;
  for (let i = 0; i < pages.length; i++) {
    const end = start + pages[i].height / pages[i].width;
    if (top < end - 1e-9) { pageIndex = i; break; }
    start = end;
  }
  if (pageIndex === pages.length - 1) {
    start = pages.slice(0, -1).reduce((s, p) => s + p.height / p.width, 0);
  }
  const p = pages[pageIndex];
  const w = p.width;
  const boxTop = (top - start) * w;
  const boxH = Math.min(h * w, p.height);
  return {
    pageIndex,
    x: (Number(field.x) / 100) * w,
    y: Math.max(0, p.height - boxTop - boxH),
    width: (Number(field.width || 18) / 100) * w,
    height: boxH,
  };
}

/** Which signer a field belongs to. Unassigned fields go to the first signer. */
export function fieldSignerIndex(field) {
  const n = Number(field.signer_index);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/** Fields the signer must complete (not pre-filled by the sender). */
export function isPrefilled(field) {
  if (field.type === 'strike') return true; // sender's strike-out line, nothing to fill
  if (field.sender_fill) return true; // the sender types this before sending (blank boxes are skipped)
  return typeof field.value === 'string' && field.value.trim() !== '';
}

/** Typed text is drawn at 10pt on a 612pt-wide page; scale that to any width. */
export const TEXT_PT = 10;
export const textPx = (pageWidth) => (pageWidth * TEXT_PT) / 612;

/** Checkbox-style fields store "X" when ticked. */
export const isTickType = (type) => type === 'checkbox' || type === 'radio';

/**
 * Whether a field is shown, given the values entered so far ({ fieldId: value }).
 * A field with show_if only appears (and is only required) when that box is ticked,
 * or, for a choose-one group, when that option is picked.
 */
export function fieldVisible(field, values = {}) {
  const cond = field?.show_if;
  if (!cond) return true;
  const id = typeof cond === 'string' ? cond : cond.field_id;
  if (!id) return true;
  const v = values[id];
  if (typeof v !== 'string' || v === '') return false;
  return cond.equals ? v === cond.equals : true;
}
