import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { MessageSquarePlus, Loader2 } from 'lucide-react';
import { Section, Empty } from './ui';
import { useLiveTable } from '@/hooks/useLiveTable';
import MentionInput, { CommentText } from './MentionInput';

export const describe = (e) => {
  const what = { transaction: 'transaction', checklist: 'checklist', esign_document: 'e-sign document', esign_submission: 'signing request', payout: 'payout',
    commission_record: 'commission', transaction_contact: 'contact', offer: 'offer', session: '', comment: '' }[e.table_name] ?? e.table_name.replace(/_/g, ' ');
  if (e.op === 'comment') return 'commented';
  if (e.table_name === 'session') return e.op.replace(/_/g, ' ');
  const verb = { insert: 'created', update: 'updated', delete: 'deleted' }[e.op] || e.op;
  const fields = (e.changed || []).filter((f) => !['extra', 'items'].includes(f));
  return `${verb} ${what}${e.summary && e.table_name !== 'transaction' ? ` "${e.summary}"` : ''}${verb === 'updated' && fields.length ? ` (${fields.slice(0, 5).join(', ').replace(/_/g, ' ')})` : ''}`;
};

export default function WorkspaceActivity({ tx }) {
  const queryClient = useQueryClient();
  const key = ['tx-activity', tx.id];
  const { data: events = [], isLoading } = useQuery({ queryKey: key, queryFn: () => base44.entities.ActivityEvent.filter({ transaction_id: tx.id }, '-created_date', 500) });
  useLiveTable('ActivityEvent', (e) => e.data?.transaction_id === tx.id && queryClient.invalidateQueries({ queryKey: key }));
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);
  const { data: people = [] } = useQuery({ queryKey: ['mentionable-tx', tx.id], staleTime: 300000,
    queryFn: async () => (await base44.functions.invoke('trackEvent', { event: 'mentionable', transaction_id: tx.id })).data.people });
  const nameOf = useMemo(() => Object.fromEntries(people.map((p) => [p.email, p.name])), [people]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const e of events) { const k = e.op === 'comment' ? 'Comments' : `${e.table_name.replace(/_/g, ' ')} ${e.op}`; m.set(k, (m.get(k) || 0) + 1); }
    return [...m];
  }, [events]);
  const shown = filter === 'all' ? events : events.filter((e) => (e.op === 'comment' ? 'Comments' : `${e.table_name.replace(/_/g, ' ')} ${e.op}`) === filter);

  const post = async (text, mentions) => {
    setBusy(true);
    try { await base44.functions.invoke('trackEvent', { event: 'comment', transaction_id: tx.id, summary: text, mentions }); queryClient.invalidateQueries({ queryKey: key }); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };

  return (
    <div className="max-w-6xl">
      <Section title="Transaction activity">
        <div className="grid lg:grid-cols-4 gap-6">
          <ul className="rounded-xl bg-emerald-600 text-white p-2 h-fit">
            {[['all', events.length], ...groups].map(([k, n]) => (
              <li key={k}><button onClick={() => setFilter(k)} className={`w-full flex justify-between px-3 py-2 rounded text-sm capitalize ${filter === k ? 'bg-white text-emerald-800' : 'hover:bg-white/10'}`}><span>{k === 'all' ? 'All events' : k}</span><span>{n}</span></button></li>
            ))}
          </ul>
          <div className="lg:col-span-3 space-y-3">
            <MentionInput people={people} busy={busy} onPost={post} placeholder="Add a comment… type @ to notify someone" />
            {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !shown.length ? <Empty>No activity yet.</Empty> : (
              <ul className="divide-y rounded-xl border bg-card">
                {shown.map((e) => (
                  <li key={e.id} className="px-4 py-3 text-sm flex gap-4">
                    <div className="flex-1">
                      <span className="font-medium text-emerald-700 dark:text-emerald-400">{e.actor_email}</span> {describe(e)}
                      {e.op === 'comment' && <div className="mt-1 rounded bg-muted/50 px-3 py-2"><CommentText text={e.summary} mentions={(e.changed || []).map((m) => ({ email: m, name: nameOf[m] })).filter((m) => m.name)} /></div>}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date(e.created_date).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}
