import React, { useEffect, useMemo, useRef, useState } from 'react';
import SignedDownload, { isSignedLink } from '@/components/esign/SignedDownload';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Upload, Loader2, FileText, CheckSquare, Square, Send, Check, X, MessageSquare, Library, PenTool, Trash2, Download } from 'lucide-react';
import { can, isAdminRole } from '../../../shared/permissions.generated.js';
import { Section, Empty, Pill } from './ui';
import UnifiedESignCreator from '@/components/esign/UnifiedESignCreator';
import { useLiveTable } from '@/hooks/useLiveTable';
import MentionInput, { CommentText } from './MentionInput';

// Plain words for item statuses.
const WORD = { open: 'To do', uploaded: 'Uploaded', review_requested: 'In review', approved: 'Approved', rejected: 'Needs changes', exempt: 'Not needed', done: 'Done' };

async function act(body) {
  return (await base44.functions.invoke('checklistAction', body)).data;
}

// Checklists on a deal (or an agent's onboarding when subjectType = 'onboarding').
export default function WorkspaceChecklists({ tx, user, subjectType = 'transaction', subjectEmail, subjectUserId, title = 'Checklists' }) {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const subjectId = subjectType === 'transaction' ? tx.id : subjectEmail;
  const key = ['checklists', subjectType, subjectId];
  const { data: lists = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => base44.entities.Checklist.filter({ subject_type: subjectType, subject_id: subjectId }, 'created_date', 50),
  });
  useLiveTable('Checklist', (e) => e.data?.subject_id === subjectId && queryClient.invalidateQueries({ queryKey: key }));
  const [adding, setAdding] = useState(false);
  const activeId = params.get('checklist') || lists[0]?.id;
  const active = lists.find((l) => l.id === activeId) || lists[0];
  const [selectedItem, setSelectedItem] = useState(params.get('item'));
  const item = active?.items?.find((i) => i.id === selectedItem) || null;
  // Phones and tablets: the item's panel opens right under the item (beside the list on wide screens).
  const wide = useWide();
  const admin = isAdminRole(user?.role);
  const approver = admin || can(user, 'docs.approve');
  const manage = admin || can(user, 'tx.checklist_manage') || String(tx?.tc_email || '').toLowerCase() === user?.email?.toLowerCase();

  // Uploads are private to the deal (or to the person, for onboarding).
  const fileScope = subjectType === 'transaction' ? { kind: 'tx', id: tx.id } : { kind: 'user', id: subjectUserId || user?.id };
  const refresh = () => queryClient.invalidateQueries({ queryKey: key });
  const run = async (body) => {
    try { await act({ checklist_id: active.id, ...body }); refresh(); } catch (err) { window.alert(err.message); }
  };
  const panel = item ? <ItemPanel key={item.id} checklistId={active.id} fileScope={fileScope} item={item} tx={tx} user={user} approver={approver} admin={admin} manage={manage} run={run} /> : null;

  return (
    <div className="max-w-6xl">
      <Section title={active ? active.name : title}
        subtitle={active ? `${active.items.filter((i) => ['approved', 'exempt', 'done'].includes(i.status)).length} of ${active.items.length} complete` : null}
        actions={<>
          {lists.length > 1 && (
            <select className="rounded-md border border-input bg-background px-3 py-2 text-sm" value={active?.id} onChange={(e) => { setParams((p) => { p.set('checklist', e.target.value); return p; }); setSelectedItem(null); }}>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          )}
          <Button variant="outline" className="gap-1.5" onClick={() => setAdding(true)}><Plus className="w-4 h-4" /> Add checklist</Button>
          {active && manage && <Button variant="ghost" size="icon" title="Remove checklist" onClick={() => window.confirm(`Remove "${active.name}" from this ${subjectType === 'transaction' ? 'deal' : 'agent'}?`) && run({ action: 'remove' })}><Trash2 className="w-4 h-4" /></Button>}
        </>}>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : !active ? (
          <Empty>No checklist yet. Add one from your templates (Buyer, Listing, Rental, Dual agent, Referral…).</Empty>
        ) : (
          <div className="grid lg:grid-cols-5 gap-6">
            <ol className="lg:col-span-3 divide-y rounded-xl border bg-card">
              {active.items.map((it) => {
                const done = ['approved', 'exempt', 'done'].includes(it.status);
                return (
                  <li key={it.id}>
                    <button onClick={() => setSelectedItem(!wide && selectedItem === it.id ? null : it.id)} aria-expanded={selectedItem === it.id} className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 ${selectedItem === it.id ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}`}>
                      {it.requires_document ? <FileText className={`w-4 h-4 flex-shrink-0 ${done ? 'text-green-600' : 'text-muted-foreground'}`} />
                        : done ? <CheckSquare className="w-4 h-4 text-green-600 flex-shrink-0" /> : <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                      <span className={`flex-1 text-sm ${done ? 'text-muted-foreground' : ''}`}>{it.title}{it.required === false ? <span className="text-xs text-muted-foreground"> (optional)</span> : ''}</span>
                      {it.due_date && <span className="text-xs text-muted-foreground hidden sm:inline">{new Date(`${it.due_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                      {it.status !== 'open' ? <Pill status={it.status}>{WORD[it.status]}</Pill> : it.requires_document ? (it.form_url
                        ? <span className="text-xs text-emerald-700 flex items-center gap-1"><Library className="w-3 h-3" /> Use form</span>
                        : <span className="text-xs text-emerald-700 flex items-center gap-1"><Upload className="w-3 h-3" /> Upload</span>) : null}
                    </button>
                    {!wide && selectedItem === it.id && <div className="px-3 pb-3 bg-emerald-50/50 dark:bg-emerald-950/20">{panel}</div>}
                  </li>
                );
              })}
              {manage && <AddItem onAdd={(b) => run({ action: 'add_item', ...b })} />}
            </ol>
            {wide && (
              <div className="lg:col-span-2">
                {panel || <Empty>Select an item to upload, submit, approve or comment.</Empty>}
              </div>
            )}
          </div>
        )}
      </Section>
      {adding && <AddChecklists subjectType={subjectType} subjectId={subjectId} subjectEmail={subjectEmail} dealType={tx?.deal_type || tx?.transaction_type}
        onClose={() => setAdding(false)} onAdded={(id) => { setAdding(false); refresh(); if (id) setParams((p) => { p.set('checklist', id); return p; }); }} />}
    </div>
  );
}

function useWide() {
  const q = '(min-width: 1024px)';
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const on = () => setWide(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);
  return wide;
}

function AddItem({ onAdd }) {
  const [title, setTitle] = useState('');
  const [doc, setDoc] = useState(true);
  return (
    <li className="flex gap-2 p-3">
      <Input placeholder="Add an item" value={title} onChange={(e) => setTitle(e.target.value)} className="h-8 text-sm" />
      <label className="flex items-center gap-1 text-xs whitespace-nowrap"><input type="checkbox" checked={doc} onChange={(e) => setDoc(e.target.checked)} /> Needs document</label>
      <Button size="sm" disabled={!title.trim()} onClick={() => { onAdd({ title, requires_document: doc }); setTitle(''); }}>Add</Button>
    </li>
  );
}

function ItemPanel({ checklistId, fileScope, item, tx, user, approver, admin, manage, run }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(null);
  const [picking, setPicking] = useState(false);
  const [signing, setSigning] = useState(null); // document url being sent for signature
  const { data: people = [] } = useQuery({
    queryKey: ['mentionable', checklistId],
    queryFn: async () => (await act({ action: 'mentionable', checklist_id: checklistId })).people,
    staleTime: 5 * 60 * 1000,
  });
  const go = async (name, body) => { setBusy(name); await run(body); setBusy(null); };
  // Names, not email addresses (people from the deal's team, plus you).
  const myEmail = String(user?.email || '').toLowerCase();
  const everyone = [{ email: myEmail, name: user?.display_name || user?.full_name || myEmail }, ...people.filter((p) => p.email !== myEmail)];
  const nameOf = (email) => {
    const e = String(email || '').toLowerCase();
    if (!e) return 'Nobody yet';
    const p = everyone.find((x) => x.email === e);
    return e === myEmail ? `${p?.name || 'You'} (you)` : p?.name || e;
  };

  const upload = async (file) => {
    if (!file) return;
    setBusy('upload');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: fileScope });
      await run({ action: 'attach', item_id: item.id, url: file_url, name: file.name });
    } finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div className="rounded-xl border bg-card p-3 sm:p-4 space-y-4 lg:sticky lg:top-4">
      <div>
        <div className="flex items-start gap-2">
          <p className="font-semibold flex items-center gap-2 flex-1 min-w-0"><FileText className="w-4 h-4 flex-shrink-0" /> <span className="break-words">{item.title}</span></p>
          <Pill status={item.status}>{WORD[item.status]}</Pill>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Assigned to {nameOf(item.assignee_email)}{item.due_date ? ` · Due ${new Date(`${item.due_date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
        </p>
      </div>
      <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 [&>*]:justify-center sm:[&>*]:justify-start">
        {item.requires_document && (
          <>
            {/* A label wrapping the file picker opens it reliably on iPhone (no scripted click). */}
            <label className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-md border bg-background text-sm font-medium cursor-pointer hover:bg-muted active:bg-muted ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
              {busy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
              <input ref={fileRef} type="file" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setPicking(true)}><Library className="w-3.5 h-3.5" /> Use forms</Button>
            {item.document_url && <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setSigning(item.document_url)}><PenTool className="w-3.5 h-3.5" /> eSign</Button>}
            {item.document_url && (isSignedLink(item.document_url)
              ? <SignedDownload url={item.document_url} className="h-9 px-3 text-sm" />
              : <a href={item.document_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Download className="w-3.5 h-3.5" /> Download</Button></a>)}
            {['uploaded', 'rejected'].includes(item.status) && (
              <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => go('submit', { action: 'submit', item_id: item.id })}><Send className="w-3.5 h-3.5" /> Submit for review</Button>
            )}
          </>
        )}
        {!item.requires_document && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => go('complete', { action: 'complete', item_id: item.id, done: item.status !== 'done' })}>
            {item.status === 'done' ? <Square className="w-3.5 h-3.5" /> : <CheckSquare className="w-3.5 h-3.5" />} {item.status === 'done' ? 'Reopen' : 'Complete task'}
          </Button>
        )}
        {approver && item.status === 'review_requested' && (
          <>
            <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700" onClick={() => go('approve', { action: 'approve', item_id: item.id })}><Check className="w-3.5 h-3.5" /> Approve</Button>
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600" onClick={() => { const note = window.prompt('What needs to change?'); if (note !== null) go('reject', { action: 'reject', item_id: item.id, note }); }}><X className="w-3.5 h-3.5" /> Reject</Button>
          </>
        )}
      </div>
      {admin && !['exempt', 'approved'].includes(item.status) && (
        <button className="text-xs text-muted-foreground underline -mt-2" onClick={() => { const note = window.prompt('Reason for marking this not needed (optional)', ''); if (note !== null) go('exempt', { action: 'exempt', item_id: item.id, note }); }}>Not needed for this deal? Mark exempt</button>
      )}
      {item.form_url && !item.document_url && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 dark:bg-emerald-950/20 p-3">
          <p className="text-xs text-muted-foreground">Form for this item</p>
          <p className="text-sm font-medium mb-2">{item.form_name || 'Form'}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5" onClick={() => setSigning(item.form_url)}><PenTool className="w-3.5 h-3.5" /> Fill &amp; eSign</Button>
            <a href={item.form_url} target="_blank" rel="noreferrer"><Button size="sm" variant="outline" className="gap-1.5"><Download className="w-3.5 h-3.5" /> Download blank</Button></a>
            <Button size="sm" variant="ghost" onClick={() => run({ action: 'attach', item_id: item.id, url: item.form_url, name: item.form_name || item.title })}>Use as-is</Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">When everyone signs, the signed copy is attached here automatically.</p>
        </div>
      )}
      {item.document_url && (
        <div className="rounded-lg border overflow-hidden bg-muted/30">
          {/\.(png|jpe?g|webp|gif)(\?|$)/i.test(item.document_url)
            ? <img src={item.document_url} alt="" className="w-full" />
            : <iframe title={item.document_name} src={item.document_url} className="w-full h-72" />}
          <p className="text-xs px-3 py-2 text-muted-foreground truncate">{item.document_name} · uploaded by {nameOf(item.uploaded_by)}</p>
        </div>
      )}
      {manage && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-xs text-muted-foreground min-w-0 block">Due date
            <input type="date" className="mt-1 block w-full min-w-0 h-10 rounded-md border bg-background px-3 text-base sm:text-sm text-foreground appearance-none" defaultValue={item.due_date || ''}
              onChange={(e) => e.target.value !== (item.due_date || '') && run({ action: 'update_item', item_id: item.id, patch: { due_date: e.target.value || null } })} />
          </label>
          <label className="text-xs text-muted-foreground min-w-0 block">Assigned to
            <select className="mt-1 block w-full min-w-0 h-10 rounded-md border bg-background px-2 text-base sm:text-sm text-foreground" value={String(item.assignee_email || '').toLowerCase()}
              onChange={(e) => run({ action: 'update_item', item_id: item.id, patch: { assignee_email: e.target.value || null } })}>
              <option value="">Nobody yet</option>
              {everyone.map((p) => <option key={p.email} value={p.email}>{p.email === myEmail ? `${p.name} (you)` : p.name}</option>)}
              {item.assignee_email && !everyone.some((p) => p.email === String(item.assignee_email).toLowerCase()) && <option value={String(item.assignee_email).toLowerCase()}>{item.assignee_email}</option>}
            </select>
          </label>
        </div>
      )}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Comments ({item.comments?.length || 0})</p>
        <div className="space-y-2 max-h-56 overflow-y-auto">
          {(item.comments || []).map((c, i) => (
            <div key={i} className="text-sm rounded-md bg-muted/50 px-3 py-2">
              <p className="text-xs text-muted-foreground">{c.by_name || c.by} · {new Date(c.at).toLocaleString()}</p>
              <CommentText text={c.text} mentions={c.mentions} />
            </div>
          ))}
        </div>
        <div className="mt-2">
          <MentionInput people={people} busy={busy === 'comment'} onPost={(text, mentions) => go('comment', { action: 'comment', item_id: item.id, text, mentions })} />
        </div>
        {(item.history || []).length > 0 && (
          <details className="mt-3 text-xs text-muted-foreground"><summary className="cursor-pointer">History</summary>
            <ul className="mt-1 space-y-0.5">{item.history.map((h, i) => <li key={i}>{new Date(h.at).toLocaleString()} · {h.by} {h.what}</li>)}</ul>
          </details>
        )}
      </div>
      {picking && <LibraryPicker brokerageId={tx?.brokerage_id || user?.brokerage_id} onClose={() => setPicking(false)}
        onPick={(f) => { setPicking(false); run({ action: 'attach', item_id: item.id, url: f.file_url, name: f.file_name }); }} />}
      {signing && (
        <Dialog open onOpenChange={(o) => !o && setSigning(null)}>
          <DialogContent className="w-[96vw] max-w-6xl max-h-[94dvh] overflow-y-auto">
            <DialogHeader><DialogTitle>Send "{item.title}" for signature</DialogTitle></DialogHeader>
            <UnifiedESignCreator user={user} brokerageId={tx?.brokerage_id || user?.brokerage_id} transactionId={tx?.id}
              initialTitle={`${item.title}${tx?.property_address ? ` - ${tx.property_address}` : ''}`} initialDocumentUrl={signing}
              checklistLink={tx ? { checklist_id: checklistId, item_id: item.id } : undefined}
              onCancel={() => setSigning(null)} onComplete={() => setSigning(null)} />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function LibraryPicker({ brokerageId, onPick, onClose }) {
  const [q, setQ] = useState('');
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['library', brokerageId],
    queryFn: () => base44.entities.FileRepository.filter({ brokerage_id: brokerageId }, 'file_name', 500),
  });
  const shown = files.filter((f) => !q || `${f.file_name} ${f.category} ${(f.tags || []).join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Use a form from the library</DialogTitle></DialogHeader>
        <Input placeholder="Search forms" value={q} onChange={(e) => setQ(e.target.value)} />
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <ul className="divide-y">
            {shown.map((f) => (
              <li key={f.id}><button className="w-full text-left px-2 py-2 text-sm hover:bg-muted rounded" onClick={() => onPick(f)}>{f.file_name}<span className="text-xs text-muted-foreground"> · {f.category}</span></button></li>
            ))}
            {!shown.length && <li className="text-sm text-muted-foreground p-2">No forms found. Upload forms in the File Repository.</li>}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddChecklists({ subjectType, subjectId, subjectEmail, dealType, onClose, onAdded }) {
  const [templates, setTemplates] = useState(null);
  const [picked, setPicked] = useState([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    act({ action: 'templates' }).then((r) => {
      const t = r.templates.filter((x) => (subjectType === 'onboarding' ? x.kind === 'onboarding' : x.kind !== 'onboarding'));
      setTemplates(t);
      const match = t.find((x) => x.deal_type === dealType);
      if (match) setPicked([match.id]);
    }).catch((e) => window.alert(e.message));
  }, [subjectType, dealType]);
  const add = async () => {
    setBusy(true);
    let last = null;
    try {
      for (const id of picked) last = (await act({ action: 'apply', subject_type: subjectType, subject_id: subjectId, subject_email: subjectEmail, template_id: id })).checklist;
      onAdded(last?.id);
    } catch (err) { window.alert(err.message); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add checklists</DialogTitle></DialogHeader>
        {!templates ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {templates.map((t) => (
              <label key={t.id} className="flex items-center gap-3 px-2 py-2 rounded hover:bg-muted cursor-pointer">
                <input type="checkbox" checked={picked.includes(t.id)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, t.id] : p.filter((x) => x !== t.id)))} />
                <span className="text-sm">{t.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{t.items?.length} items</span>
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={add} disabled={!picked.length || busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
