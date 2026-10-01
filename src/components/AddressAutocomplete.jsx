import React, { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';

const newSession = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));

/**
 * An address box that suggests real addresses as you type (Google). Works as a plain box
 * when suggestions aren't available. onSelect gets { address, lat, lng } when one is picked.
 */
export default function AddressAutocomplete({ value, onChange, onSelect, onEnter, placeholder = '123 Main St, Town, ST', className = '', ...rest }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const session = useRef(newSession());
  const picked = useRef(null); // the text we just filled in, so it doesn't search again
  const wrap = useRef(null);

  useEffect(() => {
    const text = String(value || '').trim();
    if (text.length < 4 || text === picked.current) { setItems([]); return undefined; }
    let live = true;
    const t = setTimeout(async () => {
      try {
        const { data } = await base44.functions.invoke('placesAutocomplete', { action: 'suggest', input: text, session: session.current });
        if (!live) return;
        if (data?.problem) console.warn('Address suggestions:', data.problem);
        setItems(data?.suggestions || []); setActive(-1); setOpen(true);
      } catch { if (live) setItems([]); }
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [value]);

  useEffect(() => {
    const close = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = async (s) => {
    setOpen(false); setItems([]);
    picked.current = s.text; onChange(s.text);
    try {
      const { data } = await base44.functions.invoke('placesAutocomplete', { action: 'details', id: s.id, session: session.current });
      if (data?.address) { picked.current = data.address; onChange(data.address); }
      onSelect?.({ address: data?.address || s.text, lat: data?.lat ?? null, lng: data?.lng ?? null });
    } catch { onSelect?.({ address: s.text }); }
    session.current = newSession(); // Google bills a typing-then-pick round as one session
  };

  const keyDown = (e) => {
    if (open && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); return; }
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); return; }
    }
    if (e.key === 'Enter') onEnter?.();
  };

  return (
    <div ref={wrap} className="relative">
      <Input {...rest} value={value} placeholder={placeholder} autoComplete="off" className={className}
        onChange={(e) => { picked.current = null; onChange(e.target.value); }}
        onFocus={() => items.length && setOpen(true)} onKeyDown={keyDown}
        role="combobox" aria-expanded={open && items.length > 0} aria-autocomplete="list" />
      {open && items.length > 0 && (
        <ul role="listbox" className="absolute z-50 mt-1 w-full rounded-xl border bg-popover shadow-lg overflow-hidden">
          {items.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s)} onMouseEnter={() => setActive(i)}
                className={`w-full text-left px-3 py-2 flex gap-2 items-start ${i === active ? 'bg-muted' : ''}`}>
                <MapPin className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm truncate">{s.main}</span>
                  {s.secondary && <span className="block text-xs text-muted-foreground truncate">{s.secondary}</span>}
                </span>
              </button>
            </li>
          ))}
          <li className="px-3 py-1 text-[10px] text-right text-muted-foreground border-t">powered by Google</li>
        </ul>
      )}
    </div>
  );
}
