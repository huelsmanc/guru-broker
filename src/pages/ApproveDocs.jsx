import React, { useMemo, useState } from 'react';
import { useOutletContext, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, Check, X, ExternalLink, FileText } from 'lucide-react';
import { useLiveTable } from '@/hooks/useLiveTable';
import { can, isAdminRole } from '../../shared/permissions.generated.js';
import { Empty } from '@/components/workspace/ui';

export default function ApproveDocs() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const key = ['approve-docs', brokerageId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!brokerageId,
    queryFn: async () => {
      const lists = await base44.entities.Checklist.filter({ brokerage_id: brokerageId, status: 'review' }, '-updated_date', 500);
      const txIds = [...new Set(lists.filter((l) => l.subject_type === 'transaction').map((l) => l.subject_id))];
      const txs = txIds.length ? await base44.entities.Transaction.filter({ id: { $in: txIds } }, '-created_date', 500) : [];
      return { lists, txs: Object.fromEntries(txs.map((t) => [t.id, t])) };
    },
  });
  useLiveTable('Checklist', () => queryClient.invalidateQueries({ queryKey: key }));
  const [active, setActive] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const queue = useMemo(() => (data?.lists || []).flatMap((cl) => (cl.items || []).filter((i) => i.status === 'review_requested').map((item) => ({ cl, item, tx: data.txs[cl.subject_id] })))
    .sort((a, b) => String(a.item.submitted_at || '').localeCompare(String(b.item.submitted_at || ''))), [data]);
  const cur = queue.find((q) => `${q.cl.id}:${q.item.id}` === active) || queue[0];

  if (!isAdminRole(user?.role) && !can(user, 'docs.approve')) return <div className="p-8 text-sm">You need the "approve documents" permission.</div>;

  const decide = async (action) => {
    if (action === 'reject' && !note.trim()) return window.alert('Say what needs to change so the agent can fix it.');
    setBusy(true);
    try {
      await base44.functions.invoke('checklistAction', { action, checklist_id: cur.cl.id, item_id: cur.item.id, note: note.trim() || undefined });
      setNote(''); setActive(null);
      queryClient.invalidateQueries({ queryKey: key });
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };

  const label = (q) => (q.cl.subject_type === 'transaction' ? q.tx?.property_address || 'Transaction' : `Onboarding: ${q.cl.subject_email}`);
  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">Approve documents</h1>
      <p className="text-sm text-muted-foreground mb-6">{queue.length} waiting, oldest first. Approving or sending back notifies the agent.</p>
      {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !queue.length ? <Empty>All caught up.</Empty> : (
        <div className="grid lg:grid-cols-[340px_1fr] gap-6">
          <ul className="rounded-xl border bg-card divide-y max-h-[75vh] overflow-auto">
            {queue.map((q) => {
              const id = `${q.cl.id}:${q.item.id}`;
              return (
                <li key={id}><button onClick={() => { setActive(id); setNote(''); }} className={`w-full text-left px-4 py-3 text-sm ${cur === q ? 'bg-primary/10' : 'hover:bg-muted/50'}`}>
                  <p className="font-medium">{q.item.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{label(q)}</p>
                  <p className="text-xs text-muted-foreground">{q.item.uploaded_by || q.cl.subject_email}{q.item.submitted_at ? ` · ${new Date(q.item.submitted_at).toLocaleString()}` : ''}</p>
                </button></li>
              );
            })}
          </ul>
          {cur && (
            <div className="rounded-xl border bg-card p-5">
              <div className="flex flex-wrap items-start gap-3 mb-4">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold">{cur.item.title}</h2>
                  <p className="text-sm text-muted-foreground">{cur.cl.name} · {label(cur)}</p>
                </div>
                {cur.tx && <Link to={`/Transactions/${cur.tx.id}?tab=checklists`}><Button variant="outline" size="sm" className="gap-1.5"><ExternalLink className="w-4 h-4" /> Open deal</Button></Link>}
              </div>
              {cur.item.document_url ? (
                <>
                  <a href={cur.item.document_url} target="_blank" rel="noreferrer" className="text-sm text-primary flex items-center gap-1 mb-2"><FileText className="w-4 h-4" />{cur.item.document_name || 'Document'}</a>
                  {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(cur.item.document_url)
                    ? <img src={cur.item.document_url} alt="" className="w-full rounded border" />
                    : <iframe title="document" src={cur.item.document_url} className="w-full h-[60vh] rounded border" />}
                </>
              ) : <p className="text-sm text-muted-foreground">No document attached (task item).</p>}
              {(cur.item.comments || []).length > 0 && (
                <div className="mt-4 space-y-1">{cur.item.comments.map((c, i) => <p key={i} className="text-xs"><span className="font-medium">{c.by_name || c.by}:</span> {c.text}</p>)}</div>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                <Input placeholder="Note to the agent (required to send back)" value={note} onChange={(e) => setNote(e.target.value)} className="flex-1 min-w-[220px]" />
                <Button onClick={() => decide('approve')} disabled={busy} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700"><Check className="w-4 h-4" /> Approve</Button>
                <Button onClick={() => decide('reject')} disabled={busy} variant="outline" className="gap-1.5 text-red-600"><X className="w-4 h-4" /> Send back</Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
