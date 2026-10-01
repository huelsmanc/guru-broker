import React, { useState } from 'react';
import { Sparkles, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';

// "Catch me up": AI summary of what you missed since you last read this conversation.
export default function CatchUp({ kind, convKey, since, className }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState(null);
  const run = async () => {
    setOpen(true);
    if (data) return;
    setBusy(true);
    try { setData((await base44.functions.invoke('chatCatchUp', { kind, key: convKey, since: since || undefined })).data); }
    catch (err) { setData({ error: err.message }); } finally { setBusy(false); }
  };
  const s = data?.summary;
  return (
    <>
      <button onClick={run} className={cn('p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground', className)} title="Catch me up (AI summary of what you missed)"><Sparkles className="w-4 h-4" /></button>
      {open && (
        <div className="absolute right-3 top-14 z-30 w-[min(420px,calc(100vw-1.5rem))] rounded-2xl border bg-card shadow-2xl p-4 text-sm">
          <div className="flex items-center gap-2 mb-2"><Sparkles className="w-4 h-4 text-primary" /><p className="font-semibold flex-1">Catch me up</p><button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button></div>
          {busy ? <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Reading the conversation…</p>
            : data?.error ? <p className="text-red-600">{data.error}</p>
              : !s ? <p className="text-muted-foreground">You're all caught up. Nothing much new since you last read this.</p>
                : (
                  <div className="space-y-3 max-h-[60dvh] overflow-y-auto">
                    <p>{s.tldr}</p>
                    {s.for_me?.length > 0 && <div><p className="text-xs font-semibold uppercase text-amber-700 mb-1">Needs you</p><ul className="list-disc pl-5 space-y-0.5">{s.for_me.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                    {s.decisions?.length > 0 && <div><p className="text-xs font-semibold uppercase text-muted-foreground mb-1">Decided</p><ul className="list-disc pl-5 space-y-0.5">{s.decisions.map((x) => <li key={x}>{x}</li>)}</ul></div>}
                    {s.action_items?.length > 0 && <div><p className="text-xs font-semibold uppercase text-muted-foreground mb-1">To-dos</p><ul className="space-y-0.5">{s.action_items.map((a, i) => <li key={i}><b>{a.who}:</b> {a.what}{a.when ? ` (${a.when})` : ''}</li>)}</ul></div>}
                    <p className="text-[11px] text-muted-foreground">From {data.count} new message{data.count === 1 ? '' : 's'}. AI can miss things; skim anything important.</p>
                  </div>
                )}
        </div>
      )}
    </>
  );
}
