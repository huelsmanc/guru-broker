import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, RotateCcw, RefreshCw, Trash2, ArrowLeft, ArrowRight, Sparkles, Plus, Check, Save, X, FileText } from 'lucide-react';
import { openPdf, pageThumb, pageText } from '@/lib/pdfText';
import { isPdfUrl } from '@/components/esign/PDFPageRenderer';

const GROUP_COLORS = ['#2563eb', '#16a34a', '#9333ea', '#ea580c', '#db2777', '#0891b2', '#ca8a04', '#4f46e5'];
const isImage = (s) => /\.(png|jpe?g)$/i.test(String(s.name || '')) || /image\//.test(String(s.type || ''));

/**
 * Page tools: see every page, rotate, reorder, delete, and split pages into new documents,
 * each straight onto a checklist item (or Unsorted). AI can suggest the split for a scanned
 * packet.
 *
 * sources: [{ url, name }]  (PDFs or JPG/PNG photos)
 * tx: the deal (pages are saved to it); items: [{ key, title, checklist_id, item_id }] open checklist items
 * replaceIndex: index in tx.documents of the file being edited (enables "Save changes")
 * onSaved({ file_url, name }) for a plain save (e.g. e-sign: replace the file being sent)
 */
export default function DocWorkbench({ sources, tx, transactionId, items = [], replaceIndex = null, onSaved, onClose, saveLabel }) {
  const [pages, setPages] = useState(null); // [{ key, s, p, r, thumb, text, group }]
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(null);
  const [groups, setGroups] = useState([]); // [{ id, name, item, done }]
  const [note, setNote] = useState(null);

  // Load every page of every source, with a thumbnail.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = [];
        for (const [s, src] of sources.entries()) {
          if (!isPdfUrl(src.url) && isImage(src)) { list.push({ key: `${s}-0`, s, p: 0, r: 0, thumb: src.url, text: '' }); continue; }
          const pdf = await openPdf(src.url);
          for (let n = 1; n <= pdf.numPages; n++) list.push({ key: `${s}-${n - 1}`, s, p: n - 1, r: 0, pdf, n, thumb: null, text: null });
        }
        if (!live) return;
        setPages(list);
        // Thumbnails and text fill in progressively.
        for (const pg of list) {
          if (!pg.pdf) continue;
          const [thumb, text] = await Promise.all([pageThumb(pg.pdf, pg.n).catch(() => null), pageText(pg.pdf, pg.n).catch(() => '')]);
          if (!live) return;
          setPages((cur) => cur?.map((x) => (x.key === pg.key ? { ...x, thumb, text } : x)));
        }
      } catch (err) { if (live) setError(`Couldn't open the document: ${err.message}`); }
    })();
    return () => { live = false; };
  }, [sources]);

  const toggle = (key) => setSelected((cur) => { const n = new Set(cur); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const rotate = (keys, by) => setPages((cur) => cur.map((x) => (keys.includes(x.key) ? { ...x, r: (x.r + by + 360) % 360 } : x)));
  const remove = (keys) => { setPages((cur) => cur.filter((x) => !keys.includes(x.key))); setSelected(new Set()); };
  const move = (key, d) => setPages((cur) => {
    const i = cur.findIndex((x) => x.key === key); const j = i + d;
    if (i < 0 || j < 0 || j >= cur.length) return cur;
    const n = [...cur]; [n[i], n[j]] = [n[j], n[i]]; return n;
  });
  const sel = useMemo(() => (pages || []).filter((x) => selected.has(x.key)), [pages, selected]);
  const groupOf = (key) => groups.find((g) => g.keys.includes(key));

  const build = async (list, name) => {
    const res = await base44.functions.invoke('docTools', {
      action: 'build', transactionId: tx?.id || transactionId || undefined, name,
      sources: sources.map((s) => s.url),
      pages: list.map((x) => ({ s: x.s, p: x.p, r: x.r })),
    });
    return res.data;
  };

  // Puts a new document on a checklist item, or in the deal's Unsorted list.
  const file = async (built, itemKey) => {
    const it = items.find((x) => x.key === itemKey);
    if (it) {
      await base44.functions.invoke('checklistAction', { action: 'attach', checklist_id: it.checklist_id, item_id: it.item_id, url: built.file_url, name: built.name });
    } else if (tx) {
      const fresh = await base44.entities.Transaction.get(tx.id);
      await base44.entities.Transaction.update(tx.id, { documents: [...(fresh.documents || []), { name: built.name, url: built.file_url, uploaded_at: new Date().toISOString(), uploaded_by: 'Page tools' }] });
    }
  };

  const createGroup = async (g) => {
    const list = pages.filter((x) => g.keys.includes(x.key));
    if (!list.length) return;
    setBusy(g.id); setError(null);
    try {
      const built = await build(list, g.name || 'Document');
      await file(built, g.item);
      setGroups((cur) => cur.map((x) => (x.id === g.id ? { ...x, done: true } : x)));
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  };

  const newFromSelected = () => {
    if (!sel.length) return;
    const id = `g${Date.now()}`;
    // A page belongs to one new document: take the selected pages out of any unfinished one.
    setGroups((cur) => [...cur.map((g) => (g.done ? g : { ...g, keys: g.keys.filter((k) => !selected.has(k)) })).filter((g) => g.done || g.keys.length),
      { id, name: '', item: '', keys: sel.map((x) => x.key) }]);
    setSelected(new Set());
  };

  const aiSplit = async () => {
    setBusy('ai'); setError(null); setNote(null);
    try {
      const res = await base44.functions.invoke('docTools', {
        action: 'suggest', transactionId: tx?.id,
        pages: pages.map((x, i) => ({ n: i + 1, text: x.text || '' })),
        items: items.map((i) => ({ key: i.key, title: i.title })),
      });
      const docs = res.data.documents || [];
      if (!docs.length) { setNote("The AI couldn't tell the documents apart. Select pages and make documents by hand."); return; }
      setGroups((cur) => [...cur.filter((g) => g.done), ...docs.map((d, k) => ({ id: `ai${k}-${Date.now()}`, name: d.name, item: d.item_key || '', keys: d.pages.map((n) => pages[n - 1]?.key).filter(Boolean) }))]);
      setNote(`The AI found ${docs.length} document${docs.length === 1 ? '' : 's'}. Check the names and checklist items, then create them.`);
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  };

  // Save the edited pages (rotations, order, deletions) as the file itself.
  const saveAll = async () => {
    if (!pages.length) return;
    setBusy('save'); setError(null);
    try {
      const built = await build(pages, sources[0]?.name || 'Document');
      if (onSaved) { await onSaved(built); return; }
      if (tx && replaceIndex != null) {
        const fresh = await base44.entities.Transaction.get(tx.id);
        const docs = [...(fresh.documents || [])];
        if (docs[replaceIndex]) docs[replaceIndex] = { ...docs[replaceIndex], url: built.file_url, edited_at: new Date().toISOString() };
        else docs.push({ name: built.name, url: built.file_url, uploaded_at: new Date().toISOString(), uploaded_by: 'Page tools' });
        await base44.entities.Transaction.update(tx.id, { documents: docs });
      }
      onClose('saved');
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  };

  const pending = groups.filter((g) => !g.done);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose(groups.some((g) => g.done))}>
      <DialogContent className="w-[97vw] max-w-6xl h-[95dvh] max-h-[95dvh]">
        <DialogHeader><DialogTitle>Page tools{sources.length === 1 ? `: ${sources[0].name || ''}` : ` (${sources.length} files)`}</DialogTitle></DialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!pages ? <div className="py-20 flex justify-center gap-2 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /> Opening pages…</div> : (
          <div className="grid lg:grid-cols-[1fr_320px] gap-4 min-h-0">
            <div className="min-w-0">
              <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground mr-1">{pages.length} pages · {selected.size} selected</span>
                <Button size="sm" variant="ghost" onClick={() => setSelected(selected.size === pages.length ? new Set() : new Set(pages.map((x) => x.key)))}>{selected.size === pages.length ? 'Select none' : 'Select all'}</Button>
                <Button size="sm" variant="outline" className="gap-1" disabled={!selected.size} onClick={() => rotate([...selected], -90)}><RotateCcw className="w-3.5 h-3.5" /> Left</Button>
                <Button size="sm" variant="outline" className="gap-1" disabled={!selected.size} onClick={() => rotate([...selected], 90)}><RefreshCw className="w-3.5 h-3.5" /> Right</Button>
                <Button size="sm" variant="outline" className="gap-1 text-destructive" disabled={!selected.size} onClick={() => remove([...selected])}><Trash2 className="w-3.5 h-3.5" /> Delete</Button>
                {tx && <Button size="sm" className="gap-1" disabled={!selected.size} onClick={newFromSelected}><Plus className="w-3.5 h-3.5" /> New document from selected</Button>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {pages.map((x, i) => {
                  const g = groupOf(x.key);
                  const color = g ? GROUP_COLORS[groups.indexOf(g) % GROUP_COLORS.length] : null;
                  const on = selected.has(x.key);
                  return (
                    <div key={x.key} className={`relative rounded-lg border-2 bg-card p-1.5 ${on ? 'border-primary ring-2 ring-primary/30' : 'border-transparent'}`} style={color && !on ? { borderColor: color } : undefined}>
                      <button type="button" onClick={() => toggle(x.key)} className="block w-full aspect-[8.5/11] bg-muted rounded overflow-hidden flex items-center justify-center">
                        {x.thumb ? <img src={x.thumb} alt={`Page ${i + 1}`} className="max-w-full max-h-full object-contain transition-transform" style={{ transform: `rotate(${x.r}deg)${x.r % 180 ? ' scale(0.77)' : ''}` }} />
                          : <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
                      </button>
                      <div className="flex items-center gap-0.5 mt-1">
                        <span className={`w-5 h-5 rounded flex items-center justify-center ${on ? 'bg-primary text-primary-foreground' : 'border'}`}>{on && <Check className="w-3 h-3" />}</span>
                        <span className="text-[11px] text-muted-foreground ml-1">{i + 1}{sources.length > 1 ? ` · ${String(sources[x.s]?.name || '').slice(0, 10)}` : ''}</span>
                        <span className="ml-auto flex">
                          <button type="button" title="Move left" onClick={() => move(x.key, -1)} className="p-1 hover:bg-muted rounded"><ArrowLeft className="w-3 h-3" /></button>
                          <button type="button" title="Rotate" onClick={() => rotate([x.key], 90)} className="p-1 hover:bg-muted rounded"><RefreshCw className="w-3 h-3" /></button>
                          <button type="button" title="Move right" onClick={() => move(x.key, 1)} className="p-1 hover:bg-muted rounded"><ArrowRight className="w-3 h-3" /></button>
                          <button type="button" title="Delete page" onClick={() => remove([x.key])} className="p-1 hover:bg-muted rounded text-destructive"><X className="w-3 h-3" /></button>
                        </span>
                      </div>
                      {g && <span className="absolute top-2 left-2 text-[10px] font-semibold text-white rounded px-1.5 py-0.5 max-w-[85%] truncate" style={{ background: color }}>{g.done ? '✓ ' : ''}{g.name || 'New document'}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 lg:border-l lg:pl-4">
              {tx && (
                <>
                  <div className="rounded-lg border p-3 space-y-2 bg-gradient-to-br from-violet-50/70 to-transparent dark:from-violet-950/20">
                    <p className="text-sm font-semibold flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-violet-600" /> Split with AI</p>
                    <p className="text-xs text-muted-foreground">For a scanned packet: the AI finds where each document starts and ends and which checklist item it goes on.</p>
                    <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={aiSplit} disabled={busy === 'ai' || pages.some((x) => x.pdf && x.text == null)}>
                      {busy === 'ai' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} {pages.some((x) => x.pdf && x.text == null) ? 'Reading pages…' : 'Find the documents'}
                    </Button>
                    {note && <p className="text-xs">{note}</p>}
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1.5">New documents</p>
                    {!groups.length && <p className="text-xs text-muted-foreground">Select pages on the left and press "New document from selected", or let the AI split it.</p>}
                    <div className="space-y-2">
                      {groups.map((g, k) => (
                        <div key={g.id} className="rounded-lg border p-2.5 space-y-1.5" style={{ borderLeft: `4px solid ${GROUP_COLORS[k % GROUP_COLORS.length]}` }}>
                          <div className="flex items-center gap-1">
                            <Input className="h-8 text-sm" value={g.name} placeholder="Document name" disabled={g.done}
                              onChange={(e) => setGroups((cur) => cur.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))} />
                            {!g.done && <button type="button" className="p-1 rounded hover:bg-muted" aria-label="Remove" onClick={() => setGroups((cur) => cur.filter((x) => x.id !== g.id))}><X className="w-4 h-4" /></button>}
                          </div>
                          <p className="text-[11px] text-muted-foreground">Pages {g.keys.map((key) => pages.findIndex((x) => x.key === key) + 1).filter((n) => n > 0).join(', ')}</p>
                          <select className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" value={g.item} disabled={g.done}
                            onChange={(e) => setGroups((cur) => cur.map((x) => (x.id === g.id ? { ...x, item: e.target.value } : x)))}>
                            <option value="">Put in Unsorted</option>
                            {items.map((it) => <option key={it.key} value={it.key}>{it.title}</option>)}
                          </select>
                          {g.done ? <p className="text-xs text-emerald-700 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> Created{g.item ? ' on the checklist' : ' in Unsorted'}</p>
                            : <Button size="sm" className="w-full gap-1" disabled={!!busy || !g.name.trim()} onClick={() => createGroup(g)}>{busy === g.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />} Create</Button>}
                        </div>
                      ))}
                    </div>
                    {pending.length > 1 && (
                      <Button size="sm" variant="outline" className="w-full mt-2" disabled={!!busy || pending.some((g) => !g.name.trim())}
                        onClick={async () => { for (const g of pending) await createGroup(g); }}>Create all {pending.length}</Button>
                    )}
                  </div>
                </>
              )}
              {(replaceIndex != null || onSaved) && (
                <div className="rounded-lg border p-3 space-y-2">
                  <p className="text-sm font-semibold">Save edits</p>
                  <p className="text-xs text-muted-foreground">Keeps the rotations, page order and deletions as {onSaved ? 'the document you are sending' : 'this file'}.</p>
                  <Button size="sm" className="w-full gap-1.5" onClick={saveAll} disabled={!!busy || !pages.length}>
                    {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saveLabel || 'Save changes'}
                  </Button>
                </div>
              )}
              <Button variant="ghost" className="w-full" onClick={() => onClose(groups.some((g) => g.done))}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
