import React, { useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Trophy, Plus, Edit2, Trash2, DollarSign, Loader2, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import { isAdminRole, can } from '../../shared/permissions.generated.js';

// Dates as YYYY-MM-DD in the browser's time zone.
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthEnd = (y, m) => ymd(new Date(y, m + 1, 0));
function periodRange(period, month) {
  const now = new Date(); const y = now.getFullYear(); const m = now.getMonth();
  switch (period) {
    case 'last_month': return { from: ymd(new Date(y, m - 1, 1)), to: monthEnd(y, m - 1), label: new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
    case 'quarter': { const q = Math.floor(m / 3) * 3; return { from: ymd(new Date(y, q, 1)), to: ymd(now), label: `Q${q / 3 + 1} ${y}` }; }
    case 'ytd': return { from: `${y}-01-01`, to: ymd(now), label: `${y} so far` };
    case 'last_year': return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) };
    case 'month': { const [yy, mm] = month.split('-').map(Number); return { from: `${month}-01`, to: monthEnd(yy, mm - 1), label: new Date(yy, mm - 1, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) }; }
    default: return { from: ymd(new Date(y, m, 1)), to: ymd(now), label: now.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) };
  }
}
const PERIODS = [['this_month', 'This month'], ['last_month', 'Last month'], ['quarter', 'This quarter'], ['ytd', 'Year to date'], ['last_year', 'Last year']];
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString()}`;
const big = (n) => { const v = Number(n) || 0; return v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 1 : 2)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : money(v); };
const units = (u) => (Number(u) % 1 ? Number(u).toFixed(1) : String(Number(u) || 0));
const MEDAL = ['bg-amber-400 text-white', 'bg-slate-300 text-slate-800', 'bg-orange-300 text-orange-900'];

export default function AgentLeaderboard() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isAdmin = isAdminRole(user?.role) || user?.role === 'super_admin' || can(user, 'reports.company');
  const [period, setPeriod] = useState('this_month');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rankBy, setRankBy] = useState('volume');
  const [showManual, setShowManual] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ agent_name: '', agent_email: '', sales_amount: '', month: new Date().toISOString().slice(0, 7) });
  const range = periodRange(period, month);

  const { data, isLoading, error } = useQuery({
    queryKey: ['sales-leaderboard', brokerageId, range.from, range.to],
    queryFn: async () => (await base44.functions.invoke('salesLeaderboard', { from: range.from, to: range.to })).data,
    enabled: !!brokerageId && isAdmin,
  });
  const agents = useMemo(() => [...(data?.agents || [])].sort((a, b) => (rankBy === 'units' ? b.units - a.units || b.volume - a.volume : b.volume - a.volume || b.units - a.units)), [data, rankBy]);
  const top = agents[0] ? (rankBy === 'units' ? agents[0].units : agents[0].volume) : 0;
  const totals = data?.totals || {};

  const { data: allUsers = [] } = useQuery({
    queryKey: ['brokerage-agents', brokerageId],
    queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 1000),
    enabled: !!brokerageId && isAdmin,
  });
  // Sales entered by hand for the months in this period.
  const { data: manual = [] } = useQuery({
    queryKey: ['agent-sales', brokerageId, range.from, range.to],
    queryFn: () => base44.entities.AgentSales.filter({ brokerage_id: brokerageId, month: { $gte: `${range.from.slice(0, 7)}-01`, $lte: `${range.to.slice(0, 7)}-01` } }, '-month', 500),
    enabled: !!brokerageId && isAdmin,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['agent-sales', brokerageId] });
    queryClient.invalidateQueries({ queryKey: ['sales-leaderboard', brokerageId] });
  };
  const save = useMutation({
    mutationFn: async (f) => {
      if (editingId) return base44.entities.AgentSales.update(editingId, { sales_amount: parseFloat(f.sales_amount), month: `${f.month}-01` });
      return base44.entities.AgentSales.create({ brokerage_id: brokerageId, agent_id: f.agent_email, agent_name: f.agent_name, agent_email: f.agent_email, month: `${f.month}-01`, sales_amount: parseFloat(f.sales_amount) });
    },
    onSuccess: () => { refresh(); setShowDialog(false); setEditingId(null); },
  });
  const remove = useMutation({ mutationFn: (id) => base44.entities.AgentSales.delete(id), onSuccess: refresh });

  const openNew = () => { setEditingId(null); setForm({ agent_name: '', agent_email: '', sales_amount: '', month: range.to.slice(0, 7) }); setShowDialog(true); };
  const openEdit = (s) => { setEditingId(s.id); setForm({ agent_name: s.agent_name, agent_email: s.agent_email, sales_amount: String(s.sales_amount), month: String(s.month).slice(0, 7) }); setShowDialog(true); };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[80dvh]">
        <div className="text-center">
          <Trophy className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-10 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Trophy className="w-7 h-7 text-amber-500" />
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground">Sales Leaderboard</h1>
            <p className="text-muted-foreground text-sm mt-0.5">Closed deals count automatically. Add older sales by hand.</p>
          </div>
        </div>
        <Button onClick={openNew} variant="outline" className="gap-2 rounded-xl h-10"><Plus className="w-4 h-4" /> Add a sale by hand</Button>
      </motion.div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        {PERIODS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setPeriod(k)}
            className={`px-3 py-1.5 rounded-full text-sm border ${period === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:border-primary/50'}`}>{l}</button>
        ))}
        <input type="month" value={month} onChange={(e) => { setMonth(e.target.value); setPeriod('month'); }}
          className={`px-3 py-1 rounded-full text-sm border bg-card ${period === 'month' ? 'border-primary ring-1 ring-primary' : ''}`} aria-label="Pick a month" />
        <div className="ml-auto inline-flex rounded-lg bg-muted p-0.5 text-sm">
          {[['volume', 'Volume'], ['units', 'Units']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setRankBy(k)} className={`px-3 py-1 rounded-md ${rankBy === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {[
          ['Sales volume', big(totals.volume)],
          ['Closed deals', String(totals.deals ?? 0)],
          ['Avg sale price', totals.units > 0 ? big((totals.volume - agents.reduce((s, a) => s + (a.manual || 0), 0)) / totals.units) : '—'],
          ['Agents with sales', String(totals.agents ?? 0)],
        ].map(([l, v]) => (
          <div key={l} className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground">{l}</p>
            <p className="text-2xl font-bold mt-1">{v}</p>
          </div>
        ))}
      </div>

      <div className="bg-card border rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <p className="font-semibold">{range.label}</p>
          <p className="text-xs text-muted-foreground">Ranked by {rankBy === 'units' ? 'units' : 'volume'}</p>
        </div>
        {isLoading ? (
          <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <p className="p-6 text-sm text-red-600">{error.message}</p>
        ) : agents.length === 0 ? (
          <div className="text-center py-14">
            <DollarSign className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-muted-foreground">No closed sales in {range.label} yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Deals show up here when they're marked Closed.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {agents.map((a, i) => {
              const score = rankBy === 'units' ? a.units : a.volume;
              const pct = top ? Math.max(4, (score / top) * 100) : 0;
              return (
                <motion.li key={a.email} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 10) * 0.03 }} className="px-4 py-3 flex items-center gap-3">
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${MEDAL[i] || 'bg-muted text-muted-foreground'}`}>{i + 1}</span>
                  {a.headshot
                    ? <img src={a.headshot} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
                    : <span className="w-9 h-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-semibold flex-shrink-0">{(a.name || a.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="font-semibold truncate">{a.name}</p>
                      <p className="font-bold tabular-nums">{rankBy === 'units' ? `${units(a.units)} units` : money(a.volume)}</p>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted mt-1.5 overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {rankBy === 'units' ? money(a.volume) : `${units(a.units)} ${a.units === 1 ? 'unit' : 'units'}`}
                      {a.deals ? ` · ${a.deals} closed ${a.deals === 1 ? 'deal' : 'deals'}` : ''}
                      {a.avg_price ? ` · avg ${big(a.avg_price)}` : ''}
                      {a.manual ? ` · includes ${big(a.manual)} added by hand` : ''}
                    </p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground mt-3 flex gap-1.5"><Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
        Counts deals marked Closed in this period, by closing date. Shared deals split volume and units by each agent's share (from the commission split when it's been calculated). Edit a deal in <Link to="/Transactions" className="text-primary hover:underline">Transactions</Link> to change what's counted.</p>

      <div className="mt-6 bg-card border rounded-2xl">
        <button type="button" onClick={() => setShowManual((v) => !v)} className="w-full px-4 py-3 flex items-center justify-between text-sm">
          <span className="font-medium">Sales added by hand in this period ({manual.length})</span>
          {showManual ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showManual && (
          <div className="border-t divide-y">
            {manual.length === 0 ? <p className="px-4 py-3 text-sm text-muted-foreground">None. Use "Add a sale by hand" for deals closed outside Guru Broker.</p> : manual.map((s) => (
              <div key={s.id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <span className="flex-1 min-w-0 truncate">{s.agent_name || s.agent_email}<span className="text-muted-foreground"> · {new Date(`${String(s.month).slice(0, 7)}-15`).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span></span>
                <span className="font-medium tabular-nums">{money(s.sales_amount)}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="Edit"><Edit2 className="w-4 h-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => remove.mutate(s.id)} aria-label="Delete"><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editingId ? 'Edit sale' : 'Add a sale by hand'}</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground -mt-2">For sales that closed outside Guru Broker. Deals closed in Transactions are counted automatically, so don't add those here.</p>
          <div className="space-y-4 py-2">
            {!editingId && (
              <div>
                <Label>Agent</Label>
                <select value={form.agent_email}
                  onChange={(e) => { const p = allUsers.find((u) => u.email === e.target.value); setForm({ ...form, agent_email: e.target.value, agent_name: p?.display_name || p?.full_name || '' }); }}
                  className="mt-1.5 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                  <option value="">Select a person...</option>
                  {allUsers.map((u) => <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Month closed</Label><Input type="month" className="mt-1.5" value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} /></div>
              <div><Label>Sales volume ($)</Label><Input type="number" inputMode="decimal" className="mt-1.5" value={form.sales_amount} onChange={(e) => setForm({ ...form, sales_amount: e.target.value })} placeholder="500000" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.agent_email || !form.sales_amount || !form.month || save.isPending}>{save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : editingId ? 'Save' : 'Add sale'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
