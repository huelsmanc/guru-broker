// My Leads: each agent's Follow Up Boss leads inside Guru Broker (admins can see any agent's).
// Call, text or email in a tap, add a note, or move the stage; reaching Under Contract opens the
// deal here. Campaigns, routing and the dialer stay in Follow Up Boss.
import React, { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Phone, MessageSquare, Mail, ExternalLink, Loader2, Search, X, StickyNote, ArrowLeft, Users } from 'lucide-react';
import MobilePageHeader from '@/components/layout/MobilePageHeader';

const FUB = 'https://app.followupboss.com';
const ICON = { call: Phone, text: MessageSquare, note: StickyNote };
function ago(d) {
  if (!d) return '';
  const m = Math.round((Date.now() - Date.parse(d)) / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  const days = Math.round(m / 1440);
  return days < 30 ? `${days}d ago` : new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const digits = (p) => String(p || '').replace(/[^\d+]/g, '');

export default function MyLeads() {
  const { user } = useOutletContext();
  const [stage, setStage] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [agentId, setAgentId] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => { const t = setTimeout(() => setSearch(q.trim()), 350); return () => clearTimeout(t); }, [q]);

  const leads = useInfiniteQuery({
    queryKey: ['my-leads', stage, search, agentId],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => (await base44.functions.invoke('fub', { action: 'leads', stage: stage || undefined, q: search || undefined, agent_id: agentId || undefined, offset: pageParam })).data,
    getNextPageParam: (last, all) => ((last.people || []).length === 50 ? all.length * 50 : undefined),
    retry: false,
  });
  const first = leads.data?.pages?.[0];
  const people = (leads.data?.pages || []).flatMap((p) => p.people || []);
  const stages = first?.stages || [];

  return (
    <>
      <MobilePageHeader title="My Leads" />
      <div className="p-4 md:p-8 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold">My Leads</h1>
            <p className="text-sm text-muted-foreground">From Follow Up Boss. Moving a lead to Under Contract opens the deal here.</p>
          </div>
          <a href={FUB} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm hover:bg-muted">Open Follow Up Boss <ExternalLink className="w-4 h-4" /></a>
        </div>

        {leads.error ? (
          <div className="rounded-2xl border bg-card p-6 text-sm">{leads.error.message}</div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or phone"
                  className="w-full rounded-xl border bg-background pl-9 pr-3 py-2 text-base md:text-sm" />
              </div>
              {first?.admin && (
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className="rounded-xl border bg-background px-3 py-2 text-base md:text-sm">
                  <option value="">Everyone's leads</option>
                  {(first.agents || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              )}
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2 [scrollbar-width:none]">
              {['', ...stages.filter((s) => s !== 'Trash')].map((s) => (
                <button key={s || 'all'} onClick={() => setStage(s)} className={`shrink-0 rounded-full border px-3 py-1 text-xs ${stage === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{s || 'All'}</button>
              ))}
            </div>

            {leads.isLoading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              : !people.length ? (
                <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground"><Users className="w-8 h-8 mx-auto mb-2 opacity-40" />No leads here.</div>
              ) : (
                <div className="rounded-2xl border bg-card divide-y">
                  {people.map((p) => (
                    <div key={p.id} className="flex items-center gap-3 px-3 sm:px-4 py-3">
                      <button onClick={() => setOpen(p.id)} className="min-w-0 flex-1 text-left">
                        <p className="font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{[p.stage, p.source, first?.admin && !agentId ? p.assigned_to : null, p.last_activity && `Active ${ago(p.last_activity)}`].filter(Boolean).join(' · ')}</p>
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.phone && <a href={`tel:${digits(p.phone)}`} className="p-2 rounded-lg hover:bg-muted" aria-label={`Call ${p.name}`}><Phone className="w-4 h-4" /></a>}
                        {p.phone && <a href={`sms:${digits(p.phone)}`} className="p-2 rounded-lg hover:bg-muted" aria-label={`Text ${p.name}`}><MessageSquare className="w-4 h-4" /></a>}
                        {p.email && <a href={`mailto:${p.email}`} className="p-2 rounded-lg hover:bg-muted hidden sm:inline-flex" aria-label={`Email ${p.name}`}><Mail className="w-4 h-4" /></a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            {leads.hasNextPage && (
              <div className="flex justify-center mt-4">
                <button onClick={() => leads.fetchNextPage()} disabled={leads.isFetchingNextPage} className="rounded-xl border px-4 py-2 text-sm">{leads.isFetchingNextPage ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load more'}</button>
              </div>
            )}
          </>
        )}
      </div>
      {open && <LeadPanel id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function LeadPanel({ id, onClose }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['lead', id], retry: false,
    queryFn: async () => (await base44.functions.invoke('fub', { action: 'lead', person_id: id })).data,
  });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const p = data?.person;
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['lead', id] }); queryClient.invalidateQueries({ queryKey: ['my-leads'] }); };

  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy('note'); setMsg('');
    try { await base44.functions.invoke('fub', { action: 'note', person_id: id, text: note }); setNote(''); setMsg('Note saved to Follow Up Boss'); refresh(); } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };
  const move = async (stage) => {
    if (!stage || stage === p.stage) return;
    setBusy('stage'); setMsg('');
    try {
      const r = (await base44.functions.invoke('fub', { action: 'stage', person_id: id, stage })).data;
      setMsg(r.deal?.opened ? 'Moved. The deal is open in Transactions.' : `Moved to ${stage}.`);
      refresh();
    } catch (e) { setMsg(e.message); } finally { setBusy(''); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex justify-end" onClick={onClose}>
      <div className="h-full w-full sm:max-w-md bg-background shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted sm:hidden" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
          <p className="font-semibold flex-1 truncate">{p?.name || 'Lead'}</p>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted hidden sm:block" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          {error ? <p className="text-sm">{error.message}</p> : isLoading || !p ? <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
            <>
              <div>
                <p className="text-sm text-muted-foreground">{[p.source, p.assigned_to && `Agent: ${p.assigned_to}`, p.price && `$${Number(p.price).toLocaleString()}`].filter(Boolean).join(' · ')}</p>
                {p.tags?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{p.tags.map((t) => <span key={t} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">{t}</span>)}</div>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <a href={p.phone ? `tel:${digits(p.phone)}` : undefined} className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs ${p.phone ? 'hover:bg-muted' : 'opacity-40 pointer-events-none'}`}><Phone className="w-5 h-5" /> Call</a>
                <a href={p.phone ? `sms:${digits(p.phone)}` : undefined} className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs ${p.phone ? 'hover:bg-muted' : 'opacity-40 pointer-events-none'}`}><MessageSquare className="w-5 h-5" /> Text</a>
                <a href={p.email ? `mailto:${p.email}` : undefined} className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs ${p.email ? 'hover:bg-muted' : 'opacity-40 pointer-events-none'}`}><Mail className="w-5 h-5" /> Email</a>
              </div>
              <div className="text-sm space-y-0.5">
                {p.phone && <p>{p.phone}</p>}
                {p.email && <p className="truncate">{p.email}</p>}
              </div>

              <div>
                <label className="text-sm font-medium">Stage</label>
                <select value={p.stage} disabled={busy === 'stage'} onChange={(e) => move(e.target.value)} className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base md:text-sm">
                  {(data.stages || []).map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              {data.deals?.length > 0 && (
                <div className="rounded-xl border p-3 text-sm">
                  {data.deals.map((d) => <Link key={d.id} to={`/Transactions/${d.id}`} className="block text-primary hover:underline">Deal: {d.address} ({d.status})</Link>)}
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Add a note</label>
                <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Saved to Follow Up Boss"
                  className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-base md:text-sm" />
                <button onClick={saveNote} disabled={!note.trim() || !!busy} className="mt-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50">{busy === 'note' ? 'Saving…' : 'Save note'}</button>
              </div>
              {msg && <p className="text-sm text-muted-foreground">{msg}</p>}

              <div>
                <p className="text-sm font-medium mb-2">Recent activity</p>
                {!data.activity?.length ? (!data.hidden?.count && <p className="text-sm text-muted-foreground">Nothing yet.</p>) : (
                  <ul className="space-y-2.5">
                    {data.activity.map((a, i) => {
                      const Icon = ICON[a.kind] || StickyNote;
                      return (
                        <li key={i} className="flex gap-2 text-sm">
                          <Icon className="w-3.5 h-3.5 mt-1 shrink-0 text-muted-foreground" />
                          <div className="min-w-0"><p className="whitespace-pre-wrap break-words">{a.text}</p><p className="text-[11px] text-muted-foreground">{[a.by, ago(a.at)].filter(Boolean).join(' · ')}</p></div>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {data.hidden?.count > 0 && (
                  <a href={p.url} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted">
                    <span className="flex items-center gap-2 min-w-0"><MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground" /><span className="truncate">{data.hidden.count === 1 ? '1 private conversation' : `${data.hidden.count} private conversations`}{data.hidden.last ? ` · ${ago(data.hidden.last)}` : ''}</span></span>
                    <span className="shrink-0 flex items-center gap-1 text-primary font-medium">View <ExternalLink className="w-3.5 h-3.5" /></span>
                  </a>
                )}
              </div>
              <a href={p.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary">Open in Follow Up Boss <ExternalLink className="w-4 h-4" /></a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
