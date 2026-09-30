import React, { useEffect, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Loader2, Landmark, FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { Section, Row, Empty, Pill, money } from '@/components/workspace/ui';

const BANK = { not_linked: 'Not linked', invited: 'Invite sent - check your email', requested: 'Invite sent - check your email', linked: 'Linked', pending: 'Waiting on bank verification' };

export default function MyCommissions() {
  const { user } = useOutletContext();
  const [data, setData] = useState(null);
  const [statements, setStatements] = useState([]);
  const [bank, setBank] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [c, s, b] = await Promise.all([
        base44.functions.invoke('myCommission', {}),
        base44.functions.invoke('myStatements', {}),
        base44.functions.invoke('bankLink', { action: 'status' }),
      ]);
      setData(c.data); setStatements(s.data.statements || []); setBank(b.data);
    } catch (err) { setError(err.message); }
  };
  useEffect(() => { load(); }, []);

  const linkBank = async () => {
    setBusy(true);
    try { await base44.functions.invoke('bankLink', { action: 'invite' }); await load(); window.alert('Check your email for a secure link from Payload to connect your bank. We never see or store your account number.'); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const cfg = data.plan.config || {};
  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">My commissions</h1>
      <p className="text-sm text-muted-foreground mb-8">{user?.full_name} · {data.plan.name}</p>

      <div className="grid md:grid-cols-3 gap-4 mb-8">
        <div className="md:col-span-2 rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground">Cap year {data.cap_year_start} to {data.cap_year_end}</p>
          {data.cap ? (
            <>
              <p className="text-3xl font-bold mt-2">{money(data.ytd.company_dollar)} <span className="text-base font-normal text-muted-foreground">of {money(data.cap)} cap</span></p>
              <div className="h-3 rounded-full bg-muted mt-4 overflow-hidden"><div className={`h-full ${data.pct >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} style={{ width: `${data.pct}%` }} /></div>
              <p className="text-sm mt-2">{data.pct >= 100 ? `Capped. You keep ${cfg.cap?.after_cap_agent_pct ?? 100}% until ${data.cap_year_end}.` : `${money(data.remaining)} to go (${data.pct}%).`}</p>
            </>
          ) : <p className="text-lg font-semibold mt-2">Your plan has no cap.</p>}
        </div>
        <div className="rounded-2xl border bg-card p-6">
          <p className="text-sm text-muted-foreground mb-2">This cap year</p>
          <Row label="GCI" value={money(data.ytd.gci)} />
          <Row label="Volume" value={money(data.ytd.volume)} />
          <Row label="Units" value={Math.round(data.ytd.units * 100) / 100} />
          {data.ytd.revshare > 0 && <Row label="Revenue share paid out" value={money(data.ytd.revshare)} />}
        </div>
      </div>

      <Section title="Direct deposit" actions={!bank?.linked && <Button onClick={linkBank} disabled={busy} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />} {bank && bank.status !== 'not_linked' ? 'Resend bank link' : 'Link my bank'}</Button>}>
        <p className="text-sm">{bank?.linked ? 'Linked' : BANK[bank?.status] || bank?.status || 'Not linked'}{bank?.linked_at ? ` since ${String(bank.linked_at).slice(0, 10)}` : ''}. Bank details are held by Payload, never by us.</p>
      </Section>

      <Section title="Closed deals">
        {!data.records.length ? <Empty>No closed deals in the system yet.</Empty> : (
          <div className="rounded-xl border bg-card divide-y">
            {data.records.map((r) => (
              <div key={r.id}>
                <button className="w-full flex flex-wrap items-center gap-3 px-4 py-3 text-sm text-left hover:bg-muted/40" onClick={() => setOpen(open === r.id ? null : r.id)}>
                  {open === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="w-24 text-muted-foreground">{r.closed_date}</span>
                  <span className="flex-1 min-w-[160px] font-medium">{r.property_address}</span>
                  <span className="text-muted-foreground">GCI {money(r.gross_share)}</span>
                  <span className="font-semibold">Net {money(r.agent_net)}</span>
                  <Pill status={r.status}>{r.status}</Pill>
                </button>
                {open === r.id && (
                  <div className="px-12 pb-4 max-w-lg">
                    {r.lines.map((l, i) => <Row key={i} label={l.label} value={money(l.amount)} strong={l.total} />)}
                    {r.transaction_id && <Link className="text-xs text-primary" to={`/Transactions/${r.transaction_id}`}>Open transaction</Link>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Payments to me">
        {!data.payouts.length ? <Empty>No payouts yet.</Empty> : (
          <table className="w-full text-sm rounded-xl border bg-card">
            <thead><tr className="text-left text-muted-foreground border-b"><th className="p-3">Created</th><th className="p-3">For</th><th className="p-3 text-right">Amount</th><th className="p-3">Status</th></tr></thead>
            <tbody>{data.payouts.map((p) => (
              <tr key={p.id} className="border-b last:border-0"><td className="p-3">{String(p.created_date).slice(0, 10)}</td><td className="p-3">{p.memo || p.kind}</td><td className="p-3 text-right">{money(p.amount)}</td><td className="p-3"><Pill status={p.status}>{p.status.replace('_', ' ')}</Pill>{p.paid_at && <span className="text-xs text-muted-foreground ml-2">{String(p.paid_at).slice(0, 10)}</span>}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      <Section title="Monthly statements" subtitle="Emailed to you on the 1st of each month.">
        {!statements.length ? <Empty>Your first statement arrives the month after your first closing.</Empty> : (
          <div className="flex flex-wrap gap-2">{statements.map((s) => <a key={s.month} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-muted"><FileText className="w-4 h-4" />{s.month}</a>)}</div>
        )}
      </Section>
    </div>
  );
}
