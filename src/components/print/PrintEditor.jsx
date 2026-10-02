// Drag-and-drop editor for print pieces (postcard front and back, flyers, business cards).
// Starts from a ready-made layout filled with the agent's info and the property, then anything
// can be moved, resized, retyped, recolored, swapped or added. Works with a mouse or a finger.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Undo2, Redo2, Type, Image as ImageIcon, Square, Circle, Minus, Trash2, Copy, ArrowUp, ArrowDown, AlignLeft, AlignCenter, AlignRight,
  Italic, Upload, Loader2, Check, Save, LayoutTemplate, Home, Grid3x3, ChevronLeft, CaseUpper,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PRODUCTS } from '../../../shared/print.js';
import { FONTS, pageSize, sidesOf, layoutsFor, makePage, makeEl, withPage, uid } from '@/lib/editorDoc';
import EditorPage, { EditorThumb, TextBody, SAFE } from './EditorPage';

const SIDE_LABEL = { front: 'Front', back: 'Back' };
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const CURSOR = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
const hex = (c) => (/^#[0-9a-f]{6}/i.test(c || '') ? c.slice(0, 7) : '#000000');

// ---------------------------------------------------------------- undo / redo
function useDocHistory(initial) {
  const [doc, setDoc] = useState(initial);
  const ref = useRef(initial);
  const past = useRef([]); const future = useRef([]);
  const last = useRef({ key: null, t: 0 });
  const [, bump] = useState(0);
  const live = useCallback((next) => { ref.current = next; setDoc(next); }, []);
  const checkpoint = useCallback(() => {
    past.current.push(ref.current); if (past.current.length > 150) past.current.shift();
    future.current = []; last.current = { key: null, t: 0 }; bump((n) => n + 1);
  }, []);
  const commit = useCallback((next, key) => {
    const now = Date.now();
    if (!(key && last.current.key === key && now - last.current.t < 1200)) { past.current.push(ref.current); if (past.current.length > 150) past.current.shift(); }
    last.current = { key, t: now }; future.current = [];
    live(next);
  }, [live]);
  const undo = useCallback(() => { if (!past.current.length) return; future.current.push(ref.current); last.current = { key: null, t: 0 }; live(past.current.pop()); }, [live]);
  const redo = useCallback(() => { if (!future.current.length) return; past.current.push(ref.current); last.current = { key: null, t: 0 }; live(future.current.pop()); }, [live]);
  return { doc, ref, live, commit, checkpoint, undo, redo, canUndo: past.current.length > 0, canRedo: future.current.length > 0 };
}

// ---------------------------------------------------------------- the editor
export default function PrintEditor({ product, initialDoc, agent = {}, brand = {}, title: initialTitle = '', onClose, onUse, onSave }) {
  const h = useDocHistory(initialDoc);
  const { doc } = h;
  const sides = sidesOf(product);
  const [side, setSide] = useState('front');
  const [sel, setSel] = useState(null);
  const [editing, setEditing] = useState(null);
  const [guides, setGuides] = useState(true);
  const [panel, setPanel] = useState('layouts'); // when nothing is selected: layouts | add
  const [title, setTitle] = useState(initialTitle);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState('');
  const page = doc.pages[side];
  const el = page?.elements.find((e) => e.id === sel) || null;
  const { W, H } = pageSize(product);
  const palette = useMemo(() => [...new Set([brand.color || '#0f172a', doc.src?.content?.palette?.accent || '#c9a227', '#ffffff', '#111827', '#475569', '#e5e7eb', '#b91c1c', '#0f766e', '#1d4ed8', '#7c3aed'].map((c) => c.toLowerCase()))], [brand.color, doc.src]);
  const layoutData = useMemo(() => ({ ...(doc.src || {}), agent, brand }), [doc.src, agent, brand]);
  const photos = useMemo(() => [...new Set([...(doc.src?.photos || []), doc.src?.bgImage, agent.headshot, brand.logo].filter(Boolean))], [doc.src, agent.headshot, brand.logo]);

  useEffect(() => { setSel(null); setEditing(null); }, [side]);
  useEffect(() => { setSaved(false); }, [doc]);

  const updatePage = (fn, key) => h.commit(withPage(h.ref.current, side, fn), key);
  const updateEl = (id, patch, key) => updatePage((p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)) }), key);
  const removeEl = (id) => { updatePage((p) => ({ ...p, elements: p.elements.filter((e) => e.id !== id) })); setSel(null); setEditing(null); };
  const duplicate = (id) => {
    const src = h.ref.current.pages[side].elements.find((e) => e.id === id); if (!src) return;
    const copy = { ...src, id: uid(), x: Math.min(src.x + 12, W - src.w), y: Math.min(src.y + 12, H - src.h) };
    updatePage((p) => ({ ...p, elements: [...p.elements, copy] })); setSel(copy.id);
  };
  const reorder = (id, dir) => updatePage((p) => {
    const els = [...p.elements]; const i = els.findIndex((e) => e.id === id); if (i < 0) return p;
    const [e] = els.splice(i, 1);
    const j = dir === 'top' ? els.length : dir === 'bottom' ? 0 : Math.max(0, Math.min(els.length, i + (dir === 'up' ? 1 : -1)));
    els.splice(j, 0, e); return { ...p, elements: els };
  });
  const add = (type, o = {}) => {
    const k = W / 576;
    const base = {
      heading: () => makeEl('text', { x: W * 0.1, y: H * 0.4, w: W * 0.8, h: 34 * k, text: 'Your headline', size: +(24 * k).toFixed(1), weight: 800, color: brand.color || '#111827' }),
      text: () => makeEl('text', { x: W * 0.15, y: H * 0.42, w: W * 0.7, h: 50 * k, text: 'Type your message here', size: +(11 * k).toFixed(1), lineHeight: 1.4 }),
      photo: () => makeEl('image', { x: W * 0.3, y: H * 0.25, w: W * 0.4, h: H * 0.5, placeholder: 'Photo', ...o }),
      rect: () => makeEl('shape', { x: W * 0.35, y: H * 0.35, w: W * 0.3, h: H * 0.3, fill: brand.color || '#0f172a' }),
      ellipse: () => makeEl('shape', { shape: 'ellipse', x: W * 0.4, y: H * 0.3, w: H * 0.4, h: H * 0.4, fill: brand.color || '#0f172a' }),
      line: () => makeEl('shape', { x: W * 0.2, y: H * 0.5, w: W * 0.6, h: Math.max(2, 2 * k), fill: brand.color || '#0f172a' }),
      logo: () => makeEl('image', { x: W * 0.4, y: H * 0.4, w: W * 0.2, h: H * 0.12, src: brand.logo || '', fit: 'contain', placeholder: 'Logo', role: 'logo' }),
      headshot: () => makeEl('image', { x: W * 0.42, y: H * 0.35, w: H * 0.3, h: H * 0.3, src: agent.headshot || '', radius: 999, placeholder: 'Headshot', role: 'headshot' }),
      eho: () => makeEl('eho', { x: W * 0.35, y: H * 0.85, w: W * 0.3, h: 14 * k, size: +(8 * k).toFixed(1) }),
    }[type]();
    updatePage((p) => ({ ...p, elements: [...p.elements, base] }));
    setSel(base.id);
    return base;
  };
  const applyLayout = (key) => {
    const edited = page && page.layout !== key && h.canUndo;
    if (edited && !window.confirm('Switch to this layout? Changes on this side are replaced (you can undo).')) return;
    h.commit(withPage(h.ref.current, side, (p) => ({ ...makePage(product, side, key, { ...(h.ref.current.src || {}), agent, brand }), bg: p?.bg || '#ffffff' })));
    setSel(null);
  };
  const uploadPhoto = async (file, onUrl) => {
    if (!file || !/^image\//.test(file.type)) { setMsg('Pick a JPG or PNG photo.'); return; }
    setMsg('Uploading photo…');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      h.commit({ ...h.ref.current, src: { ...(h.ref.current.src || {}), photos: [...(h.ref.current.src?.photos || []), file_url] } });
      onUrl(file_url); setMsg('');
    } catch (e) { setMsg(e.message || 'Upload failed'); }
  };

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (ev) => {
      const mod = ev.metaKey || ev.ctrlKey;
      if (mod && ev.key.toLowerCase() === 'z' && !typing(ev.target)) { ev.preventDefault(); if (ev.shiftKey) h.redo(); else h.undo(); return; }
      if (mod && ev.key.toLowerCase() === 'y' && !typing(ev.target)) { ev.preventDefault(); h.redo(); return; }
      if (typing(ev.target)) { if (ev.key === 'Escape') ev.target.blur(); return; }
      if (ev.key === 'Escape') { if (sel) setSel(null); return; }
      if (!sel) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); removeEl(sel); return; }
      if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); duplicate(sel); return; }
      const step = ev.shiftKey ? 10 : 1;
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[ev.key];
      if (d) { ev.preventDefault(); updateEl(sel, (e) => ({ x: e.x + d[0], y: e.y + d[1] }), `nudge:${sel}`); }
      if (ev.key === 'Enter') { const e = h.ref.current.pages[side].elements.find((x) => x.id === sel); if (e?.type === 'text') { ev.preventDefault(); setEditing(sel); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // No page scrolling behind the editor.
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try { await onSave(h.ref.current, title.trim() || 'My design'); setSaved(true); } catch (e) { setMsg(e.message || 'Could not save'); } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-[80] bg-slate-100 flex flex-col" role="dialog" aria-label="Design editor">
      {/* Top bar */}
      <div className="h-14 flex-shrink-0 bg-white border-b flex items-center gap-1 sm:gap-2 px-1.5 sm:px-3">
        <button onClick={() => onClose(h.ref.current, title.trim())} className="p-2 rounded-lg hover:bg-muted" aria-label="Close editor"><X className="w-5 h-5" /></button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Name this design" className="hidden sm:block min-w-0 w-48 lg:w-64 bg-transparent text-sm font-medium px-2 py-1.5 rounded-md hover:bg-muted focus:bg-muted outline-none" />
        <div className="flex items-center">
          <button onClick={h.undo} disabled={!h.canUndo} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30" title="Undo (Ctrl/Cmd+Z)" aria-label="Undo"><Undo2 className="w-4 h-4" /></button>
          <button onClick={h.redo} disabled={!h.canRedo} className="p-2 rounded-lg hover:bg-muted disabled:opacity-30" title="Redo (Shift+Ctrl/Cmd+Z)" aria-label="Redo"><Redo2 className="w-4 h-4" /></button>
          <button onClick={() => setGuides((g) => !g)} className={cn('p-2 rounded-lg hover:bg-muted hidden sm:block', guides && 'text-primary')} title="Show print guides" aria-label="Print guides"><Grid3x3 className="w-4 h-4" /></button>
        </div>
        {sides.length > 1 && (
          <div className="flex rounded-full bg-muted p-0.5 text-sm mx-auto">
            {sides.map((s) => <button key={s} onClick={() => setSide(s)} className={cn('px-2.5 sm:px-4 py-1 rounded-full', side === s ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground')}>{SIDE_LABEL[s]}</button>)}
          </div>
        )}
        <div className={cn('flex items-center gap-1.5 sm:gap-2', sides.length > 1 ? '' : 'ml-auto')}>
          {onSave && <Button variant="outline" size="sm" onClick={save} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}<span className="hidden sm:inline">{saved ? 'Saved' : 'Save to My designs'}</span></Button>}
          {onUse && <Button size="sm" onClick={() => onUse(h.ref.current, title.trim())} className="gap-1.5"><Check className="w-4 h-4" /> Done</Button>}
        </div>
      </div>
      {msg && <div className="bg-amber-50 text-amber-900 text-sm px-4 py-1.5 border-b flex items-center gap-2">{msg}<button className="ml-auto" onClick={() => setMsg('')} aria-label="Dismiss"><X className="w-4 h-4" /></button></div>}

      <div className="flex-1 min-h-0 flex flex-col-reverse lg:flex-row">
        {/* Side panel (below the canvas on phones) */}
        <aside className="lg:w-80 flex-shrink-0 bg-white border-t lg:border-t-0 lg:border-r overflow-y-auto max-h-[42vh] lg:max-h-none">
          {el ? (
            <Properties key={el.id} el={el} palette={palette} photos={photos} product={product}
              onChange={(patch, key) => updateEl(el.id, patch, key || `prop:${el.id}:${Object.keys(patch).join(',')}`)}
              onDelete={() => removeEl(el.id)} onDuplicate={() => duplicate(el.id)} onLayer={(d) => reorder(el.id, d)} onBack={() => setSel(null)}
              onEditText={() => setEditing(el.id)} onUpload={(f) => uploadPhoto(f, (url) => updateEl(el.id, { src: url }))} />
          ) : (
            <div className="p-3">
              <div className="flex gap-1 rounded-lg bg-muted p-1 text-sm mb-3">
                {[['layouts', 'Layouts', LayoutTemplate], ['add', 'Add', Type]].map(([k, l, Icon]) => <button key={k} onClick={() => setPanel(k)} className={cn('flex-1 rounded-md py-1.5 flex items-center justify-center gap-1.5', panel === k ? 'bg-white shadow-sm font-medium' : 'text-muted-foreground')}><Icon className="w-4 h-4" />{l}</button>)}
              </div>
              {panel === 'layouts' ? (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">Pick a starting point for the {SIDE_LABEL[side].toLowerCase()}. Everything stays editable.</p>
                  <div className="grid grid-cols-2 gap-2">
                    {layoutsFor(product, side).map((l) => (
                      <button key={l.key} onClick={() => applyLayout(l.key)} className={cn('rounded-lg border-2 p-1 text-left hover:border-primary/50', page?.layout === l.key ? 'border-primary' : 'border-transparent bg-muted/40')}>
                        <LayoutPreview product={product} side={side} layoutKey={l.key} data={layoutData} />
                        <span className="block text-xs mt-1 px-0.5">{l.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Background</p>
                    <Swatches value={page?.bg || '#ffffff'} palette={palette} onChange={(c) => updatePage((p) => ({ ...p, bg: c }), 'bg')} />
                  </div>
                </div>
              ) : (
                <AddPanel onAdd={add} hasLogo={!!brand.logo} hasHeadshot={!!agent.headshot} onUpload={(f) => uploadPhoto(f, (url) => add('photo', { src: url }))} />
              )}
              <p className="text-xs text-muted-foreground mt-4 leading-relaxed hidden lg:block">Tip: click anything to change it, drag to move, pull a corner to resize, double-click words to type. Arrow keys nudge; Delete removes; Ctrl/Cmd+D duplicates.</p>
            </div>
          )}
        </aside>

        {/* Canvas */}
        <Stage product={product} side={side} page={page} sel={sel} setSel={setSel} editing={editing} setEditing={setEditing} guides={guides}
          onBegin={h.checkpoint} onLive={(id, patch) => h.live(withPage(h.ref.current, side, (p) => ({ ...p, elements: p.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) })))}
          onText={(id, text) => updateEl(id, { text }, `text:${id}`)} />
      </div>
    </div>
  );
}

function LayoutPreview({ product, side, layoutKey, data }) {
  const page = useMemo(() => makePage(product, side, layoutKey, data), [product, side, layoutKey, data]);
  const { W, H } = pageSize(product);
  const height = Math.min(90, 130 * (H / W));
  return <EditorThumb product={product} side={side} page={page} height={height} className="rounded ring-1 ring-black/10 mx-auto bg-white" />;
}

// ---------------------------------------------------------------- canvas
function Stage({ product, side, page, sel, setSel, editing, setEditing, guides, onBegin, onLive, onText }) {
  const box = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [snap, setSnap] = useState([]);
  const { W, H } = pageSize(product);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const pad = size.w < 640 ? 16 : 48;
  const k = Math.max(0.1, Math.min((size.w - pad * 2) / W, (size.h - pad * 2) / H));
  const els = page?.elements || [];

  const start = (ev, e, mode) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    ev.stopPropagation();
    if (editing === e.id) return;
    setSel(e.id);
    const s = { x: ev.clientX, y: ev.clientY, el: { ...e } };
    let moved = false;
    const others = els.filter((o) => o.id !== e.id && !(o.w >= W - 1 && o.h >= H - 1));
    const vx = [0, W / 2, W, SAFE, W - SAFE, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])];
    const vy = [0, H / 2, H, SAFE, H - SAFE, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])];
    const tol = 6 / k;
    const move = (m) => {
      const dx = (m.clientX - s.x) / k; const dy = (m.clientY - s.y) / k;
      if (!moved) { if (Math.abs(dx) + Math.abs(dy) < 3 / k) return; moved = true; onBegin(); }
      const o = s.el;
      if (mode === 'move') {
        let x = o.x + dx; let y = o.y + dy; const lines = [];
        if (!m.altKey) {
          const bx = [[x, 0], [x + o.w / 2, o.w / 2], [x + o.w, o.w]];
          let best = null; for (const [p, off] of bx) for (const c of vx) { const d = Math.abs(p - c); if (d < tol && (!best || d < best.d)) best = { d, x: c - off, c }; }
          if (best) { x = best.x; lines.push({ v: best.c }); }
          const by = [[y, 0], [y + o.h / 2, o.h / 2], [y + o.h, o.h]];
          best = null; for (const [p, off] of by) for (const c of vy) { const d = Math.abs(p - c); if (d < tol && (!best || d < best.d)) best = { d, y: c - off, c }; }
          if (best) { y = best.y; lines.push({ h: best.c }); }
        }
        setSnap(lines);
        onLive(e.id, { x, y });
        return;
      }
      let { x, y, w, h } = o;
      if (mode.includes('e')) w = o.w + dx;
      if (mode.includes('w')) w = o.w - dx;
      if (mode.includes('s')) h = o.h + dy;
      if (mode.includes('n')) h = o.h - dy;
      const corner = mode.length === 2;
      const keep = corner && (m.shiftKey || (o.type === 'image' && o.radius >= 999) || o.shape === 'ellipse' && m.shiftKey);
      if (keep) { const r = o.w / o.h; if (Math.abs(w / o.w) > Math.abs(h / o.h)) h = w / r; else w = h * r; }
      w = Math.max(6, w); h = Math.max(o.type === 'shape' ? 1 : 6, h);
      if (mode.includes('w')) x = o.x + o.w - w;
      if (mode.includes('n')) y = o.y + o.h - h;
      // Corner-dragging text scales the words with the box.
      const patch = { x, y, w, h };
      if (o.type === 'text' && corner) patch.size = +(o.size * (w / o.w)).toFixed(2);
      if (o.type === 'eho' && corner) patch.size = +(o.size * (w / o.w)).toFixed(2);
      onLive(e.id, patch);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); setSnap([]); };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const selected = els.find((e) => e.id === sel);
  const editEl = els.find((e) => e.id === editing);
  const hs = 10 / k; // handle size, constant on screen
  return (
    <div ref={box} className="flex-1 min-h-0 min-w-0 relative overflow-hidden select-none" onPointerDown={() => { setSel(null); setEditing(null); }}>
      <div className="absolute shadow-2xl" style={{ left: (size.w - W * k) / 2, top: (size.h - H * k) / 2, width: W * k, height: H * k }}>
        <div style={{ width: W, height: H, transform: `scale(${k})`, transformOrigin: 'top left', position: 'relative' }}>
          <EditorPage product={product} side={side} page={page} showGuides={guides} placeholders hide={editing} />
          {/* Hit boxes and handles */}
          <div style={{ position: 'absolute', inset: 0 }}>
            {els.map((e) => (
              <div key={e.id} onPointerDown={(ev) => start(ev, e, 'move')} onDoubleClick={() => e.type === 'text' && setEditing(e.id)}
                style={{ position: 'absolute', left: e.x, top: e.y, width: e.w, height: Math.max(e.h, 4 / k), cursor: 'move', touchAction: 'none', outline: e.id === sel ? 'none' : undefined }}
                className="hover:outline hover:outline-1 hover:outline-sky-400/70" />
            ))}
            {selected && !editEl && (
              <div style={{ position: 'absolute', left: selected.x, top: selected.y, width: selected.w, height: selected.h, outline: `${1.5 / k}px solid #0ea5e9`, pointerEvents: 'none' }}>
                {HANDLES.filter((m) => !(selected.h * k < 24 && (m === 'n' || m === 's')) && !(selected.w * k < 24 && (m === 'e' || m === 'w'))).map((m) => {
                  const left = m.includes('w') ? 0 : m.includes('e') ? selected.w : selected.w / 2;
                  const top = m.includes('n') ? 0 : m.includes('s') ? selected.h : selected.h / 2;
                  return <div key={m} onPointerDown={(ev) => start(ev, selected, m)} style={{ position: 'absolute', left: left - hs / 2, top: top - hs / 2, width: hs, height: hs, background: '#fff', border: `${1.5 / k}px solid #0ea5e9`, borderRadius: m.length === 2 ? '50%' : 2 / k, cursor: CURSOR[m], pointerEvents: 'auto', touchAction: 'none' }} />;
                })}
              </div>
            )}
            {editEl && (
              <InlineText e={editEl} k={k} onChange={(t) => onText(editEl.id, t)} onDone={() => setEditing(null)} />
            )}
            {snap.map((l, i) => (l.v != null
              ? <div key={i} style={{ position: 'absolute', left: l.v, top: 0, bottom: 0, width: 0, borderLeft: `${1 / k}px solid #ec4899`, pointerEvents: 'none' }} />
              : <div key={i} style={{ position: 'absolute', top: l.h, left: 0, right: 0, height: 0, borderTop: `${1 / k}px solid #ec4899`, pointerEvents: 'none' }} />))}
          </div>
        </div>
      </div>
    </div>
  );
}

function InlineText({ e, k, onChange, onDone }) {
  const ref = useRef(null);
  useEffect(() => { const t = ref.current; if (t) { t.focus(); t.select(); } }, []);
  return (
    <div style={{ position: 'absolute', left: e.x, top: e.y, width: e.w, minHeight: e.h, outline: `${1.5 / k}px solid #0ea5e9` }} onPointerDown={(ev) => ev.stopPropagation()}>
      <TextBody e={e}>
        <textarea ref={ref} value={e.text || ''} onChange={(ev) => onChange(ev.target.value)} onBlur={onDone}
          style={{ all: 'inherit', display: 'block', width: '100%', height: '100%', minHeight: e.h, resize: 'none', background: 'rgba(255,255,255,0.08)', border: 0, outline: 'none', padding: 0, margin: 0, overflow: 'hidden', caretColor: '#0ea5e9' }} />
      </TextBody>
    </div>
  );
}

// ---------------------------------------------------------------- panels
function AddPanel({ onAdd, onUpload, hasLogo, hasHeadshot }) {
  const tile = 'rounded-xl border bg-white hover:border-primary/50 hover:bg-primary/5 p-3 flex flex-col items-center gap-1.5 text-xs';
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Words</p>
        <div className="grid grid-cols-2 gap-2">
          <button className={tile} onClick={() => onAdd('heading')}><span className="text-lg font-extrabold leading-none">Aa</span>Headline</button>
          <button className={tile} onClick={() => onAdd('text')}><Type className="w-5 h-5" />Text</button>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Pictures</p>
        <div className="grid grid-cols-3 gap-2">
          <label className={cn(tile, 'cursor-pointer')}><Upload className="w-5 h-5" />Upload<input type="file" accept="image/*" className="hidden" onChange={(ev) => { onUpload(ev.target.files?.[0]); ev.target.value = ''; }} /></label>
          <button className={tile} onClick={() => onAdd('photo')}><ImageIcon className="w-5 h-5" />Frame</button>
          <button className={tile} onClick={() => onAdd('headshot')} title={hasHeadshot ? '' : 'Add a headshot in Brand kit'}><Circle className="w-5 h-5" />Headshot</button>
          <button className={tile} onClick={() => onAdd('logo')} title={hasLogo ? '' : 'Add a logo in Brand kit'}><Home className="w-5 h-5" />Logo</button>
          <button className={tile} onClick={() => onAdd('eho')}><Home className="w-5 h-5" />Equal Housing</button>
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Shapes</p>
        <div className="grid grid-cols-3 gap-2">
          <button className={tile} onClick={() => onAdd('rect')}><Square className="w-5 h-5" />Box</button>
          <button className={tile} onClick={() => onAdd('ellipse')}><Circle className="w-5 h-5" />Circle</button>
          <button className={tile} onClick={() => onAdd('line')}><Minus className="w-5 h-5" />Line</button>
        </div>
      </div>
    </div>
  );
}

function Swatches({ value, palette, onChange }) {
  const isGradient = /gradient/.test(value || '');
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {palette.map((c) => <button key={c} onClick={() => onChange(c)} title={c} className={cn('w-7 h-7 rounded-full ring-1 ring-black/15', String(value).toLowerCase().startsWith(c) && 'ring-2 ring-primary ring-offset-1')} style={{ background: c }} />)}
      <label className="w-7 h-7 rounded-full ring-1 ring-black/15 overflow-hidden cursor-pointer relative" title="Any color" style={{ background: 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)' }}>
        <input type="color" value={hex(isGradient ? '#000000' : value)} onChange={(ev) => onChange(ev.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
      {isGradient && <span className="text-xs text-muted-foreground">Fade</span>}
    </div>
  );
}

function Row({ label, children }) {
  return <div className="mb-3"><p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">{label}</p>{children}</div>;
}

function Slider({ value, min, max, step = 1, onChange, suffix = '' }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(ev) => onChange(Number(ev.target.value))} className="flex-1 accent-primary" />
      <span className="text-xs tabular-nums w-12 text-right">{Math.round(value * 100) / 100}{suffix}</span>
    </div>
  );
}

function Properties({ el, palette, photos, product, onChange, onDelete, onDuplicate, onLayer, onBack, onEditText, onUpload }) {
  const btn = (on) => cn('h-8 min-w-8 px-2 rounded-md border text-sm flex items-center justify-center', on ? 'bg-primary text-primary-foreground border-primary' : 'bg-white hover:bg-muted');
  const NAME = { text: 'Text', image: el.role === 'logo' ? 'Logo' : el.role === 'headshot' ? 'Headshot' : 'Photo', shape: el.shape === 'ellipse' ? 'Circle' : 'Shape', eho: 'Equal Housing' };
  return (
    <div className="p-3">
      <div className="flex items-center gap-1 mb-3">
        <button onClick={onBack} className="p-1.5 -ml-1 rounded-md hover:bg-muted" aria-label="Back"><ChevronLeft className="w-4 h-4" /></button>
        <p className="font-semibold text-sm flex-1">{NAME[el.type]}</p>
        <button onClick={() => onLayer('up')} className="p-1.5 rounded-md hover:bg-muted" title="Bring forward"><ArrowUp className="w-4 h-4" /></button>
        <button onClick={() => onLayer('down')} className="p-1.5 rounded-md hover:bg-muted" title="Send backward"><ArrowDown className="w-4 h-4" /></button>
        <button onClick={onDuplicate} className="p-1.5 rounded-md hover:bg-muted" title="Duplicate"><Copy className="w-4 h-4" /></button>
        <button onClick={onDelete} className="p-1.5 rounded-md hover:bg-red-50 text-red-600" title="Delete"><Trash2 className="w-4 h-4" /></button>
      </div>

      {el.type === 'text' && (<>
        <Row label="Words">
          <textarea value={el.text || ''} onChange={(ev) => onChange({ text: ev.target.value }, `text:${el.id}`)} rows={3} className="w-full rounded-lg border px-2.5 py-2 text-base sm:text-sm" />
          <button onClick={onEditText} className="text-xs text-primary mt-1 hidden lg:inline">Type right on the design</button>
        </Row>
        <Row label="Font">
          <select value={el.font} onChange={(ev) => onChange({ font: ev.target.value })} className="w-full rounded-lg border px-2 py-1.5 text-sm bg-white" style={{ fontFamily: el.font }}>
            {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
          </select>
        </Row>
        <Row label="Size"><Slider value={el.size} min={5} max={Math.round(pageSize(product).H / 4)} step={0.5} onChange={(v) => onChange({ size: v })} /></Row>
        <Row label="Style">
          <div className="flex flex-wrap gap-1.5">
            <select value={el.weight} onChange={(ev) => onChange({ weight: Number(ev.target.value) })} className="h-8 rounded-md border px-1.5 text-sm bg-white">
              {[[400, 'Regular'], [600, 'Semibold'], [700, 'Bold'], [800, 'Extra bold']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <button className={btn(el.italic)} onClick={() => onChange({ italic: !el.italic })} title="Italic"><Italic className="w-4 h-4" /></button>
            <button className={btn(el.uppercase)} onClick={() => onChange({ uppercase: !el.uppercase })} title="All caps"><CaseUpper className="w-4 h-4" /></button>
            {[['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]].map(([a, Icon]) => <button key={a} className={btn(el.align === a)} onClick={() => onChange({ align: a })} title={`Align ${a}`}><Icon className="w-4 h-4" /></button>)}
          </div>
        </Row>
        <Row label="Color"><Swatches value={el.color} palette={palette} onChange={(c) => onChange({ color: c }, `color:${el.id}`)} /></Row>
        <Row label="Line spacing"><Slider value={el.lineHeight} min={0.8} max={2.2} step={0.05} onChange={(v) => onChange({ lineHeight: v })} /></Row>
        <Row label="Letter spacing"><Slider value={el.letterSpacing || 0} min={-1} max={8} step={0.1} onChange={(v) => onChange({ letterSpacing: v })} /></Row>
      </>)}

      {el.type === 'image' && (<>
        <Row label="Picture">
          <div className="grid grid-cols-4 gap-1.5">
            <label className="aspect-square rounded-md border-2 border-dashed flex flex-col items-center justify-center text-[10px] text-muted-foreground cursor-pointer hover:bg-muted"><Upload className="w-4 h-4" />Upload
              <input type="file" accept="image/*" className="hidden" onChange={(ev) => { onUpload(ev.target.files?.[0]); ev.target.value = ''; }} /></label>
            {photos.map((u) => <button key={u} onClick={() => onChange({ src: u })} className={cn('aspect-square rounded-md overflow-hidden ring-1 ring-black/10 bg-muted', el.src === u && 'ring-2 ring-primary')}><img src={u} alt="" className="w-full h-full object-cover" /></button>)}
          </div>
          {el.src && <button onClick={() => onChange({ src: '' })} className="text-xs text-muted-foreground mt-1.5 hover:text-foreground">Remove picture</button>}
        </Row>
        <Row label="Fit">
          <div className="flex gap-1.5">{[['cover', 'Fill frame'], ['contain', 'Show all']].map(([f, l]) => <button key={f} className={btn(el.fit === f)} onClick={() => onChange({ fit: f })}>{l}</button>)}</div>
        </Row>
        <Row label="Corners">
          <div className="flex gap-1.5 mb-2">{[['Square', 0], ['Rounded', Math.round(Math.min(el.w, el.h) * 0.08)], ['Circle', 999]].map(([l, r]) => <button key={l} className={btn((el.radius || 0) === r)} onClick={() => onChange({ radius: r, ...(r === 999 ? { w: Math.min(el.w, el.h), h: Math.min(el.w, el.h) } : {}) })}>{l}</button>)}</div>
        </Row>
        <Row label="See-through"><Slider value={Math.round((1 - (el.opacity ?? 1)) * 100)} min={0} max={90} onChange={(v) => onChange({ opacity: 1 - v / 100 })} suffix="%" /></Row>
      </>)}

      {el.type === 'shape' && (<>
        <Row label="Color"><Swatches value={el.fill} palette={palette} onChange={(c) => onChange({ fill: c }, `fill:${el.id}`)} /></Row>
        {el.shape !== 'ellipse' && <Row label="Corners"><Slider value={el.radius || 0} min={0} max={Math.round(Math.min(el.w, el.h) / 2)} onChange={(v) => onChange({ radius: v })} /></Row>}
        <Row label="See-through"><Slider value={Math.round((1 - (el.opacity ?? 1)) * 100)} min={0} max={95} onChange={(v) => onChange({ opacity: 1 - v / 100 })} suffix="%" /></Row>
      </>)}

      {el.type === 'eho' && (<>
        <Row label="Color"><Swatches value={el.color} palette={palette} onChange={(c) => onChange({ color: c })} /></Row>
        <Row label="Size"><Slider value={el.size} min={5} max={20} step={0.5} onChange={(v) => onChange({ size: v })} /></Row>
      </>)}
    </div>
  );
}
