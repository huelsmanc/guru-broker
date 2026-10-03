// "Populate with": pick the deal fact a box fills itself with. Groups on the left, facts on the right
// (stacked on a phone), with search. For checkboxes: tick it automatically when a fact matches.
import React, { useMemo, useState } from 'react';
import { Search, ChevronRight, Check, X } from 'lucide-react';
import { DEAL_KEYS, DEAL_GROUPS, CHOICE_KEYS } from './dealKeys.js';

export default function PopulatePicker({ kind = 'text', value, onPick, onCancel }) {
  const choices = kind === 'checkbox';
  const items = useMemo(() => (choices
    ? CHOICE_KEYS.flatMap((c) => c.options.map((o) => ({ id: `${c.key}::${o}`, group: c.key, label: `${c.label} is ${o}` })))
    : DEAL_KEYS.map((k) => ({ id: k.key, group: k.group, label: k.label }))), [choices]);
  const groups = choices ? CHOICE_KEYS.map((c) => ({ id: c.key, label: c.label })) : DEAL_GROUPS;
  const current = items.find((i) => i.id === value);
  const [group, setGroup] = useState(current?.group || groups[0].id);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(value || '');
  const needle = q.trim().toLowerCase();
  const shown = needle ? items.filter((i) => `${i.label} ${groups.find((g) => g.id === i.group)?.label}`.toLowerCase().includes(needle)) : items.filter((i) => i.group === group);

  return (
    <div className="w-full" onPointerDown={(e) => e.stopPropagation()}>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search deal facts"
          className="w-full rounded-lg border bg-background pl-8 pr-2 py-1.5 text-base md:text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      </div>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-1.5 rounded-lg border p-1 max-h-60 overflow-hidden">
        {!needle && (
          <ul className="overflow-y-auto max-h-56 pr-0.5">
            {groups.map((g) => (
              <li key={g.id}>
                <button type="button" onClick={() => setGroup(g.id)}
                  className={`w-full flex items-center justify-between gap-1 rounded-md px-2 py-1.5 text-left text-[13px] ${group === g.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}>
                  <span className="truncate">{g.label}</span><ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <ul className={`overflow-y-auto max-h-56 ${needle ? 'col-span-2' : 'border-l pl-1'}`}>
          {shown.map((i) => (
            <li key={i.id}>
              <button type="button" onClick={() => setPick(i.id)} onDoubleClick={() => onPick(i.id)}
                className={`w-full flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[13px] ${pick === i.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                <span className="truncate flex-1">{needle && !choices ? `${groups.find((g) => g.id === i.group)?.label} › ` : ''}{i.label}</span>
                {pick === i.id && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>
            </li>
          ))}
          {!shown.length && <li className="px-2 py-3 text-xs text-muted-foreground">No match.</li>}
        </ul>
      </div>
      <div className="mt-2 flex items-center gap-2">
        {value && <button type="button" onClick={() => onPick(null)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /> Don't populate</button>}
        <button type="button" onClick={onCancel} className="ml-auto rounded-full px-3 py-1 text-xs hover:bg-muted">Cancel</button>
        <button type="button" disabled={!pick || pick === value} onClick={() => onPick(pick)} className="rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs font-medium disabled:opacity-40">Select</button>
      </div>
    </div>
  );
}
