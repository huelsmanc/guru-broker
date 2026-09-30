import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Download, Play } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { can } from '../../shared/permissions.generated.js';
import { Empty, money } from '@/components/workspace/ui';

const sel = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
const fmt = (v, t) => (v == null || v === '' ? '' : t === 'money' ? money(v) : t === 'datetime' ? new Date(v).toLocaleString() : t === 'number' ? Number(v).toLocaleString() : String(v));
const STATUS = { payouts: ['pending_approval', 'approved', 'sent', 'paid', 'failed'], offers: ['draft', 'review_requested', 'sent', 'accepted', 'rejected'], esign: ['pending', 'in_progress', 'completed', 'voided', 'expired'] };
const RANGES = [['ytd', 'Year to date'], ['last_month', 'Last month'], ['this_month', 'This month'], ['last_year', 'Last year'], ['12m', 'Last 12 months'], ['all', 'All time'], ['custom', 'Custom']];

function range(k) {
  const d = new Date(); const y = d.getFullYear(); const m = d.getMonth();
  const iso = (x) => x.toISOString().slice(0, 10);
  if (k === 'ytd') return [`${y}-01-01`, iso(d)];
  if (k === 'this_month') return [iso(new Date(Date.UTC(y, m, 1))), iso(d)];
  if (k === 'last_month') return [iso(new Date(Date.UTC(y, m - 1, 1))), iso(new Date(Date.UTC(y, m, 0)))];
  if (k === 'last_year') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  if (k === '12m') return [iso(new Date(Date.UTC(y - 1, m, d.getDate()))), iso(d)];
  return ['', ''];
}
const csvCell = (v) => (/[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? ''));

export default function Reports() {
  const { user, brokerageId } = useOutletContext();
  const [list, setList] = useState({});
  const [report, setReport] = useState('closed_sales');
  const [preset, setPreset] = useState('ytd');
  const [[from, to], setDates] = useState(range('ytd'));
  const [agent, setAgent] = useState('');
  const [status, setStatus] = useState('');
  const [people, setPeople] = useState([]);
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState(null);

  useEffect(() => {
    base44.functions.invoke('reportsQuery', { list: true }).then((r) => setList(r.data.reports)).catch(() => {});
    base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000).then(setPeople).catch(() => {});
  }, [brokerageId]);

  const runIt = async () => {
    setBusy(true); setSort(null);
    try { setOut((await base44.functions.invoke('reportsQuery', { report, from: from || undefined, to: to || undefined, agent: agent || undefined, status: status || undefined })).data); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (Object.keys(list).length) runIt(); /* eslint-disable-next-line */ }, [report, list]);

  const rows = useMemo(() => {
    if (!out?.rows) return [];
    if (!sort) return out.rows;
    const [k, dir] = sort;
    return [...out.rows].sort((a, b) => (typeof a[k] === 'number' ? a[k] - b[k] : String(a[k] ?? '').localeCompare(String(b[k] ?? ''))) * dir);
  }, [out, sort]);

  if (!can(user, 'reports.company')) return <div className="p-8 text-sm">You need the company reports permission.</div>;

  const exportCsv = () => {
    const head = out.columns.map((c) => csvCell(c[1])).join(',');
    const body = rows.map((r) => out.columns.map(([k]) => csvCell(r[k])).join(',')).join('\n');
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([`${head}\n${body}`], { type: 'text/csv' })), download: `${report}-${from || 'all'}-${to || 'now'}.csv` });
    a.click();
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Reports</h1>
      <div className="grid md:grid-cols-[240px_1fr] gap-6">
        <nav className="space-y-1">
          {Object.entries(list).map(([k, l]) => (
            <button key={k} onClick={() => { setReport(k); setStatus(''); }} className={`w-full text-left rounded-lg px-3 py-2 text-sm ${report === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{l}</button>
          ))}
        </nav>
        <div className="min-w-0">
          <div className="flex flex-wrap items-end gap-3 mb-4 rounded-xl border bg-card p-4">
            <div className="w-40"><Label>Dates</Label><select className={sel} value={preset} onChange={(e) => { setPreset(e.target.value); if (e.target.value !== 'custom') setDates(range(e.target.value)); }}>{RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            {preset === 'custom' && <><div><Label>From</Label><Input type="date" className="mt-1" value={from} onChange={(e) => setDates([e.target.value, to])} /></div><div><Label>To</Label><Input type="date" className="mt-1" value={to} onChange={(e) => setDates([from, e.target.value])} /></div></>}
            <div className="w-56"><Label>Agent</Label><select className={sel} value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.email}>{p.full_name || p.email}</option>)}</select></div>
            {STATUS[report] && <div className="w-44"><Label>Status</Label><select className={sel} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Any</option>{STATUS[report].map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}</select></div>}
            <Button onClick={runIt} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Run</Button>
            {out?.rows?.length > 0 && <Button variant="outline" onClick={exportCsv} className="gap-1.5"><Download className="w-4 h-4" /> CSV</Button>}
          </div>

          {out && <>
            <div className="flex flex-wrap gap-3 mb-4">
              {Object.entries(out.summary || {}).map(([k, v]) => (
                <div key={k} className="rounded-xl border bg-card px-4 py-3 min-w-[140px]"><p className="text-xs text-muted-foreground">{k}</p><p className="text-lg font-semibold">{/volume|gci|gross|dollar|fees|net|total|^paid|approval/i.test(k) ? money(v) : Number(v).toLocaleString()}</p></div>
              ))}
            </div>
            {out.chart && rows.length > 1 && (
              <div className="h-64 rounded-xl border bg-card p-3 mb-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows.slice(0, 25)}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey={out.chart.label} tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} /><YAxis tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey={out.chart.value} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              </div>
            )}
            {!rows.length ? <Empty>No results for these filters.</Empty> : (
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-muted-foreground">{out.columns.map(([k, l, t]) => (
                    <th key={k} className={`p-3 cursor-pointer select-none whitespace-nowrap ${t === 'money' || t === 'number' ? 'text-right' : ''}`} onClick={() => setSort(([sk, d] = []) => [k, sk === k ? -d : 1])}>{l}{sort?.[0] === k ? (sort[1] > 0 ? ' ▲' : ' ▼') : ''}</th>
                  ))}</tr></thead>
                  <tbody>{rows.slice(0, 1000).map((r, i) => (
                    <tr key={i} className="border-b last:border-0">{out.columns.map(([k, , t]) => <td key={k} className={`p-3 ${t === 'money' || t === 'number' ? 'text-right tabular-nums' : ''}`}>{fmt(r[k], t)}</td>)}</tr>
                  ))}</tbody>
                </table>
                {rows.length > 1000 && <p className="p-3 text-xs text-muted-foreground">Showing 1,000 of {rows.length}. Download the CSV for everything.</p>}
              </div>
            )}
          </>}
        </div>
      </div>
    </div>
  );
}
