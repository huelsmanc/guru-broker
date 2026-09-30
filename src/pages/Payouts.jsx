import React, { useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, Send, Ban, BadgeCheck, Download, FileText } from 'lucide-react';
import { useLiveTable } from '@/hooks/useLiveTable';
import { can } from '../../shared/permissions.generated.js';
import { Section, Empty, Pill, money } from '@/components/workspace/ui';

const TABS = [['pending_approval', 'Waiting approval'], ['approved', 'Approved, ready to pay'], ['sent', 'Sent'], ['failed', 'Failed'], ['paid', 'Paid']];

function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function Payouts() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('pending_approval');
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); });
  const [year, setYear] = useState(String(new Date().getUTCFullYear() - 1));
  const key = ['payouts', brokerageId];
  const { data: payouts = [], isLoading } = useQuery({ queryKey: key, queryFn: () => base44.entities.Payout.filter({ brokerage_id: brokerageId }, '-created_date', 2000), enabled: !!brokerageId });
  const { data: banks = [] } = useQuery({ queryKey: ['agent-private', brokerageId], queryFn: () => base44.entities.AgentPrivate.filter({ brokerage_id: brokerageId }, '-created_date', 2000), enabled: !!brokerageId });
  useLiveTable('Payout', () => queryClient.invalidateQueries({ queryKey: key }));

  const linked = useMemo(() => new Set(banks.filter((b) => b.payload_payment_method_id).map((b) => b.user_email)), [banks]);
  const rows = payouts.filter((p) => (tab === 'sent' ? ['sent', 'sending'].includes(p.status) : p.status === tab));
  const counts = Object.fromEntries(TABS.map(([k]) => [k, payouts.filter((p) => (k === 'sent' ? ['sent', 'sending'].includes(p.status) : p.status === k)).length]));
  const total = rows.filter((p) => picked.has(p.id)).reduce((s, p) => s + Number(p.amount || 0), 0);

  if (!can(user, 'accounting.access')) return <div className="p-8 text-sm">You need accounting access to see payouts.</div>;

  const act = async (action, ids = [...picked]) => {
    if (!ids.length) return;
    let memo;
    if (action === 'send' && !window.confirm(`Send ${ids.length} direct deposit${ids.length > 1 ? 's' : ''} through Payload?`)) return;
    if (action === 'mark_paid') { memo = window.prompt('How was it paid? (check #, wire, etc.)', 'Check'); if (memo == null) return; }
    if (action === 'cancel' && !window.confirm('Void these payouts?')) return;
    setBusy(action);
    try {
      const { results } = (await base44.functions.invoke('payoutAction', { payoutIds: ids, action, memo })).data;
      const bad = results.filter((r) => !r.ok);
      if (bad.length) window.alert(`${results.length - bad.length} done. ${bad.length} not done:\n${bad.map((b) => `- ${b.error}`).join('\n')}`);
      setPicked(new Set());
      queryClient.invalidateQueries({ queryKey: key });
    } catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const runStatements = async () => {
    if (!window.confirm(`Build and email ${month} statements to every agent who closed a deal that month?`)) return;
    setBusy('statements');
    try { const r = (await base44.functions.invoke('monthlyStatements', { month })).data; window.alert(`Sent ${r.statements?.length || 0} statements for ${r.month}.`); }
    catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const run1099 = async () => {
    setBusy('1099');
    try { const r = (await base44.functions.invoke('export1099', { year: Number(year) })).data; download(r.filename, r.csv); }
    catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Payouts</h1>
      <p className="text-sm text-muted-foreground mb-6">Every payout is created when a deal's commission is saved. Approve each one, then pay by direct deposit or mark it paid by check.</p>

      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => { setTab(k); setPicked(new Set()); }} className={`rounded-full px-4 py-1.5 text-sm border ${tab === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'}`}>{l}{counts[k] ? ` (${counts[k]})` : ''}</button>
        ))}
      </div>

      {picked.size > 0 && (
        <div className="sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-sm font-medium mr-2">{picked.size} selected · {money(total)}</span>
          {tab === 'pending_approval' && <Button size="sm" className="gap-1" onClick={() => act('approve')} disabled={!!busy}><Check className="w-4 h-4" /> Approve</Button>}
          {['approved', 'failed'].includes(tab) && <Button size="sm" className="gap-1" onClick={() => act('send')} disabled={!!busy}><Send className="w-4 h-4" /> Send direct deposit</Button>}
          {['approved', 'failed'].includes(tab) && <Button size="sm" variant="outline" className="gap-1" onClick={() => act('mark_paid')} disabled={!!busy}><BadgeCheck className="w-4 h-4" /> Mark paid</Button>}
          {['pending_approval', 'approved', 'failed'].includes(tab) && <Button size="sm" variant="ghost" className="gap-1 text-red-600" onClick={() => act('cancel')} disabled={!!busy}><Ban className="w-4 h-4" /> Void</Button>}
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
        </div>
      )}

      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !rows.length ? <Empty>Nothing here.</Empty> : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted-foreground border-b">
              <th className="p-3 w-8"><input type="checkbox" checked={rows.every((r) => picked.has(r.id))} onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} /></th>
              <th className="p-3">Payee</th><th className="p-3">For</th><th className="p-3">Type</th><th className="p-3 text-right">Amount</th><th className="p-3">Bank</th><th className="p-3">Status</th>
            </tr></thead>
            <tbody>{rows.map((p) => (
              <tr key={p.id} className="border-b last:border-0 align-top">
                <td className="p-3"><input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} /></td>
                <td className="p-3"><p className="font-medium">{p.payee_name || p.payee_email}</p><p className="text-xs text-muted-foreground">{p.payee_email}</p></td>
                <td className="p-3">{p.memo}{p.transaction_id && <Link to={`/Transactions/${p.transaction_id}?tab=finances`} className="block text-xs text-primary">Open deal</Link>}</td>
                <td className="p-3 capitalize">{p.kind}{p.level ? ` L${p.level}` : ''}</td>
                <td className="p-3 text-right font-medium">{money(p.amount)}</td>
                <td className="p-3 text-xs">{p.payee_email && linked.has(p.payee_email) ? <span className="text-emerald-700">linked</span> : <span className="text-muted-foreground">not linked</span>}</td>
                <td className="p-3"><Pill status={p.status}>{p.status.replace('_', ' ')}</Pill>{p.failure_reason && <p className="text-xs text-red-600 mt-1 max-w-[220px]">{p.failure_reason}</p>}{p.approved_by && <p className="text-xs text-muted-foreground mt-1">approved by {p.approved_by}</p>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mt-10">
        <Section title="Monthly statements" subtitle="Runs automatically on the 1st. Run it again for any month here.">
          <div className="flex gap-2"><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="max-w-[180px]" /><Button onClick={runStatements} disabled={!!busy} className="gap-1.5">{busy === 'statements' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Build and email</Button></div>
        </Section>
        <Section title="1099 worksheet" subtitle="Everything paid to each person in a year, for your accountant.">
          <div className="flex gap-2"><Input inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className="max-w-[120px]" /><Button variant="outline" onClick={run1099} disabled={!!busy} className="gap-1.5">{busy === '1099' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download CSV</Button></div>
        </Section>
      </div>
    </div>
  );
}
