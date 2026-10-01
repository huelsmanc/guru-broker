import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Sparkles, Send, Loader2, X, CalendarClock, CheckCircle2, ListChecks, Mail, MessageSquare, Copy, Check } from 'lucide-react';
import { changeField, setDeadlineDone, addTask, postUpdate } from '@/lib/dealActions';

const SUGGESTIONS = [
  'What needs to happen this week?',
  'When is the mortgage commitment due?',
  'Draft an email to the lender asking for the commitment status',
  'Summarize this deal for the seller',
];

const storeKey = (id) => `gbh-copilot:${id}`;
const load = (id) => { try { return JSON.parse(localStorage.getItem(storeKey(id)) || '[]'); } catch { return []; } };
const save = (id, msgs) => { try { localStorage.setItem(storeKey(id), JSON.stringify(msgs.slice(-30))); } catch { /* private mode */ } };

/** The AI assistant for one deal: a floating button that opens a chat panel. */
export default function DealCopilot({ tx, user, refresh, canEdit, open, onOpenChange }) {
  const [msgs, setMsgs] = useState(() => load(tx.id));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => { save(tx.id, msgs); end.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, tx.id]);

  const ask = async (q) => {
    const content = String(q ?? text).trim();
    if (!content || busy) return;
    setText('');
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next);
    setBusy(true);
    try {
      const res = await base44.functions.invoke('dealAssistant', { mode: 'chat', transactionId: tx.id, messages: next.map(({ role, content: c }) => ({ role, content: c })) });
      setMsgs((m) => [...m, { role: 'assistant', content: res.data.reply, actions: res.data.actions || [] }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: 'assistant', content: `Sorry, that didn't work: ${err.message}`, actions: [] }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      {!open && (
        <button type="button" onClick={() => onOpenChange(true)}
          className="fixed z-40 bottom-24 lg:bottom-6 right-4 lg:right-24 rounded-full shadow-lg bg-gradient-to-r from-violet-600 to-indigo-600 text-white pl-3 pr-4 py-2.5 flex items-center gap-2 text-sm font-semibold hover:opacity-95">
          <Sparkles className="w-4 h-4" /> Ask AI
        </button>
      )}
      {open && (
        <div className="fixed z-50 inset-0 lg:inset-auto lg:right-4 lg:bottom-4 lg:top-20 lg:w-[420px] bg-background lg:rounded-2xl lg:border shadow-2xl flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3 border-b">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center"><Sparkles className="w-4 h-4" /></div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Deal assistant</p>
              <p className="text-[11px] text-muted-foreground truncate">{tx.property_address}</p>
            </div>
            {msgs.length > 0 && <button type="button" className="text-xs text-muted-foreground hover:underline" onClick={() => setMsgs([])}>Clear</button>}
            <button type="button" onClick={() => onOpenChange(false)} className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 overscroll-contain">
            {!msgs.length && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">Ask anything about this deal. I can also draft emails and texts, add tasks and update dates; nothing changes until you tap it.</p>
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => ask(s)} className="block w-full text-left text-sm rounded-lg border px-3 py-2 hover:border-primary hover:bg-primary/5">{s}</button>
                ))}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : ''}>
                <div className={`max-w-[92%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>{m.content}</div>
                {m.actions?.length > 0 && (
                  <div className="mt-2 space-y-2">
                    {m.actions.map((a, k) => <ActionCard key={k} a={a} tx={tx} user={user} refresh={refresh} canEdit={canEdit} />)}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Thinking…</div>}
            <div ref={end} />
          </div>
          <form className="p-3 border-t flex gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this deal…"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }}
              className="flex-1 resize-none rounded-xl border bg-background px-3 py-2 text-sm max-h-32 focus:outline-none focus:ring-2 focus:ring-primary/40" />
            <Button type="submit" size="icon" disabled={busy || !text.trim()} className="rounded-xl h-10 w-10"><Send className="w-4 h-4" /></Button>
          </form>
        </div>
      )}
    </>
  );
}

function ActionCard({ a, tx, user, refresh, canEdit }) {
  const [state, setState] = useState(null); // 'busy' | 'done' | error text
  const [draft, setDraft] = useState(a.body || '');
  const [copied, setCopied] = useState(false);
  const run = async (fn) => {
    setState('busy');
    try { await fn(); setState('done'); refresh(); } catch (err) { setState(err.message); }
  };
  const doneMark = state === 'done' && <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Done</span>;

  if (a.type === 'draft_email' || a.type === 'draft_text') {
    const isEmail = a.type === 'draft_email';
    const href = isEmail
      ? `mailto:${encodeURIComponent(a.to || '')}?subject=${encodeURIComponent(a.subject || '')}&body=${encodeURIComponent(draft)}`
      : `sms:${String(a.to || '').replace(/[^\d+]/g, '')}${/iPhone|iPad/.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(draft)}`;
    return (
      <div className="rounded-xl border bg-card p-3 space-y-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">{isEmail ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />} {a.label}</p>
        {(a.to || a.to_name) && <p className="text-xs text-muted-foreground">To: {a.to_name || ''} {a.to ? `<${a.to}>` : ''}</p>}
        {isEmail && a.subject && <p className="text-xs"><span className="text-muted-foreground">Subject:</span> {a.subject}</p>}
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={Math.min(10, Math.max(3, draft.split('\n').length + 1))} className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm" />
        <div className="flex gap-2">
          <a href={href} className="inline-flex"><Button size="sm" className="gap-1.5">{isEmail ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />} {isEmail ? 'Open in email' : 'Open in messages'}</Button></a>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { navigator.clipboard?.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} Copy</Button>
        </div>
      </div>
    );
  }

  const icon = a.type === 'add_task' ? <ListChecks className="w-3.5 h-3.5" /> : a.type === 'mark_done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <CalendarClock className="w-3.5 h-3.5" />;
  const apply = () => run(async () => {
    if (a.type === 'update_date') await changeField(tx, user, a.field, a.date, 'via the deal assistant');
    else if (a.type === 'mark_done') await setDeadlineDone(tx, a.field, true);
    else if (a.type === 'add_task') await addTask(tx, { title: a.title, due_date: a.due_date });
    else if (a.type === 'log_update') await postUpdate(tx, user, a.body);
  });
  return (
    <div className="rounded-xl border bg-card px-3 py-2 flex items-center gap-2">
      <span className="text-violet-600">{icon}</span>
      <span className="text-sm flex-1 min-w-0">{a.label}{a.type === 'log_update' && a.body ? <span className="block text-xs text-muted-foreground line-clamp-2">{a.body}</span> : null}</span>
      {state === 'done' ? doneMark : (
        <Button size="sm" variant="outline" disabled={!canEdit || state === 'busy'} onClick={apply} title={canEdit ? '' : 'You can view this deal but not change it'}>
          {state === 'busy' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Apply'}
        </Button>
      )}
      {state && !['busy', 'done'].includes(state) && <span className="text-xs text-destructive">{state}</span>}
    </div>
  );
}
