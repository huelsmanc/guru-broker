// Settings → Integrations: connect the brokerage's Follow Up Boss account (the owner's API key),
// choose which stages open a deal, the Zillow Flex referral, and which Follow Up Boss user is which agent.
import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, Unplug } from 'lucide-react';

const ago = (d) => { if (!d) return 'never'; const m = Math.round((Date.now() - Date.parse(d)) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : new Date(d).toLocaleString(); };
const sel = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:text-sm';

export default function FubIntegration({ brokerageId }) {
  const [s, setS] = useState(null);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [agents, setAgents] = useState([]);
  const [draft, setDraft] = useState(null);

  const load = async () => {
    const { data } = await base44.functions.invoke('fub', { action: 'status' });
    setS(data); setDraft(data.connected ? { contract_stages: data.contract_stages, closed_stage: data.closed_stage, flex_sources: (data.flex_sources || []).join(', '), flex_pct: data.flex_pct, user_map: data.user_map || {} } : null);
  };
  useEffect(() => {
    load().catch((e) => setMsg(e.message));
    if (brokerageId) base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 1000).then(setAgents).catch(() => {});
  }, [brokerageId]);

  const run = async (label, fn) => { setBusy(label); setMsg(''); try { await fn(); } catch (e) { setMsg(e.message); } finally { setBusy(''); } };
  const connect = () => run('connect', async () => { const { data } = await base44.functions.invoke('fub', { action: 'connect', api_key: key }); setKey(''); setS(data); await load(); });
  const save = () => run('save', async () => { const { data } = await base44.functions.invoke('fub', { action: 'settings', ...draft }); setS(data); setMsg('Saved'); });
  const sync = () => run('sync', async () => { const { data } = await base44.functions.invoke('fub', { action: 'sync' }); setS(data); setMsg(data.made ? `${data.made} new deal${data.made === 1 ? '' : 's'} opened.` : 'Checked: nothing new.'); });
  const disconnect = () => { if (window.confirm('Disconnect Follow Up Boss? Deals already opened stay as they are.')) run('disconnect', async () => { await base44.functions.invoke('fub', { action: 'disconnect' }); await load(); }); };

  if (!s) return <div className="bg-card rounded-2xl border p-6"><Loader2 className="w-5 h-5 animate-spin" /></div>;
  return (
    <div className="bg-card rounded-2xl border p-6 space-y-5">
      <div>
        <h3 className="font-semibold text-lg">Follow Up Boss</h3>
        <p className="text-sm text-muted-foreground mt-1">When a client moves to Under Contract in Follow Up Boss, the deal opens here for the right agent and TC, with the Zillow Flex referral already on the commission. When it closes here, Follow Up Boss gets the closed stage, the price and a note.</p>
      </div>

      {!s.system_ready && (
        <div className="flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>One-time setup by the platform owner first: register Guru Broker at <a className="underline" href="https://apps.followupboss.com/system-registration" target="_blank" rel="noreferrer">Follow Up Boss system registration</a>, then add <b>FUB_SYSTEM</b> and <b>FUB_SYSTEM_KEY</b> in Vercel and redeploy.</p>
        </div>
      )}

      {!s.connected ? (
        <div className="space-y-2">
          <Label>API key</Label>
          <div className="flex gap-2">
            <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Follow Up Boss → Admin → API" />
            <Button onClick={connect} disabled={!key.trim() || !!busy || !s.system_ready}>{busy === 'connect' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Connect'}</Button>
          </div>
          <p className="text-xs text-muted-foreground">Use the account <b>owner's</b> key: it can see every agent's leads, and it lets Follow Up Boss send stage changes instantly. The key is stored encrypted and never shown again.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1.5 text-green-700"><CheckCircle2 className="w-4 h-4" /> Connected{s.account?.name ? ` as ${s.account.name}` : ''}</span>
            <span className="text-muted-foreground">Last check: {ago(s.last_sync)}</span>
            <span className="text-muted-foreground">{s.webhook ? 'Instant updates on' : 'Checks every 10 minutes'}</span>
          </div>
          {s.last_error && <p className="text-sm text-red-600">Last problem: {s.last_error}</p>}

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Stages that open a deal</Label>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(s.stages.length ? s.stages : draft.contract_stages).map((st) => {
                  const on = draft.contract_stages.includes(st);
                  return <button key={st} type="button" onClick={() => setDraft({ ...draft, contract_stages: on ? draft.contract_stages.filter((x) => x !== st) : [...draft.contract_stages, st] })}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{st}</button>;
                })}
              </div>
            </div>
            <div>
              <Label>Stage to set when a deal closes here</Label>
              <select className={sel} value={draft.closed_stage} onChange={(e) => setDraft({ ...draft, closed_stage: e.target.value })}>
                {(s.stages.length ? s.stages : [draft.closed_stage]).map((st) => <option key={st}>{st}</option>)}
              </select>
            </div>
            <div>
              <Label>Zillow Flex referral fee (%)</Label>
              <Input className="mt-1" inputMode="decimal" value={draft.flex_pct} onChange={(e) => setDraft({ ...draft, flex_pct: e.target.value.replace(/[^\d.]/g, '') })} />
              <p className="text-xs text-muted-foreground mt-1">Added to the commission of deals from Flex leads. Check it against your Zillow agreement.</p>
            </div>
            <div>
              <Label>Lead sources that count as Flex</Label>
              <Input className="mt-1" value={draft.flex_sources} onChange={(e) => setDraft({ ...draft, flex_sources: e.target.value })} placeholder="Zillow Flex" />
              <p className="text-xs text-muted-foreground mt-1">Matched against the lead's source and tags. Separate with commas.</p>
            </div>
          </div>

          <div>
            <Label>Follow Up Boss users</Label>
            <p className="text-xs text-muted-foreground mb-2">Matched to agents by email. Pick the agent for anyone who isn't.</p>
            <div className="divide-y rounded-lg border">
              {s.users.map((u) => (
                <div key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1"><p className="text-sm truncate">{u.name}</p><p className="text-[11px] text-muted-foreground truncate">{u.email}{u.role ? ` · ${u.role}` : ''}</p></div>
                  <select className="rounded-md border border-input bg-background px-2 py-1.5 text-base md:text-sm max-w-[55%]" value={draft.user_map[u.id] || ''}
                    onChange={(e) => setDraft({ ...draft, user_map: { ...draft.user_map, [u.id]: e.target.value } })}>
                    <option value="">Not matched</option>
                    {agents.map((a) => <option key={a.id} value={String(a.email).toLowerCase()}>{a.display_name || a.full_name || a.email}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {s.unmatched?.length > 0 && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              <p className="font-medium">Waiting for an agent match ({s.unmatched.length})</p>
              <p className="text-xs mt-0.5">These clients are Under Contract, but their Follow Up Boss user isn't matched to an agent here: {s.unmatched.slice(0, 6).map((x) => `${x.name}${x.assigned_to ? ` (${x.assigned_to})` : ''}`).join(', ')}{s.unmatched.length > 6 ? '…' : ''}</p>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} disabled={!!busy}>{busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>
            <Button variant="outline" onClick={sync} disabled={!!busy} className="gap-1.5">{busy === 'sync' ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Check now</Button>
            <Button variant="ghost" onClick={disconnect} disabled={!!busy} className="gap-1.5 text-red-600 sm:ml-auto"><Unplug className="w-4 h-4" /> Disconnect</Button>
          </div>
        </>
      )}
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
