// Deal page: the client's Follow Up Boss record and their latest calls, texts and notes. Shown only
// when the brokerage has connected Follow Up Boss. A deal opened by hand can be linked here.
import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Phone, MessageSquare, StickyNote, Loader2, Link2, X } from 'lucide-react';

const ICON = { call: Phone, text: MessageSquare, note: StickyNote };
const when = (d) => { try { return new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch { return ''; } };

export default function FubPanel({ tx, canEdit }) {
  const queryClient = useQueryClient();
  const key = ['fub-deal', tx.id, tx.fub_person_id || ''];
  const { data, isLoading } = useQuery({
    queryKey: key,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => (await base44.functions.invoke('fub', { action: 'deal', transaction_id: tx.id })).data,
  });
  const [q, setQ] = useState('');
  const [found, setFound] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  if (isLoading || !data?.connected) return null;
  const search = async () => {
    if (q.trim().length < 2) return;
    setBusy(true); setNote('');
    try { const r = (await base44.functions.invoke('fub', { action: 'search', q })).data; setFound(r.people || []); if (r.note) setNote(r.note); } catch (e) { setNote(e.message); } finally { setBusy(false); }
  };
  const link = async (id) => {
    setBusy(true);
    try { await base44.functions.invoke('fub', { action: 'link', transaction_id: tx.id, person_id: id }); setFound(null); setQ(''); queryClient.invalidateQueries({ queryKey: ['fub-deal', tx.id] }); queryClient.invalidateQueries({ queryKey: ['transaction', tx.id] }); } catch (e) { setNote(e.message); } finally { setBusy(false); }
  };
  const unlink = async () => {
    if (!window.confirm('Unlink this deal from Follow Up Boss? Nothing is deleted there.')) return;
    await base44.functions.invoke('fub', { action: 'unlink', transaction_id: tx.id }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ['fub-deal', tx.id] });
  };

  const p = data.person;
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="font-semibold">Follow Up Boss</p>
        {p && canEdit && <button onClick={unlink} className="text-[11px] text-muted-foreground hover:text-foreground">Unlink</button>}
      </div>
      {p ? (
        <>
          <a href={p.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">{p.name}<ExternalLink className="w-3.5 h-3.5" /></a>
          <p className="text-xs text-muted-foreground mt-0.5">{[p.stage, p.source, p.assigned_to && `Agent: ${p.assigned_to}`].filter(Boolean).join(' · ')}</p>
          {(data.activity || []).length > 0 && (
            <ul className="mt-3 space-y-2">
              {data.activity.slice(0, 6).map((a, i) => {
                const Icon = ICON[a.kind] || StickyNote;
                return (
                  <li key={i} className="flex gap-2 text-sm">
                    <Icon className="w-3.5 h-3.5 mt-1 shrink-0 text-muted-foreground" />
                    <div className="min-w-0"><p className="line-clamp-2 break-words">{a.text || (a.kind === 'call' ? 'Call' : '')}</p><p className="text-[11px] text-muted-foreground">{[a.by, when(a.at)].filter(Boolean).join(' · ')}</p></div>
                  </li>
                );
              })}
            </ul>
          )}
          {data.hidden?.count > 0 && (
            <a href={p.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
              <span className="flex items-center gap-2 min-w-0"><MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" /><span className="truncate">{data.hidden.count === 1 ? '1 private conversation' : `${data.hidden.count} private conversations`}{data.hidden.last ? ` · last ${when(data.hidden.last)}` : ''}</span></span>
              <span className="shrink-0 flex items-center gap-1 text-primary font-medium">View in Follow Up Boss <ExternalLink className="w-3.5 h-3.5" /></span>
            </a>
          )}
        </>
      ) : canEdit ? (
        <>
          <p className="text-xs text-muted-foreground mb-2">Link this deal to the client in Follow Up Boss to see their history here and update their stage when it closes.</p>
          <div className="flex gap-1.5">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search()} placeholder="Name, email or phone"
              className="flex-1 min-w-0 rounded-md border border-input bg-background px-3 py-1.5 text-base md:text-sm" />
            <button onClick={search} disabled={busy} className="rounded-md border px-3 text-sm">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Find'}</button>
          </div>
          {note && <p className="text-xs text-amber-700 mt-2">{note}</p>}
          {found && (
            <ul className="mt-2 divide-y rounded-md border">
              {!found.length && <li className="p-2 text-xs text-muted-foreground">No one found.</li>}
              {found.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2 p-2">
                  <div className="min-w-0"><p className="text-sm truncate">{f.name}</p><p className="text-[11px] text-muted-foreground truncate">{[f.email || f.phone, f.stage].filter(Boolean).join(' · ')}</p></div>
                  <button onClick={() => link(f.id)} disabled={busy} className="shrink-0 flex items-center gap-1 rounded-md bg-primary text-primary-foreground px-2 py-1 text-xs"><Link2 className="w-3 h-3" /> Link</button>
                </li>
              ))}
              <li className="p-1.5 text-right"><button onClick={() => setFound(null)} className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5"><X className="w-3 h-3" /> Close</button></li>
            </ul>
          )}
        </>
      ) : <p className="text-sm text-muted-foreground">Not linked to Follow Up Boss.</p>}
    </div>
  );
}
