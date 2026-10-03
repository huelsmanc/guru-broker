// Small pieces shared by the library screens.
import React, { useEffect, useRef, useState } from 'react';
import { FileText, Image as ImageIcon, File as FileIcon } from 'lucide-react';
import { isPdfName, isImageName } from './libraryData';

/** A "⋯" style menu: a trigger and a list of actions. Closes on outside tap or Escape. */
export function Menu({ trigger, items, align = 'right', label = 'More' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [open]);
  const shown = items.filter(Boolean);
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-expanded={open} onClick={() => setOpen(!open)}
        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground">{trigger}</button>
      {open && (
        <div role="menu" className={`absolute z-50 mt-1 min-w-[190px] rounded-xl border bg-popover text-popover-foreground shadow-lg py-1 ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {shown.map((it, i) => (it === '-' ? <div key={i} className="my-1 border-t" /> : (
            <button key={it.label} role="menuitem" type="button" disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-muted disabled:opacity-40 ${it.danger ? 'text-red-600' : ''}`}>
              {it.icon && <it.icon className="w-4 h-4 shrink-0" />} {it.label}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

export function FileGlyph({ name, className = 'w-5 h-5' }) {
  if (isPdfName(name)) return <span className={`${className} shrink-0 rounded-[4px] bg-red-50 text-red-600 dark:bg-red-950 dark:text-red-300 flex items-center justify-center`}><FileText className="w-[70%] h-[70%]" /></span>;
  if (isImageName(name)) return <span className={`${className} shrink-0 rounded-[4px] bg-sky-50 text-sky-600 dark:bg-sky-950 dark:text-sky-300 flex items-center justify-center`}><ImageIcon className="w-[70%] h-[70%]" /></span>;
  return <span className={`${className} shrink-0 rounded-[4px] bg-muted text-muted-foreground flex items-center justify-center`}><FileIcon className="w-[70%] h-[70%]" /></span>;
}

/** A plain modal: dimmed page, a card in the middle (a sheet from the bottom on phones). */
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-label={title} className={`w-full ${wide ? 'sm:max-w-xl' : 'sm:max-w-md'} max-h-[92dvh] overflow-y-auto rounded-t-2xl sm:rounded-2xl bg-background shadow-xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]`}>
        <p className="text-lg font-semibold mb-4">{title}</p>
        {children}
      </div>
    </div>
  );
}
