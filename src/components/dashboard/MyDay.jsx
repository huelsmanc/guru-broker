import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { CalendarClock, FileWarning, Wallet, Handshake, MessageSquare, AtSign, FileCheck2, Banknote, BadgeAlert, Loader2, ChevronRight, Upload, CheckSquare } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useChat } from '@/lib/chat/ChatProvider';
import { cn } from '@/lib/utils';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const day = (d) => format(new Date(`${d}T12:00:00`), 'EEE, MMM d');

function Tile({ to, icon: Icon, label, value, sub, tone }) {
  return (
    <Link to={to} className={cn('rounded-2xl border bg-card p-4 hover:shadow-md transition-shadow flex flex-col gap-1', tone)}>
      <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Icon className="w-4 h-4" />{label}</span>
      <span className="text-2xl font-bold">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </Link>
  );
}

// "My day": money, deadlines, documents and tasks, messages, and what's waiting on admins.
export default function MyDay() {
  const chat = useChat();
  const { data, isLoading } = useQuery({ queryKey: ['my-day'], queryFn: async () => (await base44.functions.invoke('myDay', {})).data, staleTime: 60 * 1000 });
  if (isLoading) return <div className="rounded-2xl border p-6 mb-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  if (!data) return null;
  const capText = data.cap?.amount ? `${money(data.cap.paid)} of ${money(data.cap.amount)} cap` : data.cap ? 'No cap on your plan' : '';
  const w = data.waiting;
  const overdue = data.deadlines.filter((d) => d.overdue).length;
  return (
    <section className="mb-10 space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile to="/MyCommissions" icon={Wallet} label="Pending commissions" value={money(data.pending_net)} sub={`${data.deals} open deal${data.deals === 1 ? '' : 's'}${data.closing_this_month ? ` · ${data.closing_this_month} closing this month` : ''}`} />
        <Link to="/MyCommissions" className="rounded-2xl border bg-card p-4 hover:shadow-md transition-shadow">
          <span className="text-xs text-muted-foreground flex items-center gap-1.5"><Wallet className="w-4 h-4" />Cap year</span>
          {data.cap?.amount ? (
            <>
              <span className="text-2xl font-bold">{data.cap.pct}%</span>
              <div className="h-2 rounded-full bg-muted mt-1 overflow-hidden"><div className={cn('h-full', data.cap.pct >= 100 ? 'bg-emerald-500' : 'bg-primary')} style={{ width: `${data.cap.pct}%` }} /></div>
              <span className="text-xs text-muted-foreground">{capText}</span>
            </>
          ) : <span className="block text-sm mt-1">{capText || 'Set up in Commission Plans'}</span>}
        </Link>
        <Tile to="/DirectMessages" icon={MessageSquare} label="Unread messages" value={chat?.totals.dms || 0} sub={chat?.totals.mentions ? `${chat.totals.mentions} @mention${chat.totals.mentions > 1 ? 's' : ''} in channels` : 'Chats and groups'} />
        <Tile to="/Transactions" icon={CalendarClock} label="Deadlines (14 days)" value={data.deadlines.length} sub={overdue ? `${overdue} overdue` : 'Nothing overdue'} tone={overdue ? 'border-red-300 bg-red-50/60 dark:bg-red-950/20' : ''} />
      </div>

      {w && (
        <div className="flex flex-wrap gap-2">
          {w.docs != null && <Link to="/ApproveDocs" className={cn('rounded-full border px-3 py-1.5 text-sm flex items-center gap-1.5', w.docs && 'border-amber-300 bg-amber-50 dark:bg-amber-950/30')}><FileCheck2 className="w-4 h-4" /> {w.docs} doc{w.docs === 1 ? '' : 's'} to review</Link>}
          {w.payouts != null && <Link to="/Payouts" className={cn('rounded-full border px-3 py-1.5 text-sm flex items-center gap-1.5', w.payouts && 'border-amber-300 bg-amber-50 dark:bg-amber-950/30')}><Banknote className="w-4 h-4" /> {w.payouts} payout{w.payouts === 1 ? '' : 's'} to approve</Link>}
          {w.offer_reviews != null && <Link to="/Offers" className={cn('rounded-full border px-3 py-1.5 text-sm flex items-center gap-1.5', w.offer_reviews && 'border-amber-300 bg-amber-50 dark:bg-amber-950/30')}><Handshake className="w-4 h-4" /> {w.offer_reviews} offer review{w.offer_reviews === 1 ? '' : 's'}</Link>}
          {w.licenses != null && <Link to="/Reports" className={cn('rounded-full border px-3 py-1.5 text-sm flex items-center gap-1.5', w.licenses && 'border-red-300 bg-red-50 dark:bg-red-950/30')}><BadgeAlert className="w-4 h-4" /> {w.licenses} license/E&O expiring in 30 days</Link>}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border bg-card">
          <p className="px-4 pt-4 pb-2 font-semibold flex items-center gap-2"><FileWarning className="w-4 h-4" /> Your to-dos {data.todo_count > data.todo.length && <span className="text-xs text-muted-foreground font-normal">({data.todo_count})</span>}</p>
          {!data.todo.length ? <p className="px-4 pb-4 text-sm text-muted-foreground">Nothing assigned to you. 🎉</p> : (
            <ul className="divide-y">
              {data.todo.map((t) => (
                <li key={`${t.checklist_id}:${t.item_id}`}><Link to={t.link} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                  {t.needs_document ? <Upload className={cn('w-4 h-4 flex-shrink-0', t.status === 'rejected' ? 'text-red-600' : 'text-muted-foreground')} /> : <CheckSquare className="w-4 h-4 flex-shrink-0 text-muted-foreground" />}
                  <span className="flex-1 min-w-0"><span className="block text-sm truncate">{t.title}</span><span className="block text-xs text-muted-foreground truncate">{t.where}</span></span>
                  {t.status === 'rejected' && <span className="text-[11px] rounded bg-red-100 text-red-700 px-1.5 py-0.5">sent back</span>}
                  {t.due && <span className={cn('text-xs', t.due < new Date().toISOString().slice(0, 10) ? 'text-red-600 font-semibold' : 'text-muted-foreground')}>{day(t.due)}</span>}
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link></li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border bg-card">
          <p className="px-4 pt-4 pb-2 font-semibold flex items-center gap-2"><CalendarClock className="w-4 h-4" /> Coming up</p>
          {!data.deadlines.length ? <p className="px-4 pb-4 text-sm text-muted-foreground">No deadlines in the next two weeks.</p> : (
            <ul className="divide-y">
              {data.deadlines.map((d) => (
                <li key={`${d.transaction_id}:${d.label}`}><Link to={`/Transactions/${d.transaction_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
                  <span className={cn('w-20 text-xs font-semibold', d.overdue ? 'text-red-600' : 'text-muted-foreground')}>{d.overdue ? 'Overdue' : day(d.date)}</span>
                  <span className="flex-1 min-w-0"><span className="block text-sm">{d.label}</span><span className="block text-xs text-muted-foreground truncate">{d.property}</span></span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </Link></li>
              ))}
            </ul>
          )}
          {data.offers.length > 0 && (
            <div className="border-t px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1"><Handshake className="w-3.5 h-3.5" /> Offers in play</p>
              {data.offers.slice(0, 4).map((o) => <Link key={o.id} to={`/Offers?open=${o.id}`} className="flex justify-between text-sm py-1 hover:underline"><span className="truncate">{o.property}</span><span className="text-xs text-muted-foreground ml-2 capitalize">{o.review === 'requested' ? 'broker review' : o.status.replace('_', ' ')}</span></Link>)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
