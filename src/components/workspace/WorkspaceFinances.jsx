import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Calculator, Save, Plus, Trash2, FileDown, Send, Heart, Check, Banknote } from 'lucide-react';
import { can, isAdminRole } from '../../../shared/permissions.generated.js';
import { Section, Row, money, Pill, Empty } from './ui';
import { useLiveTable } from '@/hooks/useLiveTable';

const defaultSides = (tx) => (Array.isArray(tx.sides) && tx.sides.length ? tx.sides : [
  { side: 'listing', pct: tx.deal_type === 'listing' || tx.deal_type === 'dual' ? (tx.commission_percentage ?? 0) : 0, agents: tx.deal_type === 'listing' || tx.deal_type === 'dual' ? [{ email: tx.agent_email, pct: 100 }] : [] },
  { side: 'buying', pct: tx.deal_type === 'listing' ? 0 : (tx.commission_percentage ?? 0), agents: tx.deal_type === 'listing' ? [] : [{ email: tx.agent_email, pct: 100 }] },
]);

export default function WorkspaceFinances({ tx, user, refresh }) {
  const queryClient = useQueryClient();
  const accounting = isAdminRole(user?.role) || can(user, 'accounting.access');
  const [sides, setSides] = useState(() => defaultSides(tx));
  const [referral, setReferral] = useState(tx.referral || { type: 'pct', amount: '', to: '' });
  const [deductions, setDeductions] = useState(tx.deductions || []);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [users, setUsers] = useState([]);
  const [thanks, setThanks] = useState(null);
  useEffect(() => { base44.entities.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 1000).then(setUsers).catch(() => {}); }, [tx.brokerage_id]);

  const { data: payouts = [] } = useQuery({ queryKey: ['tx-payouts', tx.id], queryFn: () => base44.entities.Payout.filter({ transaction_id: tx.id }, 'created_date', 200) });
  useLiveTable('Payout', (e) => e.data?.transaction_id === tx.id && queryClient.invalidateQueries({ queryKey: ['tx-payouts', tx.id] }));
  const livePayouts = payouts.filter((p) => p.status !== 'void');

  const input = useMemo(() => ({
    sides: sides.map((s) => ({ ...s, pct: s.pct === '' ? 0 : Number(s.pct), flat: s.flat === '' || s.flat == null ? null : Number(s.flat), agents: (s.agents || []).filter((a) => a.email).map((a) => ({ email: a.email.toLowerCase(), pct: Number(a.pct) || 0 })) })),
    referral: referral.amount ? { ...referral, amount: Number(referral.amount) } : null,
    deductions: deductions.filter((d) => d.amount).map((d) => ({ ...d, amount: Number(d.amount) })),
  }), [sides, referral, deductions]);

  const calc = async () => {
    setBusy('calc');
    try { setPreview((await base44.functions.invoke('commissionPreview', { transactionId: tx.id, input })).data); } catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  useEffect(() => { calc(); /* eslint-disable-next-line */ }, []);

  const saveInputs = async () => {
    await base44.entities.Transaction.update(tx.id, { sides: input.sides, referral: input.referral, deductions: input.deductions });
    refresh();
  };
  const finalize = async () => {
    if (!window.confirm('Save this commission? It counts toward caps and creates payouts waiting for approval.')) return;
    setBusy('final');
    try {
      await saveInputs();
      await base44.functions.invoke('commissionFinalize', { transactionId: tx.id, input: { ...input, closed_date: tx.closed_date || tx.closing_date || undefined } });
      queryClient.invalidateQueries({ queryKey: ['tx-payouts', tx.id] });
      refresh();
      await calc();
    } catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const payoutAction = async (ids, action) => {
    setBusy(action);
    try {
      const r = (await base44.functions.invoke('payoutAction', { payoutIds: ids, action })).data;
      const bad = r.results.filter((x) => !x.ok);
      if (bad.length) window.alert(bad.map((b) => b.error).join('\n'));
      queryClient.invalidateQueries({ queryKey: ['tx-payouts', tx.id] });
    } catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const cda = async () => {
    setBusy('cda');
    try { const r = (await base44.functions.invoke('cdaGenerate', { transactionId: tx.id })).data; window.open(r.url, '_blank'); refresh(); } catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const received = async () => {
    const amt = window.prompt('Commission received from title / closing (amount)', String(preview?.result?.totals?.gross ?? ''));
    if (amt === null) return;
    await base44.entities.Transaction.update(tx.id, { commission_received_amount: Number(amt) || 0, commission_received_at: new Date().toISOString().slice(0, 10) });
    refresh();
  };

  const nameOf = (email) => { const u = users.find((x) => x.email?.toLowerCase() === String(email).toLowerCase()); return u?.display_name || u?.full_name || email; };
  const t = preview?.result?.totals;

  return (
    <div className="max-w-6xl">
      <Section title="Finances" subtitle={`Representing ${sides.filter((s) => (s.agents || []).length).map((s) => (s.side === 'listing' ? 'seller' : 'buyer')).join(' and ') || '-'} · Price ${money(tx.sale_price)}`}
        actions={<>
          <Button variant="outline" className="gap-1.5" onClick={calc} disabled={!!busy}>{busy === 'calc' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Recalculate</Button>
          {accounting && !tx.imported && <Button className="gap-1.5" onClick={finalize} disabled={!!busy}>{busy === 'final' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save commission</Button>}
        </>}>
        {tx.imported && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm">This deal came from your Brokermint history. Its commission was paid there and already counts toward the agent's cap, so it isn't saved again here.</p>}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            {sides.map((s, i) => (
              <div key={s.side} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <p className="font-semibold uppercase text-sm w-28">{s.side === 'listing' ? 'Listing side' : 'Buying side'}</p>
                  <label className="text-xs text-muted-foreground flex items-center gap-1">Award
                    <Input className="h-8 w-20" inputMode="decimal" value={s.pct ?? ''} disabled={!accounting && !user} onChange={(e) => setSides((x) => x.map((y, j) => (j === i ? { ...y, pct: e.target.value, flat: '' } : y)))} />%
                  </label>
                  <span className="text-xs text-muted-foreground">or flat</span>
                  <Input className="h-8 w-28" inputMode="decimal" placeholder="$" value={s.flat ?? ''} onChange={(e) => setSides((x) => x.map((y, j) => (j === i ? { ...y, flat: e.target.value } : y)))} />
                  {(() => {
                    const counted = (s.agents || []).some((a) => a.email) || !sides.some((o) => (o.agents || []).some((a) => a.email));
                    const amt = money(s.flat ? Number(s.flat) : (Number(tx.sale_price) || 0) * (Number(s.pct) || 0) / 100);
                    return counted ? <span className="ml-auto font-semibold">{amt}</span>
                      : <span className="ml-auto text-right"><span className="font-semibold text-muted-foreground line-through">{amt}</span><span className="block text-[11px] text-muted-foreground">Other brokerage's side, not counted. Add an agent if it's yours.</span></span>;
                  })()}
                </div>
                {(s.agents || []).map((a, k) => (
                  <div key={k} className="flex items-center gap-2 mb-2">
                    <select className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={a.email} onChange={(e) => setSides((x) => x.map((y, j) => (j === i ? { ...y, agents: y.agents.map((b, m) => (m === k ? { ...b, email: e.target.value } : b)) } : y)))}>
                      <option value="">Choose agent</option>
                      {users.map((u) => <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
                    </select>
                    <Input className="h-8 w-20" inputMode="decimal" value={a.pct} onChange={(e) => setSides((x) => x.map((y, j) => (j === i ? { ...y, agents: y.agents.map((b, m) => (m === k ? { ...b, pct: e.target.value } : b)) } : y)))} /><span className="text-xs">%</span>
                    <Button size="icon" variant="ghost" onClick={() => setSides((x) => x.map((y, j) => (j === i ? { ...y, agents: y.agents.filter((_, m) => m !== k) } : y)))}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
                <button className="text-xs text-primary" onClick={() => setSides((x) => x.map((y, j) => (j === i ? { ...y, agents: [...(y.agents || []), { email: '', pct: 100 }] } : y)))}>+ add agent</button>
              </div>
            ))}
            <div className="rounded-xl border bg-card p-4 grid sm:grid-cols-4 gap-3 items-end">
              <div><Label>Referral out</Label>
                <select className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={referral.type} onChange={(e) => setReferral((r) => ({ ...r, type: e.target.value }))}>
                  <option value="pct">% of gross</option><option value="flat">Flat $</option>
                </select>
              </div>
              <div><Label>Amount</Label><Input className="mt-1" inputMode="decimal" value={referral.amount} onChange={(e) => setReferral((r) => ({ ...r, amount: e.target.value }))} /></div>
              <div className="sm:col-span-2"><Label>Paid to (email)</Label><Input className="mt-1" value={referral.to} onChange={(e) => setReferral((r) => ({ ...r, to: e.target.value }))} /></div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-semibold mb-2">Deductions from an agent</p>
              {deductions.map((d, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 mb-2">
                  <select className="col-span-4 rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={d.agent_email} onChange={(e) => setDeductions((x) => x.map((y, j) => (j === i ? { ...y, agent_email: e.target.value } : y)))}>
                    <option value="">Agent</option>{users.map((u) => <option key={u.id} value={u.email.toLowerCase()}>{u.display_name || u.full_name}</option>)}
                  </select>
                  <Input className="col-span-3 h-9" placeholder="For" value={d.name} onChange={(e) => setDeductions((x) => x.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} />
                  <Input className="col-span-2 h-9" placeholder="$" value={d.amount} onChange={(e) => setDeductions((x) => x.map((y, j) => (j === i ? { ...y, amount: e.target.value } : y)))} />
                  <Input className="col-span-2 h-9" placeholder="Pay to (email)" value={d.payee || ''} onChange={(e) => setDeductions((x) => x.map((y, j) => (j === i ? { ...y, payee: e.target.value } : y)))} />
                  <Button size="icon" variant="ghost" onClick={() => setDeductions((x) => x.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
              <button className="text-xs text-primary" onClick={() => setDeductions((x) => [...x, { agent_email: '', name: '', amount: '', payee: '' }])}>+ add deduction</button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <p className="font-semibold mb-2">Grand total</p>
              {!t ? <Loader2 className="w-4 h-4 animate-spin" /> : <>
                <Row label="Gross commission" value={money(t.gross)} />
                {t.referral > 0 && <Row label="Referral out" value={money(-t.referral)} />}
                <Row label="Agents net" value={money(t.agent_net)} />
                {t.team_lead > 0 && <Row label="Team leads" value={money(t.team_lead)} />}
                <Row label="Company dollar" value={money(t.company_dollar)} />
                <Row label="Fees" value={money(t.fees)} />
                {t.revshare > 0 && <Row label="Revenue share" value={money(-t.revshare)} />}
                <Row label="Brokerage net" value={money(t.brokerage_net)} strong />
              </>}
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="font-semibold mb-2">Balances</p>
              <Row label="Earnest money" value={money(tx.emd_amount)} />
              <Row label="Commission received" value={tx.commission_received_amount != null ? `${money(tx.commission_received_amount)} (${tx.commission_received_at})` : 'not yet'} />
              {accounting && <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" variant="outline" className="gap-1.5" onClick={received}><Banknote className="w-3.5 h-3.5" /> Funds received</Button>
                <EmdButton tx={tx} refresh={refresh} />
                <Button size="sm" variant="outline" className="gap-1.5" onClick={cda} disabled={!!busy}>{busy === 'cda' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} CDA</Button>
              </div>}
            </div>
            {isAdminRole(user?.role) && ['closed'].includes(tx.status) && (
              <Button variant="outline" className="w-full gap-1.5" onClick={async () => setThanks((await base44.functions.invoke('ceoThankYou', { transactionId: tx.id, preview: true })).data)}>
                <Heart className="w-4 h-4 text-rose-500" /> {tx.thank_you_sent_at ? 'Send CEO thank-you again' : 'Send CEO thank-you'}
              </Button>
            )}
          </div>
        </div>
      </Section>

      {preview?.result?.agents?.length > 0 && (
        <Section title="By agent">
          <div className="grid md:grid-cols-2 gap-4">
            {preview.result.agents.map((a, i) => {
              const ctx = preview.agents?.[i];
              return (
                <div key={a.email} className="rounded-xl border bg-card p-4">
                  <p className="font-semibold">{nameOf(a.email)}</p>
                  <p className="text-xs text-muted-foreground mb-2">{ctx?.plan} · cap year from {ctx?.cap_year_start}</p>
                  {a.lines.map((l, k) => <Row key={k} label={l.label} value={money(l.amount)} strong={l.total} />)}
                  {a.revshare.map((r) => <Row key={r.level} label={`Revenue share L${r.level} to ${nameOf(r.email)} (paid by brokerage)`} value={money(r.amount)} />)}
                  {a.cap && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground"><span>Cap {money(a.cap.amount)}</span><span>{a.cap.remaining > 0 ? `${money(a.cap.remaining)} left after this deal` : 'Capped'}</span></div>
                      <div className="h-2 rounded bg-muted mt-1 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${Math.min(100, (a.cap.paid_after / a.cap.amount) * 100)}%` }} /></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      <Section title="Payouts" actions={accounting && livePayouts.some((p) => p.status === 'pending_approval') && (
        <Button size="sm" className="gap-1.5" onClick={() => payoutAction(livePayouts.filter((p) => p.status === 'pending_approval').map((p) => p.id), 'approve')}><Check className="w-3.5 h-3.5" /> Approve all</Button>
      )}>
        {!livePayouts.length ? <Empty>No payouts yet. {accounting ? 'Save the commission to create them.' : ''}</Empty> : (
          <ul className="divide-y rounded-xl border bg-card">
            {livePayouts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1 min-w-[180px]"><p className="font-medium">{p.payee_name || nameOf(p.payee_email)}</p><p className="text-xs text-muted-foreground">{p.kind.replace('_', ' ')}{p.level ? ` L${p.level}` : ''}{p.failure_reason ? ` · ${p.failure_reason}` : ''}</p></div>
                <span className="font-semibold">{money(p.amount)}</span>
                <Pill status={p.status} />
                {accounting && p.status === 'pending_approval' && <Button size="sm" variant="outline" onClick={() => payoutAction([p.id], 'approve')}>Approve</Button>}
                {accounting && p.status === 'approved' && <>
                  <Button size="sm" className="gap-1" onClick={() => window.confirm(`Send ${money(p.amount)} to ${p.payee_email} by direct deposit?`) && payoutAction([p.id], 'send')}><Send className="w-3.5 h-3.5" /> Pay</Button>
                  <Button size="sm" variant="ghost" onClick={() => payoutAction([p.id], 'mark_paid')}>Paid another way</Button>
                </>}
                {accounting && ['pending_approval', 'approved', 'failed'].includes(p.status) && <Button size="sm" variant="ghost" className="text-red-600" onClick={() => payoutAction([p.id], 'cancel')}>Cancel</Button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {thanks && <ThankYouPreview tx={tx} data={thanks} onClose={() => setThanks(null)} onSent={() => { setThanks(null); refresh(); }} />}
    </div>
  );
}

function EmdButton({ tx, refresh }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ emd_amount: tx.emd_amount ?? '', emd_held_by: tx.emd_held_by || '', emd_received_date: tx.emd_received_date || '', emd_deposited: !!tx.emd_deposited });
  return (<>
    <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Earnest money</Button>
    {open && (
      <Dialog open onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Earnest money deposit</DialogTitle></DialogHeader>
          <div><Label>Amount</Label><Input className="mt-1" inputMode="decimal" value={f.emd_amount} onChange={(e) => setF({ ...f, emd_amount: e.target.value })} /></div>
          <div><Label>Held by</Label><Input className="mt-1" placeholder="Brokerage trust, title company, attorney…" value={f.emd_held_by} onChange={(e) => setF({ ...f, emd_held_by: e.target.value })} /></div>
          <div><Label>Received</Label><Input className="mt-1" type="date" value={f.emd_received_date} onChange={(e) => setF({ ...f, emd_received_date: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.emd_deposited} onChange={(e) => setF({ ...f, emd_deposited: e.target.checked })} /> Deposited</label>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={async () => { await base44.entities.Transaction.update(tx.id, { ...f, emd_amount: f.emd_amount === '' ? null : Number(f.emd_amount) }); setOpen(false); refresh(); }}>Save</Button></div>
        </DialogContent>
      </Dialog>
    )}
  </>);
}

function ThankYouPreview({ tx, data, onClose, onSent }) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>CEO thank-you</DialogTitle></DialogHeader>
        <p className="text-sm">To: {data.recipients.length ? data.recipients.map((r) => `${r.name} <${r.email}>`).join(', ') : <span className="text-red-600">No client contacts with an email. Add them under Users & contacts and tick "Client".</span>}</p>
        <p className="text-sm">Subject: {data.subject}</p>
        <iframe title="Preview" srcDoc={data.html} className="w-full h-[480px] rounded border" />
        <p className="text-xs text-muted-foreground">Set the CEO name, message and YouTube link in Settings.</p>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !data.recipients.length} onClick={async () => { setBusy(true); try { await base44.functions.invoke('ceoThankYou', { transactionId: tx.id }); onSent(); } catch (e) { window.alert(e.message); setBusy(false); } }}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
