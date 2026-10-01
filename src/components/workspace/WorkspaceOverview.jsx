import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Sparkles, RefreshCw, CheckCircle2, Circle, CalendarClock, AlertTriangle, Mail, Phone, ListChecks, MessagesSquare, FileSignature, Megaphone, ChevronDown, Pencil, Info, Upload, ScanLine } from 'lucide-react';
import { can } from '../../../shared/permissions.generated.js';
import { STAGES, DEADLINES, dealDeadlines, dealStage, dealHealth, countdown, todayStr } from '../../../shared/dealTimeline.js';
import { Row, money } from './ui';
import FileCheck from '@/components/transactions/FileCheck';
import TransactionESign from '@/components/transactions/TransactionESign';
import DocIntake from './DocIntake';
import InspectionRequest from './InspectionRequest';
import { changeField, setDeadlineDone, postUpdate } from '@/lib/dealActions';

const STATUSES = [['active', 'Active'], ['pending', 'Pending'], ['clear_to_close', 'Clear to close'], ['closed', 'Closed'], ['cancelled', 'Cancelled']];
const HEALTH = { good: ['On track', 'bg-emerald-100 text-emerald-800'], watch: ['Needs a look', 'bg-amber-100 text-amber-800'], risk: ['At risk', 'bg-red-100 text-red-800'] };
const usDate = (d) => { const [y, m, dd] = String(d || '').slice(0, 10).split('-'); return y && m && dd ? `${m}/${dd}/${y}` : ''; };
const names = (v) => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean).join(', ') : v || '');

// The deal at a glance: where it is, what's next, what the AI sees, and one-tap actions.
export default function WorkspaceOverview({ tx, user, refresh, canEdit, admin, openCopilot }) {
  const [, setParams] = useSearchParams();
  const today = todayStr();
  const { data: lists = [] } = useQuery({
    queryKey: ['tx-checklists-overview', tx.id, tx.updated_date],
    queryFn: () => base44.entities.Checklist.filter({ subject_type: 'transaction', subject_id: tx.id }, 'created_date', 20).catch(() => []),
  });
  const { data: contacts = [] } = useQuery({
    queryKey: ['tx-contacts', tx.id],
    queryFn: () => base44.entities.TransactionContact.filter({ transaction_id: tx.id }, 'created_date', 100).catch(() => []),
  });
  const items = useMemo(() => lists.flatMap((l) => l.items || []), [lists]);
  const deadlines = dealDeadlines(tx, today);
  const stage = dealStage(tx, today);
  const health = dealHealth(tx, { checklist: items, today });
  const closing = deadlines.find((d) => d.field === 'closing_date');
  const doneItems = items.filter((i) => ['approved', 'exempt', 'done'].includes(i.status)).length;
  const [posting, setPosting] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const goTab = (t) => setParams({ tab: t });
  const buyerSide = (tx.deal_type || 'buyer') !== 'listing';

  return (
    <div className="max-w-6xl space-y-5">
      {/* Hero */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="p-5 sm:p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white">
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex-1 min-w-[220px]">
              <p className="text-xs uppercase tracking-wider text-emerald-300">{(tx.deal_type || 'buyer').replace(/_/g, ' ')} · {(tx.status || 'active').replace(/_/g, ' ')}</p>
              <h1 className="text-2xl sm:text-3xl font-bold mt-1 leading-tight">{tx.property_address}</h1>
              <p className="text-sm text-slate-300 mt-1">
                {tx.sale_price ? money(tx.sale_price).replace('.00', '') : 'No price yet'}
                {names(tx.buyers) ? ` · Buyer ${names(tx.buyers)}` : ''}{names(tx.sellers) ? ` · Seller ${names(tx.sellers)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3">
              {closing && !closing.done && (
                <div className="text-center rounded-xl bg-white/10 px-4 py-2">
                  <p className="text-3xl font-bold leading-none">{Math.abs(closing.daysLeft)}</p>
                  <p className="text-[11px] text-slate-300 mt-1">{closing.daysLeft < 0 ? 'days past closing' : closing.daysLeft === 1 ? 'day to closing' : 'days to closing'}</p>
                </div>
              )}
              <span title={health.reasons.map((r) => r.text).join('\n')} className={`text-xs font-semibold rounded-full px-3 py-1 ${HEALTH[health.level][1]}`}>{HEALTH[health.level][0]} · {health.score}</span>
            </div>
          </div>
          <Stepper stage={stage} />
        </div>
        <div className="flex flex-wrap gap-2 p-3 border-t bg-muted/30">
          <QuickAction icon={Sparkles} label="Ask AI" onClick={openCopilot} accent />
          {canEdit && <QuickAction icon={Upload} label="Add document" onClick={() => document.getElementById('doc-intake')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />}
          {canEdit && buyerSide && <QuickAction icon={ScanLine} label="Inspection request" onClick={() => setInspecting(true)} />}
          {canEdit && <QuickAction icon={FileSignature} label="Send for signature" onClick={() => document.getElementById('deal-signing')?.scrollIntoView({ behavior: 'smooth' })} />}
          {canEdit && <QuickAction icon={Megaphone} label="Post update" onClick={() => setPosting(true)} />}
          <QuickAction icon={ListChecks} label={`Checklist ${items.length ? `${doneItems}/${items.length}` : ''}`} onClick={() => goTab('checklists')} />
          <QuickAction icon={MessagesSquare} label="Deal chat" onClick={() => goTab('chat')} />
        </div>
        {posting && <PostUpdate tx={tx} user={user} onDone={() => { setPosting(false); refresh(); }} />}
      </div>
      {inspecting && <InspectionRequest tx={tx} user={user} contacts={contacts} refresh={refresh} onClose={() => setInspecting(false)} />}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
        <div className="space-y-5 min-w-0">
          <AIBrief tx={tx} health={health} />
          <Timeline tx={tx} user={user} deadlines={deadlines} canEdit={canEdit} refresh={refresh} />
          <div id="doc-intake" className="rounded-2xl border bg-card p-4">
            <p className="font-semibold mb-3">Documents</p>
            <DocIntake tx={tx} user={user} refresh={refresh} canEdit={canEdit} />
          </div>
          <div id="deal-signing" className="rounded-2xl border bg-card p-4">
            <p className="font-semibold mb-2">Signatures</p>
            <TransactionESign tx={tx} isAdmin={canEdit} user={user} onUpdate={refresh} />
          </div>
        </div>

        <div className="space-y-5 min-w-0">
          <People tx={tx} contacts={contacts} onManage={() => goTab('contacts')} />
          <div className="rounded-2xl border bg-card p-4">
            <p className="font-semibold mb-2">Money</p>
            <Row label="Price" value={money(tx.sale_price)} />
            {tx.earnest_money != null && <Row label="Earnest money" value={money(tx.earnest_money)} />}
            {tx.commission_calc && <Row label="Gross commission" value={money(tx.commission_calc.gross)} />}
            {tx.commission_calc && <Row label="Agent net" value={money(tx.commission_calc.agent_net)} strong />}
            {(admin || can(user, 'tx.view_commissions')) && <button type="button" onClick={() => goTab('finances')} className="text-xs text-primary hover:underline mt-1">Open finances</button>}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="font-semibold mb-2">Recent updates</p>
            {(tx.updates || []).length ? (
              <ul className="space-y-2">
                {[...(tx.updates || [])].slice(-5).reverse().map((u) => (
                  <li key={u.id || u.posted_at} className="text-sm">
                    <p>{u.milestone ? <span className="text-[11px] font-semibold rounded bg-muted px-1.5 py-0.5 mr-1">{u.milestone}</span> : null}{u.message}</p>
                    <p className="text-[11px] text-muted-foreground">{u.posted_by} · {u.posted_at ? new Date(u.posted_at).toLocaleString() : ''}</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted-foreground">No updates yet.</p>}
          </div>
          <div className="rounded-2xl border bg-card p-4">
            <p className="font-semibold mb-2">Marketing</p>
            <div className="flex flex-wrap gap-2">
              {(tx.status === 'closed' ? [['just_sold', 'Just sold post']] : [['under_contract', 'Under contract post'], ['open_house', 'Open house flyer'], ['just_listed', 'Just listed flyer']]).map(([k, l]) => (
                <a key={k} href={`/Marketing?tx=${tx.id}&kind=${k}`} className="rounded-full border px-3 py-1.5 text-xs hover:bg-muted">{l}</a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <Collapsible title="AI file review" subtitle="A full compliance check of the file before closing.">
        <FileCheck tx={tx} canEdit={canEdit} onUpdate={refresh} />
      </Collapsible>
      <Collapsible title="Deal details" subtitle="Property, status, type, TC, MLS and title company." icon={Pencil}>
        <DealDetails tx={tx} user={user} refresh={refresh} canEdit={canEdit} admin={admin} />
      </Collapsible>
    </div>
  );
}

function Stepper({ stage }) {
  const steps = STAGES.filter((s) => s.key !== 'pre_contract');
  const at = Math.max(0, steps.findIndex((s) => s.key === stage));
  return (
    <div className="mt-5 flex items-center gap-1 overflow-x-auto pb-1">
      {steps.map((s, i) => (
        <React.Fragment key={s.key}>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${i < at || stage === 'closed' ? 'bg-emerald-400 text-slate-900' : i === at ? 'bg-white text-slate-900 ring-4 ring-white/20' : 'bg-white/15 text-slate-300'}`}>
              {i < at || stage === 'closed' ? '✓' : i + 1}
            </span>
            <span className={`text-xs whitespace-nowrap ${i === at ? 'font-semibold text-white' : 'text-slate-300'}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <span className={`h-px w-6 sm:flex-1 sm:min-w-4 flex-shrink-0 ${i < at ? 'bg-emerald-400' : 'bg-white/20'}`} />}
        </React.Fragment>
      ))}
    </div>
  );
}

function QuickAction({ icon: Icon, label, onClick, accent }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm border ${accent ? 'bg-gradient-to-r from-violet-600 to-indigo-600 text-white border-transparent' : 'bg-background hover:border-primary'}`}>
      <Icon className="w-4 h-4" /> {label}
    </button>
  );
}

// The AI's read of the deal. Kept in this browser until something on the deal changes.
function AIBrief({ tx, health }) {
  const key = `gbh-brief:${tx.id}`;
  const [data, setData] = useState(() => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const load = async (force) => {
    setBusy(true); setErr(null);
    try {
      const res = await base44.functions.invoke('dealAssistant', { mode: 'brief', transactionId: tx.id, sig: force ? undefined : data?.sig, refresh: !!force });
      if (!res.data.unchanged) {
        const next = { brief: res.data.brief, sig: res.data.sig };
        setData(next);
        try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* private mode */ }
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [tx.id, tx.updated_date]);
  const b = data?.brief;
  return (
    <div className="rounded-2xl border bg-gradient-to-br from-violet-50 via-card to-card dark:from-violet-950/20 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-violet-600" />
        <p className="font-semibold">Where things stand</p>
        <button type="button" onClick={() => load(true)} disabled={busy} className="ml-auto text-xs text-muted-foreground hover:text-foreground flex items-center gap-1" title="Ask the AI again">
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} {busy ? 'Thinking' : 'Refresh'}
        </button>
      </div>
      {!b && busy && <p className="text-sm text-muted-foreground">Reading the deal…</p>}
      {err && !b && <p className="text-sm text-muted-foreground">The AI summary isn't available right now.</p>}
      {b && (
        <div className="space-y-3">
          <p className="text-[15px] font-medium leading-snug">{b.headline}</p>
          {b.next_steps?.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Next steps</p>
              <ol className="space-y-1.5">
                {b.next_steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="w-5 h-5 rounded-full bg-violet-600 text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">{i + 1}</span>
                    <span>{s.text}{(s.who || s.due) && <span className="text-xs text-muted-foreground"> · {[s.who, s.due ? usDate(s.due) : null].filter(Boolean).join(' · ')}</span>}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {b.risks?.length > 0 && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 px-3 py-2 space-y-1">
              {b.risks.map((r, i) => <p key={i} className="text-sm text-amber-900 dark:text-amber-200 flex gap-1.5"><AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {r}</p>)}
            </div>
          )}
        </div>
      )}
      {!b && !busy && !err && health.reasons.length > 0 && <p className="text-sm">{health.reasons[0].text}</p>}
    </div>
  );
}

function Timeline({ tx, user, deadlines, canEdit, refresh }) {
  const [editing, setEditing] = useState(null);
  const [val, setVal] = useState('');
  const [busy, setBusy] = useState(null);
  const missing = DEADLINES.filter((d) => !tx[d.field]);
  const toggle = async (d) => { setBusy(d.field); try { await setDeadlineDone(tx, d.field, !d.done); refresh(); } finally { setBusy(null); } };
  const saveDate = async (field) => {
    setBusy(field);
    try { await changeField(tx, user, field, val || null); setEditing(null); refresh(); } catch (e) { window.alert(e.message); } finally { setBusy(null); }
  };
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <CalendarClock className="w-4 h-4 text-primary" />
        <p className="font-semibold">Timeline</p>
        <span className="ml-auto text-xs text-muted-foreground">Reminders go out 48 hours before each date</span>
      </div>
      {!deadlines.length && <p className="text-sm text-muted-foreground">No dates yet. Drop the contract in Documents and the AI will find them, or add them below.</p>}
      <ol className="relative">
        {deadlines.map((d, i) => {
          const tone = d.done ? 'text-muted-foreground' : d.overdue ? 'text-red-600' : d.soon ? 'text-amber-600' : 'text-foreground';
          return (
            <li key={d.field} className="flex gap-3 pb-3 last:pb-0 relative">
              {i < deadlines.length - 1 && <span className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />}
              <button type="button" disabled={!canEdit || busy === d.field || d.field === 'acceptance_date'} onClick={() => toggle(d)} className="relative z-10 mt-0.5" title={d.done ? 'Mark not done' : 'Mark done'}>
                {busy === d.field ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  : d.done ? <CheckCircle2 className="w-6 h-6 text-emerald-600 bg-card" /> : <Circle className={`w-6 h-6 bg-card ${d.overdue ? 'text-red-500' : d.soon ? 'text-amber-500' : 'text-muted-foreground'}`} />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <p className={`text-sm font-medium ${d.done ? 'line-through text-muted-foreground' : ''}`}>{d.label}</p>
                  <p className={`text-xs ${tone}`}>{d.done ? 'done' : countdown(d.daysLeft)}</p>
                </div>
                {editing === d.field ? (
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-40" />
                    <Button size="sm" className="h-8" disabled={busy === d.field} onClick={() => saveDate(d.field)}>Save</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                ) : (
                  <button type="button" disabled={!canEdit} onClick={() => { setEditing(d.field); setVal(d.date); }} className="text-xs text-muted-foreground hover:text-foreground">{usDate(d.date)}{canEdit ? ' · change' : ''}</button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {canEdit && missing.length > 0 && (
        <div className="mt-3 pt-3 border-t">
          {editing && missing.some((m) => m.field === editing) ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm">{missing.find((m) => m.field === editing).label}</span>
              <Input type="date" value={val} onChange={(e) => setVal(e.target.value)} className="h-8 w-40" />
              <Button size="sm" className="h-8" disabled={!val || busy === editing} onClick={() => saveDate(editing)}>Add</Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-muted-foreground mr-1 self-center">Add a date:</span>
              {missing.map((m) => <button key={m.field} type="button" onClick={() => { setEditing(m.field); setVal(''); }} className="text-xs rounded-full border px-2.5 py-1 hover:border-primary">+ {m.short}</button>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function People({ tx, contacts, onManage }) {
  const people = [
    { name: tx.agent_name || tx.agent_email, role: 'Agent', email: tx.agent_email },
    ...(tx.co_agents || []).map((a) => ({ name: a.name || a.email, role: 'Co-agent', email: a.email })),
    ...(tx.tc_email ? [{ name: tx.tc_name || tx.tc_email, role: 'TC', email: tx.tc_email }] : []),
    ...contacts.map((c) => ({ name: c.name, role: c.role, email: c.email, phone: c.phone, client: c.is_client })),
  ];
  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-center mb-2"><p className="font-semibold">People</p><button type="button" onClick={onManage} className="ml-auto text-xs text-primary hover:underline">Manage</button></div>
      <ul className="space-y-2">
        {people.map((p, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">{String(p.name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{p.name}{p.client && <span className="ml-1 text-[10px] rounded bg-emerald-100 text-emerald-800 px-1">client</span>}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{p.role}</p>
            </div>
            {p.email && <a href={`mailto:${p.email}`} className="p-1.5 rounded-full hover:bg-muted" aria-label={`Email ${p.name}`}><Mail className="w-4 h-4" /></a>}
            {p.phone && <a href={`tel:${String(p.phone).replace(/[^\d+]/g, '')}`} className="p-1.5 rounded-full hover:bg-muted" aria-label={`Call ${p.name}`}><Phone className="w-4 h-4" /></a>}
          </li>
        ))}
      </ul>
      {!contacts.length && <p className="text-xs text-muted-foreground mt-2 flex gap-1"><Info className="w-3.5 h-3.5 flex-shrink-0" /> Add the clients, lender and title company under Manage.</p>}
    </div>
  );
}

function PostUpdate({ tx, user, onDone }) {
  const [msg, setMsg] = useState('');
  const [milestone, setMilestone] = useState('');
  const [busy, setBusy] = useState(false);
  const post = async () => {
    setBusy(true);
    try {
      await postUpdate(tx, user, msg, milestone ? { milestone } : {});
      if (milestone === 'Clear to Close') await base44.entities.Transaction.update(tx.id, { status: 'clear_to_close' });
      base44.functions.invoke('notifyTransactionActivity', { type: 'update_posted', transaction: tx, update: { message: msg, milestone } }).catch(() => {});
      onDone();
    } finally { setBusy(false); }
  };
  return (
    <div className="p-3 border-t space-y-2">
      <textarea autoFocus value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder="What happened? e.g. Appraisal came in at value." className="w-full rounded-lg border bg-background px-3 py-2 text-sm" />
      <div className="flex flex-wrap gap-2 items-center">
        <select value={milestone} onChange={(e) => setMilestone(e.target.value)} className="rounded-md border bg-background px-2 py-1.5 text-sm">
          <option value="">No milestone</option>
          {['Inspection done', 'Appraisal in', 'Loan commitment', 'Clear to Close', 'Closing scheduled'].map((m) => <option key={m}>{m}</option>)}
        </select>
        <Button size="sm" onClick={post} disabled={busy || !msg.trim()}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}</Button>
        <Button size="sm" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </div>
  );
}

function Collapsible({ title, subtitle, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 p-4 text-left">
        <div className="flex-1"><p className="font-semibold">{title}</p>{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}</div>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

function DealDetails({ tx, user, refresh, canEdit, admin }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [users, setUsers] = useState([]);
  useEffect(() => {
    setForm({
      property_address: tx.property_address || '', sale_price: tx.sale_price ?? '', status: tx.status || 'active',
      deal_type: tx.deal_type || tx.transaction_type || 'buyer', tc_email: tx.tc_email || '',
      title_company: tx.title_company || '', mls_number: tx.mls_number || '',
    });
  }, [tx]);
  useEffect(() => {
    if (admin) base44.entities.User.filter({ brokerage_id: tx.brokerage_id }, 'full_name', 1000).then(setUsers).catch(() => {});
  }, [admin, tx.brokerage_id]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const closing = ['closed', 'cancelled'].includes(form.status) && form.status !== tx.status;
  const canClose = admin || can(user, 'tx.close');
  const canReopen = admin || can(user, 'tx.reopen');
  const save = async () => {
    if (closing && !canClose) return window.alert('You need the "close transactions" permission.');
    if (['closed', 'cancelled'].includes(tx.status) && form.status !== tx.status && !canReopen) return window.alert('You need the "re-open transactions" permission.');
    setSaving(true);
    try {
      const tc = users.find((u) => u.email === form.tc_email);
      const patch = { ...form, sale_price: form.sale_price === '' ? null : Number(form.sale_price) };
      if (admin) patch.tc_name = tc ? (tc.display_name || tc.full_name) : form.tc_email ? tx.tc_name : null;
      else delete patch.tc_email;
      if (form.status === 'closed' && !tx.closed_date) patch.closed_date = todayStr();
      await base44.entities.Transaction.update(tx.id, patch);
      refresh();
    } catch (err) { window.alert(err.message); } finally { setSaving(false); }
  };
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="sm:col-span-2"><Label>Property</Label><Input className="mt-1" value={form.property_address || ''} onChange={set('property_address')} disabled={!canEdit} /></div>
        <div><Label>Sale price</Label><Input className="mt-1" inputMode="numeric" value={form.sale_price ?? ''} onChange={set('sale_price')} disabled={!canEdit} /></div>
        <div>
          <Label>Status</Label>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.status} onChange={set('status')} disabled={!canEdit}>
            {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <Label>Deal type</Label>
          <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.deal_type} onChange={set('deal_type')} disabled={!canEdit}>
            {[['buyer', 'Buyer'], ['listing', 'Listing'], ['dual', 'Dual agent'], ['rental_listing', 'Rental listing'], ['rental_tenant', 'Rental tenant'], ['referral', 'Referral']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <Label>Transaction coordinator</Label>
          {admin ? (
            <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.tc_email} onChange={set('tc_email')}>
              <option value="">None</option>
              {users.map((u) => <option key={u.id} value={u.email}>{u.display_name || u.full_name || u.email}</option>)}
            </select>
          ) : <Input className="mt-1" value={tx.tc_name || tx.tc_email || '-'} disabled />}
        </div>
        <div><Label>MLS #</Label><Input className="mt-1" value={form.mls_number || ''} onChange={set('mls_number')} disabled={!canEdit} /></div>
        <div className="sm:col-span-2"><Label>Title company / closing attorney</Label><Input className="mt-1" value={form.title_company || ''} onChange={set('title_company')} disabled={!canEdit} /></div>
      </div>
      {canEdit && <Button onClick={save} disabled={saving} className="gap-2">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save details</Button>}
    </div>
  );
}
