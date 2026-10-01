import React from 'react';
import { fieldLook, TEXT_COLORS, STRIKE_COLORS, STRIKE_WEIGHTS, TEXT_SIZES, STYLED_TYPES } from '../../../shared/esignStyle.js';

const Btn = ({ on, title, onClick, children, className = '' }) => (
  <button type="button" title={title} aria-label={title} aria-pressed={!!on} onClick={onClick}
    onPointerDown={(e) => e.stopPropagation()}
    className={`h-7 min-w-7 px-1.5 rounded-md text-[13px] flex items-center justify-center transition ${on ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'} ${className}`}>
    {children}
  </button>
);

const AlignIcon = ({ align }) => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    {align === 'left' && <><path d="M2 3h10" /><path d="M2 6h6" /><path d="M2 9h10" /><path d="M2 12h6" /></>}
    {align === 'center' && <><path d="M2 3h10" /><path d="M4 6h6" /><path d="M2 9h10" /><path d="M4 12h6" /></>}
    {align === 'right' && <><path d="M2 3h10" /><path d="M6 6h6" /><path d="M2 9h10" /><path d="M6 12h6" /></>}
  </svg>
);

const Swatch = ({ hex, label, on, onClick }) => (
  <button type="button" title={label} aria-label={label} aria-pressed={on} onClick={onClick} onPointerDown={(e) => e.stopPropagation()}
    className={`w-5 h-5 rounded-full flex-shrink-0 transition ${on ? 'ring-2 ring-offset-1 ring-slate-900' : 'hover:scale-110'}`}
    style={{ background: hex }} />
);

const Sep = () => <span className="w-px h-5 bg-slate-200 mx-0.5 flex-shrink-0" />;

/**
 * Look of a text box (bold, italic, size, color, alignment) or a strike-out line (color, weight).
 * Used floating above the selected box and in the editor's side panel.
 */
export default function FieldStyleBar({ field, onChange, className = '' }) {
  const look = fieldLook(field);
  const set = (patch) => onChange({ ...(field.style || {}), ...patch });
  if (field.type === 'strike') {
    return (
      <div className={`inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-1.5 py-1 shadow-lg ${className}`} onPointerDown={(e) => e.stopPropagation()}>
        {STRIKE_COLORS.map((c) => <Swatch key={c.key} hex={c.hex} label={`${c.label} line`} on={look.color === c.hex} onClick={() => set({ color: c.key })} />)}
        <Sep />
        {Object.keys(STRIKE_WEIGHTS).map((w) => (
          <Btn key={w} title={`${w[0].toUpperCase()}${w.slice(1)} line`} on={look.weight === w} onClick={() => set({ weight: w })}>
            <span className="block w-5 rounded-full" style={{ height: { thin: 1, medium: 2, thick: 4 }[w], background: 'currentColor' }} />
          </Btn>
        ))}
      </div>
    );
  }
  if (!STYLED_TYPES.has(field.type)) return null;
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white px-1.5 py-1 shadow-lg ${className}`} onPointerDown={(e) => e.stopPropagation()}>
      <Btn title="Bold" on={look.bold} onClick={() => set({ bold: !look.bold })}><span className="font-bold">B</span></Btn>
      <Btn title="Italic" on={look.italic} onClick={() => set({ italic: !look.italic })}><span className="italic font-serif">I</span></Btn>
      <Sep />
      <select title="Text size" aria-label="Text size" value={look.size} onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => set({ size: Number(e.target.value) })}
        className="h-7 rounded-md border border-slate-200 bg-white px-1 text-[12px] text-slate-700">
        {TEXT_SIZES.map((s) => <option key={s} value={s}>{s} pt</option>)}
      </select>
      <Sep />
      <div className="flex items-center gap-1 px-0.5">
        {TEXT_COLORS.map((c) => <Swatch key={c.key} hex={c.hex} label={`${c.label} text`} on={look.color.toLowerCase() === c.hex.toLowerCase()} onClick={() => set({ color: c.key })} />)}
      </div>
      <Sep />
      {['left', 'center', 'right'].map((a) => <Btn key={a} title={`Align ${a}`} on={look.align === a} onClick={() => set({ align: a })}><AlignIcon align={a} /></Btn>)}
    </div>
  );
}
