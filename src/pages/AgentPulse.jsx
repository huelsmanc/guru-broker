// Agent pulse (admins): who might be drifting, and why, so you can check in before they leave.
import React, { useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Activity, Loader2, RefreshCw, MessageCircle, Check, ChevronDown } from 'lucide-react';
import { Avatar } from '@/components/stories/storyLook';
import MobilePageHeader from '@/components/layout/MobilePageHeader';
import { isAdminRole, can } from '../../shared/permissions.generated.js';

const LEVEL = {
  at_risk: { label: 'At risk', pill: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900', bar: 'bg-red-500' },
  watch: { label: 'Watch', pill: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900', bar: 'bg-amber-400' },
  steady: { label: 'Steady', pill: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900', bar: 'bg-emerald-500' },
};
const ago = (d) => {
  if (!d) return 'not yet';
  const n = Math.floor((Date.now() - Date.parse(d)) / 864e5);
  return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`;
};
const short = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '');

export default function AgentPulse() {
  const { user } = useOutletContext();
  const queryClient = useQueryClient();
  const allowed = isAdminRole(user?.role) || can(user, 'users.manage');
  const [refreshing, setRefreshing] = useState(false);
  const [showSteady, setShowSteady] = useState(false);
  const key = ['agent-pulse', user?.brokerage_id];
  const { data, isLoading, error } = useQuery({
    queryKey: key, enabled: allowed, staleTime: 5 * 60_000,
    queryFn: async () => (await base44.functions.invoke('agentPulse', { action: 'list' })).data,
  });
  if (!allowed) return <div className="p-8 text-sm">Admins only.</div>;

  const agents = data?.agents || [];
  const drifting = agents.filter((a) => a.level !== 'steady');
  const steady = agents.filter((a) => a.level === 'steady');
  const count = (l) => agents.filter((a) => a.level === l).length;
  const refresh = async () => {
    setRefreshing(true);
    try { const { data: d } = await base44.functions.invoke('agentPulse', { action: 'list', refresh: true }); queryClient.setQueryData(key, d); }
    catch (err) { window.alert(err.message); } finally { setRefreshing(false); }
  };

  return (
    <>
      <MobilePageHeader title="Agent pulse" />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Activity className="w-6 h-6 text-primary" /> Agent pulse</h1>
            <p className="text-sm text-muted-foreground">Who might be drifting, from app use, deals, training and Follow Up Boss. A check-in now beats an exit interview later.</p>
          </div>
          <button onClick={refresh} disabled={refreshing || isLoading} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          : error ? <p className="text-sm text-red-600">{error.message}</p> : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-6">
                {['at_risk', 'watch', 'steady'].map((l) => (
                  <div key={l} className="rounded-2xl border bg-card p-4">
                    <div className="flex items-center gap-2"><span className={`w-2 h-2 rounded-full ${LEVEL[l].bar}`} /><span className="text-xs text-muted-foreground">{LEVEL[l].label}</span></div>
                    <p className="text-2xl font-bold mt-1 tabular-nums">{count(l)}</p>
                  </div>
                ))}
              </div>

              {!drifting.length ? (
                <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
                  <p className="text-3xl mb-2">💪</p>
                  <p className="font-medium">Everyone looks steady</p>
                  <p className="text-sm text-muted-foreground mt-1">You'll get an alert on Monday mornings if that changes.</p>
                </div>
              ) : (
                <div className="space-y-3">{drifting.map((a) => <AgentCard key={a.email} a={a} onSaved={(checkin) => queryClient.setQueryData(key, (d) => ({ ...d, agents: d.agents.map((x) => (x.email === a.email ? { ...x, checkin, checked_in: true } : x)) }))} />)}</div>
              )}

              {steady.length > 0 && (
                <div className="mt-6">
                  <button onClick={() => setShowSteady(!showSteady)} className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                    <ChevronDown className={`w-4 h-4 transition-transform ${showSteady ? '' : '-rotate-90'}`} /> Steady ({steady.length})
                  </button>
                  {showSteady && (
                    <ul className="mt-2 rounded-2xl border bg-card divide-y">
                      {steady.map((a) => (
                        <li key={a.email} className="flex items-center gap-3 px-4 py-2.5">
                          <Avatar name={a.name} photo={a.photo} size={32} />
                          <div className="min-w-0 flex-1"><p className="text-sm font-medium truncate">{a.name}</p><p className="text-xs text-muted-foreground">Active {ago(a.last_active)} · {a.deals_90} new deal{a.deals_90 === 1 ? '' : 's'} in 90 days</p></div>
                          {a.signals[0] && <span className="hidden sm:block text-xs text-muted-foreground max-w-[45%] truncate">{a.signals[0].text}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-6">
                Updated {data?.computed_at ? new Date(data.computed_at).toLocaleString() : 'just now'}. App activity is tracked from October 3, 2026, so "last opened" fills in as people use the app.
                Agents can't see this page.
              </p>
            </>
          )}
      </div>
    </>
  );
}

function AgentCard({ a, onSaved }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const L = LEVEL[a.level];
  const save = async () => {
    setBusy(true);
    try { const { data } = await base44.functions.invoke('agentPulse', { action: 'check_in', email: a.email, note }); onSaved(data.checkin); setOpen(false); setNote(''); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  return (
    <div className={`rounded-2xl border bg-card overflow-hidden ${a.checked_in ? 'opacity-80' : ''}`}>
      <div className={`h-1 ${L.bar}`} />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <Avatar name={a.name} photo={a.photo} size={44} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold">{a.name}</p>
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${L.pill}`}>{L.label}</span>
              {a.checked_in && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">Checked in {short(a.checkin.at)}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">Last active {ago(a.last_active)} · {a.deals_90} new deal{a.deals_90 === 1 ? '' : 's'} in 90 days{a.last_deal ? ` · last ${short(a.last_deal)}` : ''}{a.fub_leads != null ? ` · ${a.fub_leads} FUB leads` : ''}</p>
          </div>
        </div>
        <ul className="mt-3 space-y-1.5">
          {a.signals.map((s) => (
            <li key={s.key} className="flex gap-2 text-sm">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${s.points >= 3 ? 'bg-red-500' : s.points === 2 ? 'bg-amber-500' : 'bg-slate-400'}`} />{s.text}
            </li>
          ))}
        </ul>
        {a.checkin?.note && <p className="mt-3 text-xs rounded-lg bg-muted/60 px-3 py-2"><span className="font-medium">{a.checkin.by_name}, {short(a.checkin.at)}:</span> {a.checkin.note}</p>}
        {open ? (
          <div className="mt-3 space-y-2">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="How did it go? (optional, only admins see this)" className="w-full rounded-xl border bg-background px-3 py-2 text-base md:text-sm resize-none" />
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Save check-in</button>
              <button onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-sm text-muted-foreground">Cancel</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/DirectMessages?dm=${encodeURIComponent(a.email)}`} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-muted"><MessageCircle className="w-4 h-4" /> Message {String(a.name).split(' ')[0]}</Link>
            <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-muted"><Check className="w-4 h-4" /> I checked in</button>
          </div>
        )}
      </div>
    </div>
  );
}
