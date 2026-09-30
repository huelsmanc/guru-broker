import React, { useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Radio } from 'lucide-react';
import { useLiveTable } from '@/hooks/useLiveTable';
import { can, isAdminRole } from '../../shared/permissions.generated.js';
import { Empty } from '@/components/workspace/ui';
import { describe } from '@/components/workspace/WorkspaceActivity';

const sel = 'rounded-md border border-input bg-background px-3 py-2 text-sm';
const OP_COLOR = { insert: 'bg-emerald-500', update: 'bg-sky-500', delete: 'bg-red-500', comment: 'bg-amber-500' };

function when(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(d).toLocaleString();
}

export default function Activity() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [limit, setLimit] = useState(300);
  const [who, setWho] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const key = ['activity', brokerageId, limit, who];
  const { data: events = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.ActivityEvent.filter({ brokerage_id: brokerageId, ...(who ? { actor_email: who } : {}) }, '-created_date', limit),
    enabled: !!brokerageId,
  });
  const { data: people = [] } = useQuery({ queryKey: ['brokerage-users', brokerageId], queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000), enabled: !!brokerageId });
  useLiveTable('ActivityEvent', (e) => {
    if (e.type !== 'create' || !e.data) return;
    if (who && e.data.actor_email !== who) return;
    queryClient.setQueryData(key, (old = []) => (old.some((x) => x.id === e.data?.id) ? old : [e.data, ...old]));
  });

  const names = useMemo(() => Object.fromEntries(people.map((p) => [p.email, p.full_name || p.email])), [people]);
  const types = useMemo(() => [...new Set(events.map((e) => e.table_name))].sort(), [events]);
  const shown = events.filter((e) => e && (!type || e.table_name === type) && (!q || `${e.summary} ${e.actor_email} ${(e.changed || []).join(' ')}`.toLowerCase().includes(q.toLowerCase())));

  if (!isAdminRole(user?.role) && !can(user, 'activity.account')) return <div className="p-8 text-sm">Admins only.</div>;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1"><h1 className="text-2xl font-bold">Activity</h1><span className="flex items-center gap-1 text-xs text-emerald-700"><Radio className="w-3.5 h-3.5 animate-pulse" /> live</span></div>
      <p className="text-sm text-muted-foreground mb-6">Everything people do in the platform: deals, offers, e-signs, checklists, commissions, payouts, settings and sign-ins.</p>
      <div className="flex flex-wrap gap-2 mb-4">
        <select className={sel} value={who} onChange={(e) => setWho(e.target.value)}><option value="">Everyone</option>{people.map((p) => <option key={p.id} value={p.email}>{p.full_name || p.email}</option>)}</select>
        <select className={sel} value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{types.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}</select>
        <Input placeholder="Search" className="max-w-xs" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !shown.length ? <Empty>No activity yet.</Empty> : (
        <ol className="relative border-l ml-2">
          {shown.map((e) => (
            <li key={e.id} className="ml-5 mb-4">
              <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ${OP_COLOR[e.op] || 'bg-violet-500'}`} />
              <p className="text-sm">
                <span className="font-medium">{names[e.actor_email] || e.actor_email || 'System'}</span>{' '}
                {describe(e)}{e.table_name === 'transaction' && e.summary ? <> <span className="font-medium">{e.summary}</span></> : ''}
                {e.op === 'comment' && <span className="block text-muted-foreground">{e.summary}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {when(e.created_date)}
                {e.transaction_id && <> · <Link className="text-primary" to={`/Transactions/${e.transaction_id}?tab=activity`}>open deal</Link></>}
              </p>
            </li>
          ))}
        </ol>
      )}
      {events.length >= limit && <Button variant="outline" onClick={() => setLimit(limit + 500)}>Load more</Button>}
    </div>
  );
}
