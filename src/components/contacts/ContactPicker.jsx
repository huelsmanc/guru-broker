import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, Plus } from 'lucide-react';
import { myContacts } from '@/lib/contacts';

/**
 * Type to search your contacts; pick one to add it. `exclude`: emails already added.
 * onPick(contact). Optional onCreateNew(text) shows "Add a new contact" when nothing matches.
 */
export default function ContactPicker({ user, onPick, exclude = [], placeholder = 'Search your contacts', onCreateNew, autoFocus }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const { data: contacts = [], isLoading } = useQuery({
    queryKey: ['my-contacts', user?.email],
    enabled: !!user?.email,
    queryFn: () => myContacts(user),
  });
  const skip = new Set(exclude.map((e) => String(e || '').toLowerCase()).filter(Boolean));
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return contacts
      .filter((c) => !c.email || !skip.has(c.email.toLowerCase()))
      .filter((c) => !t || [c.name, c.email, c.phone, c.company, c.type].some((v) => String(v || '').toLowerCase().includes(t)))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, q, exclude.join(',')]);

  return (
    <div className="relative" ref={box} onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) setOpen(false); }}>
      <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5">
        <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <input value={q} autoFocus={autoFocus} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
          placeholder={placeholder} className="h-9 w-full bg-transparent text-sm outline-none" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-72 overflow-y-auto">
          {isLoading ? <p className="px-3 py-2 text-xs text-muted-foreground">Loading…</p>
            : !contacts.length ? <p className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> No contacts yet. Add them on the Contacts page.</p>
            : !matches.length ? <p className="px-3 py-2 text-xs text-muted-foreground">No match for "{q}".</p>
            : matches.map((c) => (
              <button key={c.id} type="button" tabIndex={0}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(c); setQ(''); setOpen(false); }}
                className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center flex-shrink-0">{String(c.name || c.email || '?').slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium truncate">{c.name}</span>
                  <span className="block text-xs text-muted-foreground truncate">{[c.type, c.email, c.phone].filter(Boolean).join(' · ')}</span>
                </span>
              </button>
            ))}
          {onCreateNew && q.trim() && (
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onCreateNew(q.trim()); setQ(''); setOpen(false); }}
              className="w-full text-left px-3 py-2 border-t border-border text-sm text-primary hover:bg-muted flex items-center gap-1.5">
              <Plus className="w-4 h-4" /> Add "{q.trim()}" as a new contact
            </button>
          )}
        </div>
      )}
    </div>
  );
}
