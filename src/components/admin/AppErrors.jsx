// Platform owner's list of problems in the app, newest first, grouped and counted.
import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, CheckCircle2, AlertTriangle, Monitor, Server } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const call = async (body) => { const r = await base44.functions.invoke('appErrors', body); if (r.data?.error) throw new Error(r.data.error); return r.data; };
const when = (iso) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function AppErrors() {
  const [show, setShow] = useState('open');
  const [open, setOpen] = useState(null);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['app-errors', show], queryFn: () => call({ action: 'list', show }), refetchInterval: 60000 });
  const list = data?.errors || [];
  const resolve = async (id) => { await call({ action: 'resolve', id }); refetch(); };
  const resolveAll = async () => { if (window.confirm('Mark every open error as fixed? Any that happen again will reopen and email you.')) { await call({ action: 'resolve_all' }); refetch(); } };

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  if (error) {
    const missing = /app_error|does not exist|schema cache/i.test(error.message);
    return <p className={cn('text-sm', missing ? 'text-amber-700' : 'text-red-600')}>{missing ? 'Error tracking needs its database table: run migration 0014_app_errors.sql in Supabase.' : error.message}</p>;
  }
  const openCount = list.filter((e) => !e.resolved).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg bg-muted p-1 text-sm">
          {[['open', 'Open'], ['all', 'All, including fixed']].map(([k, l]) => <button key={k} onClick={() => setShow(k)} className={cn('rounded-md px-3 py-1', show === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground')}>{l}</button>)}
        </div>
        <p className="text-sm text-muted-foreground flex-1">You're emailed once about each new error. Repeats are counted here.</p>
        {openCount > 0 && <Button size="sm" variant="outline" onClick={resolveAll}>Mark all fixed</Button>}
      </div>
      {!list.length ? (
        <div className="rounded-2xl border bg-card p-10 text-center"><CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" /><p className="font-medium">No errors{show === 'open' ? ' right now' : ''}</p><p className="text-sm text-muted-foreground">Problems on the server or in people's browsers show up here.</p></div>
      ) : (
        <div className="rounded-2xl border bg-card divide-y">
          {list.map((e) => (
            <div key={e.id} className={cn('p-4', e.resolved && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', e.resolved ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600')}>{e.source === 'browser' ? <Monitor className="w-4 h-4" /> : <Server className="w-4 h-4" />}</span>
                <button className="flex-1 min-w-0 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
                  <p className="text-sm font-medium break-words">{e.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{e.source === 'browser' ? 'In the app on' : 'Server function'} <b>{e.location || '?'}</b> · {e.count}× · {(e.users || []).length} {(e.users || []).length === 1 ? 'person' : 'people'} · last {when(e.last_seen)}{e.count > 1 ? `, first ${when(e.first_seen)}` : ''}</p>
                </button>
                {e.resolved ? <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Fixed</span>
                  : <Button size="sm" variant="ghost" className="text-xs" onClick={() => resolve(e.id)}>Mark fixed</Button>}
              </div>
              {open === e.id && (
                <div className="mt-3 ml-11 space-y-2 text-xs">
                  {(e.users || []).length > 0 && <p><span className="text-muted-foreground">Who:</span> {e.users.join(', ')}</p>}
                  {e.last_url && <p className="break-all"><span className="text-muted-foreground">Page:</span> {e.last_url}</p>}
                  {e.last_user_agent && <p className="break-words"><span className="text-muted-foreground">Browser:</span> {e.last_user_agent}</p>}
                  {e.detail && <pre className="whitespace-pre-wrap break-words bg-muted rounded-lg p-3 max-h-72 overflow-auto">{e.detail}</pre>}
                  <p className="text-muted-foreground flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Sending me a screenshot of this is the fastest way to get it fixed.</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
