import React, { useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Upload, Loader2, Sparkles, FolderOpen, CalendarClock, AlertTriangle, CheckCircle2, X, FileText } from 'lucide-react';
import { fileDocument, changeField } from '@/lib/dealActions';

const fmt = (field, v) => {
  if (v == null || v === '') return 'blank';
  if (field === 'sale_price') return `$${Number(v).toLocaleString('en-US')}`;
  const [y, m, d] = String(v).slice(0, 10).split('-');
  return y && m && d ? `${m}/${d}/${y}` : String(v);
};

/**
 * Drop any document on the deal: it's saved to the deal, the AI says what it is, where it
 * files on the checklist, and any dates or price it changes. One tap to file or apply.
 * Also runs on documents already sitting in Unsorted.
 */
export default function DocIntake({ tx, user, refresh, canEdit }) {
  const input = useRef(null);
  const [cards, setCards] = useState([]); // [{ id, name, url, state: 'reading'|'ready'|'error', result, error }]
  const [drag, setDrag] = useState(false);
  const update = (id, patch) => setCards((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const analyze = async (card) => {
    try {
      const res = await base44.functions.invoke('dealAssistant', { mode: 'intake', transactionId: tx.id, file_url: card.url, name: card.name });
      update(card.id, { state: 'ready', result: res.data });
    } catch (err) { update(card.id, { state: 'error', error: err.message }); }
  };

  const add = async (files) => {
    for (const file of [...(files || [])].slice(0, 10)) {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setCards((l) => [{ id, name: file.name, state: 'uploading' }, ...l]);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file, scope: { kind: 'tx', id: tx.id } });
        const fresh = await base44.entities.Transaction.get(tx.id);
        await base44.entities.Transaction.update(tx.id, { documents: [...(fresh.documents || []), { name: file.name, url: file_url, uploaded_at: new Date().toISOString(), uploaded_by: user?.full_name || user?.email }] });
        refresh();
        const card = { id, name: file.name, url: file_url, state: 'reading' };
        update(id, card);
        analyze(card);
      } catch (err) { update(id, { state: 'error', error: err.message }); }
    }
  };

  const unsorted = (tx.documents || []).filter((d) => d.url && !cards.some((c) => c.url === d.url));
  const sortUnsorted = () => unsorted.slice(0, 8).forEach((d) => {
    const card = { id: `u-${d.url}`, name: d.name, url: d.url, state: 'reading' };
    setCards((l) => [card, ...l]);
    analyze(card);
  });

  return (
    <div className="space-y-3">
      {canEdit && (
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
          className={`flex items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 cursor-pointer transition-colors ${drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/60'}`}>
          <input ref={input} type="file" multiple accept="application/pdf,image/*" style={{ display: 'none' }} onChange={(e) => { const l = e.target.files; add(l); e.target.value = ''; }} />
          <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0"><Upload className="w-4 h-4" /></div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Drop a document</p>
            <p className="text-xs text-muted-foreground">Addendum, inspection report, appraisal, commitment letter… AI files it and spots date changes.</p>
          </div>
        </label>
      )}
      {canEdit && unsorted.length > 0 && !cards.length && (
        <button type="button" onClick={sortUnsorted} className="w-full rounded-xl border bg-card px-4 py-2.5 text-sm flex items-center gap-2 hover:border-primary">
          <Sparkles className="w-4 h-4 text-violet-600" /> {unsorted.length} unsorted document{unsorted.length === 1 ? '' : 's'}. Let AI file {unsorted.length === 1 ? 'it' : 'them'}
        </button>
      )}
      {cards.map((c) => <IntakeCard key={c.id} c={c} tx={tx} user={user} refresh={refresh} onDismiss={() => setCards((l) => l.filter((x) => x.id !== c.id))} />)}
    </div>
  );
}

function IntakeCard({ c, tx, user, refresh, onDismiss }) {
  const [filed, setFiled] = useState(false);
  const [applied, setApplied] = useState({});
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const r = c.result;
  const doFile = async () => {
    setBusy('file'); setErr(null);
    try { await fileDocument(tx, { checklist_id: r.file_to.checklist_id, item_id: r.file_to.item_id, url: c.url, name: c.name }); setFiled(true); refresh(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const doChange = async (ch) => {
    setBusy(ch.field); setErr(null);
    try { await changeField(tx, user, ch.field, ch.to, `${r.document_type}: ${ch.reason}`); setApplied((a) => ({ ...a, [ch.field]: true })); refresh(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  return (
    <div className="rounded-xl border bg-card p-3 text-sm space-y-2">
      <div className="flex items-start gap-2">
        <FileText className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{c.name}</p>
          {(c.state === 'uploading' || c.state === 'reading') && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> {c.state === 'uploading' ? 'Saving to the deal…' : 'Reading it…'}</p>}
          {c.state === 'error' && <p className="text-xs text-destructive">{c.error}</p>}
          {r && <p className="text-xs text-muted-foreground"><span className="font-semibold text-foreground">{r.document_type}.</span> {r.summary}</p>}
        </div>
        <button type="button" onClick={onDismiss} className="p-1 rounded hover:bg-muted" aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
      </div>
      {r && (
        <div className="space-y-1.5 pl-6">
          {r.file_to ? (
            <div className="flex items-center gap-2">
              <FolderOpen className="w-3.5 h-3.5 text-violet-600" />
              <span className="flex-1">File to <strong>{r.file_to.title}</strong></span>
              {filed ? <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Filed</span>
                : <Button size="sm" variant="outline" disabled={!!busy} onClick={doFile}>{busy === 'file' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'File it'}</Button>}
            </div>
          ) : <p className="text-xs text-muted-foreground">No matching checklist item. It stays in Unsorted.</p>}
          {r.changes.map((ch) => (
            <div key={ch.field} className="flex items-center gap-2">
              <CalendarClock className="w-3.5 h-3.5 text-amber-600" />
              <span className="flex-1">{ch.label}: {fmt(ch.field, ch.from)} → <strong>{fmt(ch.field, ch.to)}</strong><span className="block text-xs text-muted-foreground">{ch.reason}</span></span>
              {applied[ch.field] ? <span className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Updated</span>
                : <Button size="sm" variant="outline" disabled={!!busy} onClick={() => doChange(ch)}>{busy === ch.field ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Update'}</Button>}
            </div>
          ))}
          {r.issues.map((x, i) => <p key={i} className="text-xs text-amber-800 flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" /> {x}</p>)}
          {err && <p className="text-xs text-destructive">{err}</p>}
        </div>
      )}
    </div>
  );
}
