import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Clock, CalendarClock, CheckCircle2, ChevronRight, Zap } from 'lucide-react';
import { STAGES, dealStage, nextDeadline, dealHealth, countdown, todayStr, daysBetween } from '../../../shared/dealTimeline.js';

const COLS = STAGES.filter((s) => s.key !== 'title').map((s) => (s.key === 'financing' ? { ...s, label: 'Appraisal, financing & title', includes: ['financing', 'title'] } : { ...s, includes: [s.key] }));
const HEALTH = { good: 'bg-emerald-500', watch: 'bg-amber-500', risk: 'bg-red-500' };
const money = (n) => (n ? `$${Math.round(Number(n)).toLocaleString('en-US')}` : '');
const initials = (s) => String(s || '?').split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();

/**
 * Deals as a board by stage, with "needs attention today" on top.
 * transactions: what the person can see; checklistsByTx: { [txId]: Checklist[] }
 */
export default function DealPipeline({ transactions, checklistsByTx = {} }) {
  const navigate = useNavigate();
  const today = todayStr();
  const deals = useMemo(() => transactions
    .filter((tx) => tx.status !== 'cancelled')
    .filter((tx) => tx.status !== 'closed' || !tx.closed_date || daysBetween(String(tx.closed_date).slice(0, 10), today) <= 45)
    .map((tx) => {
      const items = (checklistsByTx[tx.id] || []).flatMap((l) => l.items || []);
      const done = items.filter((i) => ['approved', 'exempt', 'done'].includes(i.status)).length;
      return { tx, stage: dealStage(tx, today), next: nextDeadline(tx, today), health: dealHealth(tx, { checklist: items, today }), done, total: items.length };
    }), [transactions, checklistsByTx, today]);

  const attention = deals
    .filter((d) => d.tx.status !== 'closed')
    .flatMap((d) => d.health.reasons.filter((r) => r.severity !== 'info').map((r) => ({ ...r, deal: d })))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1))
    .slice(0, 8);
  const closingThisWeek = deals.filter((d) => d.tx.status !== 'closed' && d.tx.closing_date && daysBetween(today, String(d.tx.closing_date).slice(0, 10)) >= 0 && daysBetween(today, String(d.tx.closing_date).slice(0, 10)) <= 7);

  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-[1fr_auto] gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-semibold flex items-center gap-1.5 mb-2"><Zap className="w-4 h-4 text-orange-500" /> Needs attention today</p>
          {!attention.length ? (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-600" /> Nothing urgent. Every deadline is on track.</p>
          ) : (
            <ul className="space-y-1.5">
              {attention.map((a, i) => (
                <li key={i}>
                  <button type="button" onClick={() => navigate(`/Transactions/${a.deal.tx.id}`)} className="w-full text-left flex items-start gap-2 text-sm hover:bg-muted/60 rounded-md px-1.5 py-1">
                    <AlertTriangle className={`w-4 h-4 mt-0.5 flex-shrink-0 ${a.severity === 'critical' ? 'text-red-600' : 'text-amber-500'}`} />
                    <span className="min-w-0"><span className="font-medium">{a.deal.tx.property_address}</span><span className="text-muted-foreground"> · {a.text}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-1 gap-2 sm:w-44">
          <Stat label="Open deals" value={deals.filter((d) => d.tx.status !== 'closed').length} />
          <Stat label="Closing in 7 days" value={closingThisWeek.length} />
          <Stat label="Volume in progress" value={money(deals.filter((d) => d.tx.status !== 'closed').reduce((s, d) => s + (Number(d.tx.sale_price) || 0), 0)) || '$0'} small />
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1 snap-x">
        {COLS.map((col) => {
          const list = deals.filter((d) => col.includes.includes(d.stage))
            .sort((a, b) => (a.next?.date || '9999').localeCompare(b.next?.date || '9999'));
          return (
            <div key={col.key} className="w-[260px] min-w-[260px] flex-shrink-0 snap-start">
              <div className="flex items-center gap-2 mb-2 px-1">
                <p className="text-sm font-semibold">{col.label}</p>
                <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2">{list.length}</span>
              </div>
              <div className="space-y-2 rounded-xl bg-muted/40 p-2 min-h-[140px]">
                {!list.length && <p className="text-xs text-muted-foreground text-center py-8">No deals</p>}
                {list.map((d) => <DealCard key={d.tx.id} d={d} onOpen={() => navigate(`/Transactions/${d.tx.id}`)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="rounded-xl border bg-card px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`${small ? 'text-base' : 'text-xl'} font-bold`}>{value}</p>
    </div>
  );
}

function DealCard({ d, onOpen }) {
  const { tx, next, health, done, total } = d;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const nextCls = !next ? 'text-muted-foreground' : next.overdue ? 'text-red-600' : next.soon ? 'text-amber-600' : 'text-muted-foreground';
  return (
    <button type="button" onClick={onOpen} className="w-full text-left rounded-lg border bg-card p-3 hover:shadow-md transition-shadow">
      <div className="flex items-start gap-2">
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${HEALTH[health.level]}`} title={`Health ${health.score}/100`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-snug line-clamp-2">{tx.property_address || 'Untitled deal'}</p>
          <p className="text-xs text-muted-foreground truncate">{money(tx.sale_price)}{tx.sale_price && (tx.buyers?.length || tx.sellers?.length) ? ' · ' : ''}{(tx.buyers?.length ? tx.buyers : tx.sellers || []).filter(Boolean).join(', ')}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      </div>
      <p className={`mt-2 text-xs flex items-center gap-1 ${nextCls}`}>
        {next ? <><CalendarClock className="w-3.5 h-3.5" /> {next.short} {countdown(next.daysLeft)}</> : tx.status === 'closed' ? <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Closed</> : <><Clock className="w-3.5 h-3.5" /> No dates yet</>}
      </p>
      {total > 0 && (
        <div className="mt-2">
          <div className="h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
          <p className="text-[10px] text-muted-foreground mt-0.5">{done}/{total} checklist</p>
        </div>
      )}
      <div className="mt-2 flex items-center gap-1">
        <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center" title={tx.agent_name || tx.agent_email}>{initials(tx.agent_name || tx.agent_email)}</span>
        {tx.tc_name && <span className="w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold flex items-center justify-center" title={`TC ${tx.tc_name}`}>{initials(tx.tc_name)}</span>}
      </div>
    </button>
  );
}
