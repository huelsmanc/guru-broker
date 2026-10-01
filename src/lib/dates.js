// Calendar dates ("1993-09-28") are days, not moments. new Date("1993-09-28") means midnight UTC,
// which is still Sept 27 in the Americas; these read them as that day in the viewer's time zone.

/** A date-only value (or full timestamp) as a local Date. */
export function localDay(v) {
  if (v instanceof Date) return v;
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(v);
}

/** Birthdays and anniversaries repeat every year. */
export const RECURRING = new Set(['birthday', 'work_anniversary']);

/** The date of an entry in a given year (recurring ones move to that year). */
export function onYear(v, year) {
  const d = localDay(v);
  return new Date(year, d.getMonth(), d.getDate());
}

/** Next time a recurring date comes around, today included. */
export function nextOccurrence(v, from = new Date()) {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const d = onYear(v, today.getFullYear());
  return d < today ? onYear(v, today.getFullYear() + 1) : d;
}
