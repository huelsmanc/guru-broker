import React, { useCallback, useEffect, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Loader2, Send, Copy, Mail, Check, FileUp, X, RefreshCw, UserPlus, Power } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useChat } from '@/lib/chat/ChatProvider';
import { Conversation } from '@/pages/DirectMessages';
import { Section, Empty } from './ui';

export const portal = (action, body) => base44.functions.invoke('clientPortal', { action, ...body }).then((r) => r.data);

/** Ask the buyer/seller for a document; they upload it from their portal. */
export function RequestDocButton({ tx, onDone, variant = 'outline' }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      const r = await portal('request', { transaction_id: tx.id, title, note });
      setOpen(false); setTitle(''); setNote('');
      onDone?.(r);
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  return (
    <>
      <Button variant={variant} className="gap-1.5" onClick={() => setOpen(true)}><FileUp className="w-4 h-4" /> Request from client</Button>
      {open && (
        <div className="fixed inset-0 z-[70] bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><p className="font-semibold">Request a document</p><button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-muted" aria-label="Close"><X className="w-4 h-4" /></button></div>
            <p className="text-sm text-muted-foreground">Your clients get an email and upload it from their portal. It lands in Documents under Client uploads.</p>
            <div className="flex flex-wrap gap-1.5">
              {['Pre-approval letter', 'Proof of funds', 'Photo ID', 'Homeowners insurance', 'Signed disclosure', 'HOA documents'].map((s) => (
                <button key={s} type="button" onClick={() => setTitle(s)} className={`rounded-full border px-2.5 py-1 text-xs ${title === s ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}>{s}</button>
              ))}
            </div>
            <Input placeholder="What do you need?" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea placeholder="Note for the client (optional)" value={note} onChange={(e) => setNote(e.target.value)} className="min-h-[80px]" />
            <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={send} disabled={busy || !title.trim()} className="gap-1.5">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send request</Button></div>
          </div>
        </div>
      )}
    </>
  );
}

// The client portal from the deal team's side: who has access, what's been asked for, and the client chat.
export default function WorkspaceClients({ tx, refresh, canEdit }) {
  const chat = useChat();
  const [, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);
  const load = useCallback(() => portal('team', { transaction_id: tx.id }).then(setData).catch((e) => setError(e.message)), [tx.id]);
  useEffect(() => { load(); }, [load, tx.updated_date]);
  useEffect(() => chat?.on('group_chat', ({ row }) => { if (row?.id && row.id === data?.group?.id) setData((d) => ({ ...d, group: { ...d.group, ...row } })); }), [chat, data?.group?.id]);

  const act = async (action, c, extra = {}) => {
    if (action === 'new_link' && !window.confirm(`Make a new link for ${c.name}? The old link and any signed-in devices stop working.`)) return;
    if (action === 'disable' && !window.confirm(`Turn off portal access for ${c.name}?`)) return;
    setBusy(`${action}:${c.id}`);
    try { await portal(action, { transaction_id: tx.id, contact_id: c.id, ...extra }); await load(); } catch (err) { window.alert(err.message); } finally { setBusy(null); }
  };
  const copy = async (c) => { await navigator.clipboard?.writeText(c.link); setCopied(c.id); setTimeout(() => setCopied(null), 1500); };
  const opts = { dates: true, checklist: true, agent: true, ...(tx.share_options || {}) };
  const setOpt = async (k, v) => { await base44.entities.Transaction.update(tx.id, { share_options: { ...opts, [k]: v } }); refresh(); };

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!data) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  const open = data.requests.filter((r) => r.status === 'open');
  const received = data.requests.filter((r) => r.status === 'received');

  return (
    <div className="grid xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-5 max-w-6xl">
      <div className="space-y-5 min-w-0">
        <Section title="Client portal" subtitle="Each buyer or seller gets a private page: progress, key dates, messages with your team, and document uploads.">
          {!data.clients.length ? (
            <Empty>
              No clients with an email on this deal yet.{' '}
              <button className="text-primary underline" onClick={() => setParams({ tab: 'contacts' })}>Add them in Users &amp; contacts</button> and tick “Client”.
            </Empty>
          ) : (
            <ul className="divide-y rounded-xl border bg-card">
              {data.clients.map((c) => (
                <li key={c.id} className="p-3 sm:p-4 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-[180px]">
                    <p className="font-medium text-sm">{c.name} <span className="text-xs text-muted-foreground capitalize">· {c.role}</span></p>
                    <p className="text-xs text-muted-foreground">{c.email}</p>
                    <p className="text-xs mt-0.5">{!c.active ? <span className="text-muted-foreground">Not invited</span>
                      : c.last_seen ? <span className="text-emerald-700">Last on the portal {formatDistanceToNow(new Date(c.last_seen), { addSuffix: true })}</span>
                        : <span className="text-amber-700">Invited, hasn't opened it yet</span>}</p>
                  </div>
                  {canEdit && (!c.active ? (
                    <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => act('invite', c)}>{busy === `invite:${c.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />} Invite</Button>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => copy(c)}>{copied === c.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} {copied === c.id ? 'Copied' : 'Copy link'}</Button>
                      <Button size="sm" variant="outline" className="gap-1" disabled={!!busy} onClick={() => act('invite', c)}>{busy === `invite:${c.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />} Resend</Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" title="New link (old one stops working)" disabled={!!busy} onClick={() => act('new_link', c, { email: true })}><RefreshCw className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" title="Turn off access" disabled={!!busy} onClick={() => act('disable', c)}><Power className="w-3.5 h-3.5" /></Button>
                    </div>
                  ))}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Documents requested" subtitle={`${open.length} waiting · ${received.length} received`} actions={canEdit && data.clients.length > 0 && <RequestDocButton tx={tx} onDone={() => { load(); refresh(); }} />}>
          {!data.requests.length ? <Empty>Nothing requested yet. Ask for a pre-approval, proof of funds, ID and more.</Empty> : (
            <ul className="divide-y rounded-xl border bg-card">
              {data.requests.map((r) => (
                <li key={r.id} className="p-3 flex items-start gap-3">
                  <span className={`mt-0.5 text-[11px] font-semibold rounded-full px-2 py-0.5 ${r.status === 'received' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.status === 'received' ? 'Received' : 'Waiting'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{r.title}</p>
                    {r.note && <p className="text-xs text-muted-foreground">{r.note}</p>}
                    <p className="text-xs text-muted-foreground mt-0.5">{r.status === 'received' ? <>“{r.file_name}” from {r.received_from} · <button className="text-primary underline" onClick={() => setParams({ tab: 'documents' })}>See in Documents</button></> : `Asked by ${r.requested_by_name} ${formatDistanceToNow(new Date(r.at), { addSuffix: true })}`}</p>
                  </div>
                  {canEdit && r.status === 'open' && <Button size="icon" variant="ghost" className="h-8 w-8" title="Cancel request" onClick={async () => { await portal('cancel_request', { transaction_id: tx.id, request_id: r.id }); load(); }}><X className="w-4 h-4" /></Button>}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="What clients can see">
          <div className="rounded-xl border bg-card p-4 space-y-2 text-sm">
            {[['dates', 'Key dates and deadlines'], ['checklist', 'Progress (steps completed)'], ['agent', 'Your phone and email']].map(([k, l]) => (
              <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!opts[k]} disabled={!canEdit} onChange={(e) => setOpt(k, e.target.checked)} /> {l}</label>
            ))}
            <p className="text-xs text-muted-foreground pt-1">Clients never see commission, internal notes, the team deal chat or checklist documents.</p>
          </div>
        </Section>
      </div>

      <div className="min-w-0">
        <div className="rounded-xl border bg-card overflow-hidden flex flex-col h-[70dvh] min-h-[460px] xl:sticky xl:top-4">
          <div className="px-4 py-2 border-b bg-emerald-50 dark:bg-emerald-950/20 text-xs text-emerald-900 dark:text-emerald-200">Client chat: your clients see everything here. Use <b>Deal chat</b> for team-only talk.</div>
          {chat && data.group ? <Conversation key={data.group.id} kind="group" convKey={data.group.id} group={data.group} chat={chat} embedded onBack={() => {}} />
            : <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>}
        </div>
      </div>
    </div>
  );
}
