import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, Check, AlertTriangle, Users, History, Scale, Database, Lock, Undo2, FileUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { normalizeRole, isAdminRole, can } from '../../shared/permissions.generated.js';
import { parseCsv, brokermintPerson, HISTORY_FIELDS, autoMapHistory, buildHistory, readBase44File } from '../../shared/importers.js';
import { capYearStart } from '../../shared/commission.js';
import { SCHEMA } from '@/api/schema.generated.js';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const sel = 'rounded-md border border-input bg-background px-2 py-1.5 text-sm';
const readText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsText(file); });

function Picker({ accept, multiple, onFiles, label }) {
  return (
    <label className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center cursor-pointer hover:bg-muted/40"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles([...e.dataTransfer.files]); }}>
      <FileUp className="w-7 h-7 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
      <span className="text-xs text-muted-foreground">Click to choose, or drop {multiple ? 'files' : 'the file'} here</span>
      <input type="file" className="hidden" accept={accept} multiple={multiple} onChange={(e) => { onFiles([...e.target.files]); e.target.value = ''; }} />
    </label>
  );
}

function Progress({ done, total, label }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{done} of {total}</span></div>
      <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export default function Import() {
  const { user, brokerageId } = useOutletContext();
  const role = normalizeRole(user?.role);
  const boss = ['owner', 'broker'].includes(role) || user?.role === 'super_admin';
  const money_ = boss || (isAdminRole(user?.role) && can(user, 'accounting.access'));
  const [tab, setTab] = useState(boss ? 'people' : 'history');
  const [target, setTarget] = useState(brokerageId || '');
  useEffect(() => { if (brokerageId) setTarget(brokerageId); }, [brokerageId]);
  const { data: brokerages = [] } = useQuery({ queryKey: ['all-brokerages'], queryFn: () => base44.entities.Brokerage.list('name', 500), enabled: user?.role === 'super_admin' });

  if (!money_) return <div className="p-8 text-sm">Only the owner, broker or accounting can import data.</div>;
  const tabs = [
    ['people', 'Agents from Brokermint', Users, boss],
    ['history', 'Cap history from Brokermint', History, true],
    ['balances', 'Starting balances', Scale, true],
    ['base44', 'Base44 data', Database, boss],
    ['private', 'Make files private', Lock, boss],
  ].filter((t) => t[3]);
  const active = tabs.some((t) => t[0] === tab) ? tab : tabs[0][0];
  const extra = user?.role === 'super_admin' ? { brokerage_id: target } : {};
  const needTarget = user?.role === 'super_admin' && !target && !['base44', 'private'].includes(active);
  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Import data</h1>
      <p className="text-sm text-muted-foreground mb-6">Bring your people and history over from Brokermint and Base44. Everything can be run again safely; history imports can be undone.</p>
      {user?.role === 'super_admin' && (
        <div className="mb-4 flex items-center gap-2 text-sm"><span>Brokerage:</span>
          <select className={sel} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose…</option>
            {brokerages.map((b) => <option key={b.id} value={b.id}>{b.name || b.id}</option>)}
          </select>
        </div>
      )}
      <div className="flex flex-wrap gap-2 mb-6">
        {tabs.map(([k, l, Icon]) => <button key={k} onClick={() => setTab(k)} className={cn('flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-sm', active === k ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted')}><Icon className="w-4 h-4" />{l}</button>)}
      </div>
      {needTarget && <p className="text-sm text-muted-foreground">Choose the brokerage to import into first.</p>}
      {!needTarget && active === 'people' && <PeopleImport extra={extra} />}
      {!needTarget && active === 'history' && <HistoryImport extra={extra} target={target} />}
      {!needTarget && active === 'balances' && <Balances extra={extra} />}
      {active === 'base44' && <Base44Import extra={extra} superAdmin={user?.role === 'super_admin'} />}
      {active === 'private' && <MakePrivate />}
    </div>
  );
}

// ---------------------------------------------------------------------------------------

function PeopleImport({ extra }) {
  const queryClient = useQueryClient();
  const [people, setPeople] = useState(null);
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [results, setResults] = useState([]);
  const [links, setLinks] = useState(null);
  const load = async ([f]) => {
    if (!f) return;
    const list = parseCsv(await readText(f)).rows.map(brokermintPerson);
    setPeople(list); setResults([]); setLinks(null); setDone(0);
  };
  const run = async () => {
    const ok = people.filter((p) => p.email);
    setBusy(true); setResults([]); setDone(0);
    try {
      const all = [];
      for (let i = 0; i < ok.length; i += 20) {
        const { data } = await base44.functions.invoke('importPeople', { ...extra, action: 'import', invite, people: ok.slice(i, i + 20) });
        all.push(...data.results); setResults([...all]); setDone(Math.min(ok.length, i + 20));
      }
      const { data } = await base44.functions.invoke('importPeople', { ...extra, action: 'link', links: ok.map((p) => ({ email: p.email, recruiter: p.recruiter, tcName: p.tcName })) });
      setLinks(data);
      queryClient.invalidateQueries({ queryKey: ['brokerage-users'] });
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  if (!people) {
    return (
      <div className="space-y-3 max-w-2xl">
        <p className="text-sm">In Brokermint: <b>Settings → Users → Export</b>. Upload that CSV. We bring over role, phone, birthday, anniversary (starts their cap year), team, address, annual cap, up to 4 licenses, their TC, and who recruited them ("Downline") for revenue share.</p>
        <Picker accept=".csv,text/csv" onFiles={load} label="Brokermint users CSV" />
      </div>
    );
  }
  const missing = people.filter((p) => !p.email).length;
  const errors = results.filter((r) => !r.ok);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm font-medium">{people.length - missing} people to import{missing ? ` (${missing} rows without an email are skipped)` : ''}</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={invite} onChange={(e) => setInvite(e.target.checked)} /> Email everyone an invite to set a password</label>
        <Button onClick={run} disabled={busy} className="gap-1.5 ml-auto">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import</Button>
        <Button variant="ghost" onClick={() => setPeople(null)} disabled={busy}>Choose another file</Button>
      </div>
      {!invite && <p className="text-xs text-muted-foreground">Without invites, people sign in the first time with "Email me a sign-in link". You can invite later from Manage Users.</p>}
      {(busy || results.length > 0) && <Progress done={done} total={people.length - missing} label="Importing people" />}
      {links && <p className="text-sm flex items-center gap-1.5 text-emerald-700"><Check className="w-4 h-4" /> Done. {results.filter((r) => r.ok).length} people imported, {links.linked} recruiter/TC links.</p>}
      {links?.missing?.length > 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm"><p className="font-medium mb-1">Couldn't match these names (set them in Manage Users):</p><ul className="list-disc pl-5">{links.missing.slice(0, 30).map((m) => <li key={m}>{m}</li>)}</ul></div>}
      {errors.length > 0 && <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 p-3 text-sm"><p className="font-medium mb-1">Not imported:</p><ul className="list-disc pl-5">{errors.map((r) => <li key={r.email}>{r.email || '(no email)'}: {r.error}</li>)}</ul></div>}
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b">{['Name', 'Email', 'Role', 'Team', 'Anniversary', 'Annual cap', 'Recruited by', 'TC', ''].map((h) => <th key={h} className="p-2.5 whitespace-nowrap">{h}</th>)}</tr></thead>
          <tbody>{people.map((p, i) => {
            const r = results.find((x) => x.email === p.email);
            return (
              <tr key={i} className={cn('border-b last:border-0', !p.email && 'opacity-50')}>
                <td className="p-2.5">{p.name}</td><td className="p-2.5">{p.email || '—'}</td><td className="p-2.5">{p.profile.role ? p.profile.role.replace('_', ' ') : '—'}</td>
                <td className="p-2.5">{p.teamName}</td><td className="p-2.5">{p.profile.start_date || ''}</td><td className="p-2.5">{p.profile.annual_cap ? money(p.profile.annual_cap) : ''}</td>
                <td className="p-2.5">{p.recruiter}</td><td className="p-2.5">{p.tcName}</td>
                <td className="p-2.5">{r ? (r.ok ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-red-600" />) : null}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------

function HistoryImport({ extra, target }) {
  const queryClient = useQueryClient();
  const { data: people = [] } = useQuery({ queryKey: ['import-people', target], queryFn: () => base44.entities.User.filter({ brokerage_id: target }, 'full_name', 5000), enabled: !!target });
  const { data: imports = [], refetch } = useQuery({ queryKey: ['history-imports', target], queryFn: async () => (await base44.functions.invoke('importHistory', { ...extra, action: 'list' })).data.imports, enabled: !!target });
  const [file, setFile] = useState(null); // { name, headers, rows }
  const [map, setMap] = useState({});
  const [overrides, setOverrides] = useState({});
  const [createDeals, setCreateDeals] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [result, setResult] = useState(null);

  const load = async ([f]) => {
    if (!f) return;
    const parsed = parseCsv(await readText(f));
    setFile({ name: f.name, ...parsed }); setMap(autoMapHistory(parsed.headers)); setOverrides({}); setResult(null); setDone(0);
  };
  const built = useMemo(() => (file ? buildHistory(file.rows, map, people, overrides) : null), [file, map, people, overrides]);
  const perAgent = useMemo(() => {
    if (!built) return [];
    const by = new Map();
    for (const r of built.rows) {
      const p = people.find((x) => String(x.email).toLowerCase() === r.agent_email);
      const start = capYearStart(p?.cap_start_date || p?.start_date, new Date());
      const x = by.get(r.agent_email) || { email: r.agent_email, name: r.agent_name, start, deals: 0, cd: 0, gci: 0, all: 0 };
      x.all += 1;
      if (r.closed_date >= start) { x.deals += 1; x.cd += r.company_dollar; x.gci += r.gci || 0; }
      by.set(r.agent_email, x);
    }
    return [...by.values()].sort((a, b) => b.cd - a.cd);
  }, [built, people]);
  const missingRequired = HISTORY_FIELDS.filter(([f, , req]) => req && !map[f]).map(([, l]) => l);

  const run = async () => {
    const batchId = `bm-${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}`;
    setBusy(true); setDone(0);
    const total = { created: 0, skipped: 0, errors: [] };
    try {
      for (let i = 0; i < built.rows.length; i += 50) {
        const { data } = await base44.functions.invoke('importHistory', { ...extra, action: 'import', batchId, createTransactions: createDeals, rows: built.rows.slice(i, i + 50) });
        total.created += data.created; total.skipped += data.skipped; total.errors.push(...data.errors);
        setDone(Math.min(built.rows.length, i + 50));
      }
      setResult({ ...total, batchId });
      refetch(); queryClient.invalidateQueries();
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  const undo = async (b) => {
    if (!window.confirm(`Undo this import? Its ${b.records} commission records${b.opening ? '' : ' and the deals it added'} are removed.`)) return;
    try { const { data } = await base44.functions.invoke('importHistory', { ...extra, action: 'undo', batchId: b.batchId }); window.alert(`Removed ${data.records} records and ${data.deals} deals.`); refetch(); queryClient.invalidateQueries(); }
    catch (err) { window.alert(err.message); }
  };

  return (
    <div className="space-y-5">
      {!file ? (
        <div className="space-y-3 max-w-2xl">
          <p className="text-sm">Caps here are counted from deals the app knows about. So agents who are partway through their cap year don't start back at $0 (and capped agents aren't charged again), bring in what they've paid in Brokermint.</p>
          <p className="text-sm">In Brokermint, export a <b>transactions or commission report</b> as CSV covering at least each agent's current cap year (one row per agent per deal, with the closing date and the amount paid to the brokerage). Any layout works: you'll match the columns next.</p>
          <Picker accept=".csv,text/csv" onFiles={load} label="Brokermint report CSV" />
          <p className="text-xs text-muted-foreground">Don't have a per-deal report? Use <b>Starting balances</b> to type in each agent's totals instead.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3"><p className="text-sm font-medium flex-1">{file.name}: {file.rows.length} rows</p><Button variant="ghost" onClick={() => setFile(null)} disabled={busy}>Choose another file</Button></div>
          <div className="rounded-xl border bg-card p-4">
            <p className="font-semibold mb-3">Which column is which?</p>
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
              {HISTORY_FIELDS.map(([f, label, req]) => (
                <label key={f} className="flex items-center gap-2 text-sm">
                  <span className="flex-1">{label}{req && <span className="text-red-600"> *</span>}</span>
                  <select className={cn(sel, 'w-56')} value={map[f] || ''} onChange={(e) => setMap({ ...map, [f]: e.target.value || undefined })}>
                    <option value="">—</option>{file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </label>
              ))}
            </div>
            {missingRequired.length > 0 && <p className="text-sm text-red-600 mt-3">Pick a column for: {missingRequired.join(', ')}.</p>}
          </div>
          {built && built.unmatched.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-4">
              <p className="font-semibold mb-2">Who are these agents?</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {built.unmatched.map((u) => (
                  <label key={u.name} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{u.name} <span className="text-muted-foreground">({u.count} rows)</span></span>
                    <select className={cn(sel, 'w-56')} value={overrides[u.name] || ''} onChange={(e) => setOverrides({ ...overrides, [u.name]: e.target.value })}>
                      <option value="">Skip these rows</option>
                      {people.map((p) => <option key={p.id} value={String(p.email).toLowerCase()}>{p.full_name || p.email}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}
          {built && built.problems.length > 0 && <details className="text-sm"><summary className="cursor-pointer text-amber-700">{built.problems.length} rows will be skipped</summary><ul className="list-disc pl-5 mt-1">{built.problems.slice(0, 50).map((p) => <li key={p}>{p}</li>)}</ul></details>}
          {built && built.rows.length > 0 && missingRequired.length === 0 && (
            <div className="rounded-xl border bg-card overflow-x-auto">
              <p className="px-4 pt-4 font-semibold">This cap year, per agent</p>
              <p className="px-4 pb-2 text-xs text-muted-foreground">Each agent's cap year starts on their anniversary date. Older deals are imported for reports but don't count toward this year's cap.</p>
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground border-b"><th className="p-2.5">Agent</th><th className="p-2.5">Cap year began</th><th className="p-2.5 text-right">Deals this year</th><th className="p-2.5 text-right">Paid toward cap</th><th className="p-2.5 text-right">GCI</th><th className="p-2.5 text-right">All rows</th></tr></thead>
                <tbody>{perAgent.map((a) => <tr key={a.email} className="border-b last:border-0"><td className="p-2.5">{a.name}</td><td className="p-2.5">{a.start}</td><td className="p-2.5 text-right">{a.deals}</td><td className="p-2.5 text-right font-medium">{money(a.cd)}</td><td className="p-2.5 text-right">{money(a.gci)}</td><td className="p-2.5 text-right text-muted-foreground">{a.all}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={createDeals} onChange={(e) => setCreateDeals(e.target.checked)} /> Also add these as closed deals (so reports and production include them)</label>
            <Button className="ml-auto gap-1.5" disabled={busy || !built?.rows.length || missingRequired.length > 0} onClick={run}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import {built?.rows.length || 0} rows</Button>
          </div>
          {busy && <Progress done={done} total={built.rows.length} label="Importing history" />}
          {result && <p className="text-sm text-emerald-700 flex items-center gap-1.5"><Check className="w-4 h-4" /> Imported {result.created} records{result.skipped ? `, skipped ${result.skipped} already imported` : ''}.{result.errors.length ? ` ${result.errors.length} problems: ${result.errors.slice(0, 3).join('; ')}` : ''}</p>}
        </>
      )}
      {imports.length > 0 && (
        <div className="rounded-xl border bg-card">
          <p className="px-4 pt-4 pb-2 font-semibold">Past imports</p>
          <ul className="divide-y">{imports.map((b) => (
            <li key={b.batchId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">{b.opening ? 'Starting balances' : 'Brokermint history'} · {new Date(b.at).toLocaleString()} · {b.records} records, {b.agents} agents, {money(b.company_dollar)} paid to brokerage</span>
              {!b.opening && <Button size="sm" variant="ghost" className="gap-1" onClick={() => undo(b)}><Undo2 className="w-4 h-4" /> Undo</Button>}
            </li>
          ))}</ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------

function Balances({ extra }) {
  const { data, isLoading, refetch } = useQuery({ queryKey: ['cap-balances', extra.brokerage_id], queryFn: async () => (await base44.functions.invoke('importHistory', { ...extra, action: 'balances' })).data.agents });
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(null);
  const val = (a, k) => edits[a.email]?.[k] ?? (a.opening?.[k] ?? '');
  const set = (a, k, v) => setEdits((e) => ({ ...e, [a.email]: { ...(e[a.email] || {}), [k]: v.replace(/[^0-9.]/g, '') } }));
  const save = async (a) => {
    setSaving(a.email);
    try {
      await base44.functions.invoke('importHistory', { ...extra, action: 'balance', email: a.email, values: { company_dollar: val(a, 'company_dollar'), gci: val(a, 'gci'), units: val(a, 'units'), revshare: val(a, 'revshare') } });
      setEdits((e) => { const n = { ...e }; delete n[a.email]; return n; });
      refetch();
    } catch (err) { window.alert(err.message); } finally { setSaving(null); }
  };
  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin" />;
  return (
    <div className="space-y-3">
      <p className="text-sm max-w-3xl">If you didn't import per-deal history, type in what each agent has <b>already paid toward their cap in Brokermint this cap year</b> (Brokermint shows it on each agent's cap tracker). Leave it blank for agents who started their cap year fresh. Saving again replaces the amount.</p>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted-foreground border-b"><th className="p-2.5">Agent</th><th className="p-2.5">Cap year began</th><th className="p-2.5 text-right">Cap</th><th className="p-2.5 text-right">Counted now</th><th className="p-2.5">Paid toward cap in Brokermint</th><th className="p-2.5">GCI so far</th><th className="p-2.5">Deals</th><th className="p-2.5"></th></tr></thead>
          <tbody>{(data || []).map((a) => (
            <tr key={a.email} className="border-b last:border-0">
              <td className="p-2.5"><p className="font-medium">{a.name}</p><p className="text-xs text-muted-foreground">{a.plan}</p></td>
              <td className="p-2.5">{a.cap_year_start}</td>
              <td className="p-2.5 text-right">{a.cap ? money(a.cap) : '—'}</td>
              <td className="p-2.5 text-right">{money(a.paid)}</td>
              <td className="p-2.5"><Input className="h-8 w-28" inputMode="decimal" placeholder="0" value={val(a, 'company_dollar')} onChange={(e) => set(a, 'company_dollar', e.target.value)} /></td>
              <td className="p-2.5"><Input className="h-8 w-28" inputMode="decimal" placeholder="optional" value={val(a, 'gci')} onChange={(e) => set(a, 'gci', e.target.value)} /></td>
              <td className="p-2.5"><Input className="h-8 w-16" inputMode="decimal" placeholder="0" value={val(a, 'units')} onChange={(e) => set(a, 'units', e.target.value)} /></td>
              <td className="p-2.5">{edits[a.email] && <Button size="sm" onClick={() => save(a)} disabled={saving === a.email}>{saving === a.email ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}</Button>}{!edits[a.email] && a.opening && <Check className="w-4 h-4 text-emerald-600" />}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">"Counted now" already includes anything saved here and any imported history, so don't enter the same money in both places.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------

const TABLES = Object.keys(SCHEMA).sort();
// "Transaction.csv", "Transaction (1).csv", "Transaction_export_2026-09-30.csv" -> Transaction
const tableOf = (name) => {
  const base = name.replace(/\.(csv|json)$/i, '');
  const lead = (base.match(/^[A-Za-z0-9]+/) || [''])[0];
  return TABLES.find((k) => k.toLowerCase() === base.toLowerCase()) || TABLES.find((k) => k.toLowerCase() === lead.toLowerCase()) || null;
};

function Base44Import({ extra, superAdmin }) {
  const [files, setFiles] = useState([]); // [{ name, entity, rows, status }]
  const [copyFiles, setCopyFiles] = useState(true);
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState({ copied: 0, failed: [], privateFiles: [], notes: [] });
  const add = async (list) => {
    const next = [];
    for (const f of list) {
      try { next.push({ name: f.name, entity: tableOf(f.name), rows: readBase44File(f.name, await readText(f)), done: 0, imported: 0 }); }
      catch (err) { next.push({ name: f.name, entity: null, rows: [], error: `Couldn't read: ${err.message}` }); }
    }
    setFiles((cur) => [...cur.filter((c) => !next.some((n) => n.name === c.name)), ...next]);
  };
  const run = async () => {
    setBusy(true);
    const rep = { copied: 0, failed: [], privateFiles: [], notes: [] };
    const order = [...files].filter((f) => f.entity).sort((a, b) => (a.entity === 'User' ? -1 : b.entity === 'User' ? 1 : a.entity === 'Brokerage' ? -1 : b.entity === 'Brokerage' ? 1 : a.entity.localeCompare(b.entity)));
    try {
      for (const f of order) {
        let i = 0; let imported = 0; let stalls = 0;
        while (i < f.rows.length) {
          // About 100 rows (or ~1.5 MB) per request; the server says how far it got.
          let n = Math.min(copyFiles ? 25 : 100, f.rows.length - i);
          while (n > 1 && JSON.stringify(f.rows.slice(i, i + n)).length > 1_500_000) n = Math.ceil(n / 2);
          const { data } = await base44.functions.invoke('importBase44', { ...extra, all_brokerages: superAdmin && all, entity: f.entity, copyFiles, rows: f.rows.slice(i, i + n) });
          if (!data.processed) { stalls += 1; if (stalls > 2) throw new Error(`Stopped at record ${i + 1} of ${f.name}. Try again without copying files.`); continue; }
          stalls = 0; i += data.processed; imported += data.imported;
          rep.copied += data.copied; rep.failed.push(...data.failedFiles); rep.privateFiles.push(...data.privateBase44); rep.notes.push(...data.notes);
          setFiles((cur) => cur.map((c) => (c.name === f.name ? { ...c, done: i, imported } : c)));
          setReport({ ...rep });
        }
      }
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm max-w-3xl">In Base44, export each data table (<b>Data → table → Export</b>) as CSV or JSON, keeping the table name as the file name (Transaction.csv, User.csv…). Drop them all here. Every record keeps its id and dates, people get logins (they sign in the first time with "Email me a sign-in link"), and files are copied off Base44, with deal documents and chat files going to private storage. Importing a file again updates those records to match it.</p>
      <Picker accept=".csv,.json" multiple onFiles={add} label="Base44 export files" />
      {files.length > 0 && (
        <>
          <div className="rounded-xl border bg-card divide-y">
            {files.map((f) => (
              <div key={f.name} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-56 truncate font-medium">{f.name}</span>
                {f.error ? <span className="w-48 text-red-600">{f.error}</span> : (
                  <select className={cn(sel, 'w-48')} value={f.entity || ''} disabled={busy} onChange={(e) => setFiles((cur) => cur.map((c) => (c.name === f.name ? { ...c, entity: e.target.value || null, done: 0, imported: 0 } : c)))}>
                    <option value="">Skip this file</option>{TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                )}
                <span className="w-28 text-muted-foreground">{f.rows.length} records</span>
                <div className="flex-1">{f.entity && (f.done > 0 || busy) && <Progress done={f.done} total={f.rows.length} label={`${f.imported} imported`} />}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={copyFiles} onChange={(e) => setCopyFiles(e.target.checked)} /> Copy files off Base44</label>
            {superAdmin && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> All brokerages (full import, keeps each record's brokerage)</label>}
            <Button className="ml-auto gap-1.5" disabled={busy || !files.some((f) => f.entity)} onClick={run}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Import</Button>
          </div>
          {(report.copied > 0 || report.failed.length > 0 || report.notes.length > 0) && (
            <div className="rounded-xl border p-4 text-sm space-y-2">
              {report.copied > 0 && <p className="text-emerald-700">{report.copied} files copied off Base44.</p>}
              {report.failed.length > 0 && <details><summary className="cursor-pointer text-amber-700">{report.failed.length} files couldn't be copied (the links still point to Base44)</summary><ul className="list-disc pl-5 mt-1">{report.failed.slice(0, 50).map((x) => <li key={x} className="break-all">{x}</li>)}</ul></details>}
              {report.privateFiles.length > 0 && <details><summary className="cursor-pointer text-amber-700">{new Set(report.privateFiles).size} private Base44 files need downloading from Base44 by hand</summary><ul className="list-disc pl-5 mt-1">{[...new Set(report.privateFiles)].slice(0, 50).map((x) => <li key={x} className="break-all">{x}</li>)}</ul></details>}
              {report.notes.length > 0 && <details><summary className="cursor-pointer">{report.notes.length} notes</summary><ul className="list-disc pl-5 mt-1">{[...new Set(report.notes)].slice(0, 50).map((x) => <li key={x}>{x}</li>)}</ul></details>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------

const SECURE_LABELS = { transaction: 'Deal documents', checklist: 'Checklist documents', esign_document: 'E-sign documents', offer: 'Offers', direct_message: 'Direct messages', group_message: 'Group chats', social_message: 'Channels', thread_reply: 'Threads' };

function MakePrivate() {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [moved, setMoved] = useState(0);
  const [done, setDone] = useState(false);
  const run = async () => {
    setBusy(true); setLog([]); setMoved(0); setDone(false);
    let step = { table: 'transaction', cursor: '' }; let total = 0;
    try {
      while (step) {
        const { data } = await base44.functions.invoke('secureFiles', step);
        total += data.moved; setMoved(total);
        setLog((l) => [...l.filter((x) => x.table !== data.table), { table: data.table, moved: (l.find((x) => x.table === data.table)?.moved || 0) + data.moved }]);
        step = data.next;
      }
      setDone(true);
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 max-w-2xl">
      <p className="text-sm">New uploads to deals, offers, onboarding and chats are already private: only people who can see the deal or conversation can open them, and every link checks who's asking. This moves files uploaded <b>before</b> that (and files from imports) into private storage too.</p>
      <Button onClick={run} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />} Make existing files private</Button>
      {log.length > 0 && <ul className="text-sm space-y-1">{log.map((x) => <li key={x.table} className="flex gap-2"><Check className="w-4 h-4 text-emerald-600" />{SECURE_LABELS[x.table] || x.table}: {x.moved} updated</li>)}</ul>}
      {done && <p className="text-sm text-emerald-700">Done. {moved} records now point to private files.</p>}
    </div>
  );
}
