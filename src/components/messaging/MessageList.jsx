import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { SmilePlus, Pencil, Trash2, Pin, MessageSquare, Copy, Loader2, AlertCircle, ArrowDown, Check, CheckCheck, Phone, Video, FileText, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import EmojiPicker from '@/components/chat/EmojiPicker';
import FilePreview from '@/components/viewer/FilePreview';
import { lc } from '@/lib/chat/ChatProvider';

const QUICK = ['👍', '❤️', '😂', '🎉', '🙏', '🔥'];
const GROUP_MS = 5 * 60 * 1000;

const dayLabel = (d) => (isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'EEEE, MMMM d'));

// Link previews are fetched once per URL for the whole session.
const linkCache = new Map();
function useLinkPreview(url) {
  const [meta, setMeta] = useState(() => linkCache.get(url) || null);
  useEffect(() => {
    if (!url) return;
    if (linkCache.has(url)) { const v = linkCache.get(url); if (v && typeof v.then !== 'function') setMeta(v); else v?.then?.(setMeta); return; }
    const p = base44.functions.invoke('fetchLinkMetadata', { url }).then((r) => { const d = r.data?.title ? r.data : null; linkCache.set(url, d); return d; }).catch(() => { linkCache.set(url, null); return null; });
    linkCache.set(url, p);
    p.then(setMeta);
  }, [url]);
  return meta;
}

function Avatar({ person, size = 36, online }) {
  return (
    <span className="relative inline-flex flex-shrink-0" style={{ width: size, height: size }}>
      <span className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-primary/25 to-accent/25 text-primary font-semibold flex items-center justify-center" style={{ fontSize: size * 0.38 }}>
        {person?.photo ? <img src={person.photo} alt="" className="w-full h-full object-cover" /> : (person?.name || '?')[0]?.toUpperCase()}
      </span>
      {online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 ring-2 ring-background" />}
    </span>
  );
}
export { Avatar };

const URL_RE = /(https?:\/\/[^\s<]+[^\s<.,;:!?)'"\]])/g;

function TextBody({ text, mentionNames }) {
  const parts = [];
  const names = mentionNames.filter(Boolean).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`${URL_RE.source}${names.length ? `|(@(?:${names.join('|')}|channel))` : '|(@channel)'}`, 'g');
  let last = 0; let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) parts.push(<a key={m.index} href={m[1]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 break-all">{m[1]}</a>);
    else parts.push(<span key={m.index} className="rounded px-1 bg-amber-200/60 dark:bg-amber-500/30 font-medium">{m[2]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <p className="whitespace-pre-wrap break-words">{parts}</p>;
}

function LinkCard({ url }) {
  const meta = useLinkPreview(url);
  if (!meta) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="mt-2 flex max-w-md overflow-hidden rounded-lg border bg-background/70 hover:bg-muted/60 text-foreground">
      {meta.image && <img src={meta.image} alt="" className="w-24 h-24 object-cover flex-shrink-0" />}
      <span className="p-2.5 min-w-0">
        <span className="block text-sm font-medium line-clamp-2">{meta.title}</span>
        {meta.description && <span className="block text-xs text-muted-foreground line-clamp-2 mt-0.5">{meta.description}</span>}
        <span className="block text-[11px] text-muted-foreground mt-1 truncate">{new URL(url).hostname}</span>
      </span>
    </a>
  );
}

export function MessageBody({ msg, personOf, renderCall, bubble, own }) {
  const c = String(msg.content || '');
  if (c.startsWith('[voice_memo]')) return <audio controls preload="metadata" src={c.slice(12)} className="h-10 w-60 max-w-full" />;
  if (c.startsWith('[call]')) { const [id, kind] = c.slice(6).split('|'); return renderCall ? renderCall(id, kind, msg) : <span>📞 Call</span>; }
  if (c.startsWith('[file]')) {
    const [url, type, name] = c.slice(6).split('|');
    if (type?.startsWith('image/')) return <FilePreview fileUrl={url} fileName={name} fileType={type} maxWidth="min(320px, 100%)" showCaption={false} />;
    if (type?.startsWith('video/')) return <video src={url} controls className="rounded-2xl w-80 max-w-full max-h-72 bg-black" />;
    const ext = /\.([a-z0-9]{1,5})$/i.exec(name || '')?.[1]?.toUpperCase();
    const mine = bubble && own;
    return (
      <a href={url} target="_blank" rel="noopener noreferrer"
        className={cn('flex items-center gap-3 w-64 max-w-full px-3 py-2.5 transition-colors',
          bubble ? 'rounded-2xl' : 'rounded-xl border bg-background/60 hover:bg-muted/60',
          mine ? 'bg-primary text-primary-foreground rounded-br-md hover:bg-primary/90' : bubble && 'bg-muted text-foreground rounded-bl-md hover:bg-muted/80')}>
        <span className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', mine ? 'bg-white/20' : 'bg-primary/10 text-primary')}><FileText className="w-5 h-5" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium truncate">{name || 'File'}</span>
          <span className={cn('block text-xs', mine ? 'text-primary-foreground/75' : 'text-muted-foreground')}>{ext ? `${ext} · ` : ''}Tap to open</span>
        </span>
      </a>
    );
  }
  const mentionNames = (msg.mentions || []).map((m) => (m.includes('@') ? personOf(m).name : m));
  const firstUrl = c.match(URL_RE)?.[0];
  return <>
    <TextBody text={c} mentionNames={mentionNames} />
    {firstUrl && !bubble && <LinkCard url={firstUrl} />}
  </>;
}

function Reactions({ msg, me, personOf, onReact, align }) {
  if (!msg.reactions?.length) return null;
  return (
    <div className={cn('flex flex-wrap gap-1 mt-1', align === 'right' && 'justify-end')}>
      {msg.reactions.map((r) => {
        const mine = (r.users || []).map(lc).includes(me);
        return (
          <button key={r.emoji} onClick={() => onReact(msg.id, r.emoji)} title={(r.users || []).map((u) => personOf(u).name).join(', ')}
            className={cn('flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors', mine ? 'bg-primary/15 border-primary/40 text-primary' : 'bg-muted/60 border-transparent hover:border-border')}>
            <span>{r.emoji}</span>{r.users.length > 1 && <span>{r.users.length}</span>}
          </button>
        );
      })}
    </div>
  );
}

function Toolbar({ msg, own, canModerate, kind, onReact, onEdit, onDelete, onPin, onThread, align }) {
  const [picker, setPicker] = useState(false);
  const isText = !String(msg.content || '').startsWith('[');
  return (
    <div className={cn('absolute -top-4 z-20 flex items-center gap-0.5 rounded-xl border bg-card shadow-md px-1 py-0.5', align === 'right' ? 'right-2' : 'right-4')} onClick={(e) => e.stopPropagation()}>
      {QUICK.slice(0, 4).map((e) => <button key={e} className="px-1 py-0.5 rounded hover:bg-muted text-base leading-none" onClick={() => onReact(msg.id, e)}>{e}</button>)}
      <span className="relative">
        <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="More reactions" onClick={() => setPicker((x) => !x)}><SmilePlus className="w-4 h-4" /></button>
        {picker && <div className="absolute right-0 top-full mt-1 z-30 rounded-xl border bg-card p-2 shadow-xl"><EmojiPicker onSelect={(e) => { onReact(msg.id, e); setPicker(false); }} /></div>}
      </span>
      {onThread && <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Reply in thread" onClick={() => onThread(msg)}><MessageSquare className="w-4 h-4" /></button>}
      {isText && <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Copy text" onClick={() => navigator.clipboard?.writeText(msg.content)}><Copy className="w-4 h-4" /></button>}
      {kind === 'channel' && canModerate && <button className={cn('p-1.5 rounded hover:bg-muted', msg.pinned ? 'text-amber-500' : 'text-muted-foreground')} title={msg.pinned ? 'Unpin' : 'Pin'} onClick={() => onPin(msg.id, !msg.pinned)}><Pin className="w-4 h-4" /></button>}
      {own && isText && <button className="p-1.5 rounded hover:bg-muted text-muted-foreground" title="Edit" onClick={() => onEdit(msg)}><Pencil className="w-4 h-4" /></button>}
      {(own || (canModerate && kind !== 'dm')) && <button className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive" title="Delete" onClick={() => onDelete(msg)}><Trash2 className="w-4 h-4" /></button>}
    </div>
  );
}


// Phones: press and hold a message (like Messenger). The screen dims, the message stays where it was,
// reactions sit above it and actions below. Tapping anywhere else closes it.
const PRESS_REACTIONS = ['❤️', '😂', '😮', '😢', '😡', '👍'];
const MORE_REACTIONS = ['😍', '🥰', '😊', '🤣', '😅', '😎', '🤔', '🙄', '😬', '😭', '🥳', '🤯', '😴', '🤝', '🙏', '👏', '🙌', '💪', '👀', '🔥', '🎉', '💯', '✅', '❌', '🏡', '🔑', '💰', '📈', '🚀', '⭐', '💙', '💚', '🤞', '👌', '✌️', '🤷'];
function PressMenu({ press, me, canModerate, kind, onReact, onEdit, onDelete, onPin, onThread, onClose, children }) {
  const { msg, rect, own } = press;
  const [more, setMore] = useState(false);
  const isText = !String(msg.content || '').startsWith('[');
  const mineReacted = new Set((msg.reactions || []).filter((r) => (r.users || []).map(lc).includes(me)).map((r) => r.emoji));
  const items = [
    onThread && { label: 'Reply in thread', icon: MessageSquare, run: () => onThread(msg) },
    isText && { label: 'Copy', icon: Copy, run: () => navigator.clipboard?.writeText(msg.content) },
    kind === 'channel' && canModerate && { label: msg.pinned ? 'Unpin' : 'Pin', icon: Pin, run: () => onPin(msg.id, !msg.pinned) },
    own && isText && { label: 'Edit', icon: Pencil, run: () => onEdit(msg) },
    (own || (canModerate && kind !== 'dm')) && { label: 'Delete', icon: Trash2, run: () => onDelete(msg), danger: true },
  ].filter(Boolean);

  // Keep the message where it was; slide it only as far as needed so the bar and menu fit.
  const vh = window.innerHeight; const vw = window.innerWidth;
  const BAR = 60; const GAP = 10; const MENU = more ? 230 : items.length * 52;
  const barW = 7 * 40 + 6 * 4 + 16;
  const bodyH = Math.min(rect.height, vh * 0.4);
  const total = BAR + GAP + bodyH + GAP + MENU;
  const safeTop = 16 + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat')) || 0);
  let top = rect.top - BAR - GAP;
  top = Math.max(safeTop, Math.min(top, vh - total - 16));
  const side = own ? { right: Math.max(12, vw - rect.right) } : { left: Math.max(12, rect.left) };
  const pick = (e) => { onReact(msg.id, e); onClose(); };

  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    const html = document.documentElement; const was = html.style.overflow; html.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', esc); html.style.overflow = was; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] gbh-press-in" onClick={onClose} onContextMenu={(e) => e.preventDefault()}
      style={{ background: 'rgba(0,0,0,0.25)', backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)', touchAction: 'none' }}>
      <div className="absolute flex flex-col gap-2.5" style={{ top, ...side, maxWidth: vw - 24, alignItems: own ? 'flex-end' : 'flex-start' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1 rounded-full bg-card shadow-xl px-2 py-1.5 gbh-press-pop"
          style={own ? { marginRight: Math.min(0, vw - (side.right || 0) - barW - 12) } : { marginLeft: Math.min(0, vw - 12 - ((side.left || 0) + barW)) }}>
          {PRESS_REACTIONS.map((e, i) => (
            <button key={e} onClick={() => pick(e)} style={{ animationDelay: `${i * 25}ms` }}
              className={cn('w-10 h-10 rounded-full text-[28px] leading-none flex items-center justify-center gbh-press-emoji active:scale-125 transition-transform', mineReacted.has(e) && 'bg-muted')}>{e}</button>
          ))}
          <button onClick={() => setMore((x) => !x)} className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-foreground" aria-label="More reactions"><Plus className="w-6 h-6" /></button>
        </div>
        <div className="pointer-events-none overflow-hidden" style={{ width: rect.width, maxHeight: bodyH }}>{children}</div>
        {more ? (
          <div className="w-[300px] max-w-full rounded-2xl bg-card shadow-xl p-2 grid grid-cols-6 gap-1 gbh-press-pop">
            {MORE_REACTIONS.map((e) => <button key={e} onClick={() => pick(e)} className="h-11 rounded-xl text-2xl active:bg-muted">{e}</button>)}
          </div>
        ) : items.length > 0 && (
          <div className="w-64 max-w-full rounded-2xl bg-card/95 shadow-xl overflow-hidden divide-y gbh-press-pop">
            {items.map((it) => (
              <button key={it.label} onClick={() => { onClose(); it.run(); }} className={cn('w-full flex items-center justify-between px-4 h-[52px] text-[17px] active:bg-muted', it.danger ? 'text-red-600' : 'text-foreground')}>
                {it.label}<it.icon className="w-5 h-5" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Press-and-hold and double-tap on touch screens (double-click on computers). */
function usePressHold(onHold, onDouble) {
  const touch = useMemo(() => typeof window !== 'undefined' && !window.matchMedia?.('(hover: hover) and (pointer: fine)').matches, []);
  const t = useRef(null); const start = useRef(null); const fired = useRef(false); const moved = useRef(false); const lastTap = useRef(null);
  const cancel = () => { clearTimeout(t.current); t.current = null; };
  const bind = (payload, getEl) => (!touch ? { onDoubleClick: (e) => { e.preventDefault(); window.getSelection?.()?.removeAllRanges(); onDouble(payload); } } : {
    onTouchStart: (e) => {
      fired.current = false; moved.current = false; const p = e.touches[0]; start.current = { x: p.clientX, y: p.clientY };
      const el = getEl(e);
      cancel(); t.current = setTimeout(() => { fired.current = true; lastTap.current = null; navigator.vibrate?.(8); onHold(payload, el.getBoundingClientRect()); }, 420);
    },
    onTouchMove: (e) => { const p = e.touches[0]; if (start.current && Math.hypot(p.clientX - start.current.x, p.clientY - start.current.y) > 8) { moved.current = true; cancel(); } },
    onTouchEnd: (e) => {
      cancel();
      if (fired.current) { e.preventDefault(); return; }
      if (moved.current) return;
      const now = Date.now(); const id = payload.msg.id;
      if (lastTap.current && lastTap.current.id === id && now - lastTap.current.t < 320) { e.preventDefault(); lastTap.current = null; onDouble(payload); }
      else lastTap.current = { id, t: now };
    },
    onTouchCancel: cancel,
    onContextMenu: (e) => e.preventDefault(),
  });
  return { touch, bind };
}

function EditBox({ msg, onSave, onCancel }) {
  const [v, setV] = useState(msg.content);
  return (
    <div className="w-full max-w-xl">
      <textarea autoFocus value={v} rows={Math.min(6, Math.max(2, v.split('\n').length))} onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSave(v); } if (e.key === 'Escape') onCancel(); }}
        className="w-full rounded-lg border border-primary/50 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 text-foreground" />
      <p className="text-[11px] text-muted-foreground">Enter to save · Esc to cancel</p>
    </div>
  );
}

/**
 * Render with key={conversation} so scroll state starts fresh per conversation.
 * variant 'slack' (channels: rows, names, hover toolbar) or 'bubble' (DMs/groups: Messenger bubbles).
 */
export default function MessageList({ conv, kind, chat, variant = 'slack', canModerate, onThread, threadCounts = {}, renderCall, seenBy, emptyText, intro, firstUnreadAt, typers = [] }) {
  const { messages, loading, hasMore, loadOlder, retry, edit, remove, react, setPinned } = conv;
  const me = chat.me;
  const box = useRef(null);
  const topRef = useRef(null);
  const atBottom = useRef(true);
  const prevLen = useRef(0);
  const restoring = useRef(null);
  const [newBelow, setNewBelow] = useState(0);
  const [hover, setHoverRaw] = useState(null);
  const [press, setPress] = useState(null); // phones: the held message
  const [burst, setBurst] = useState(null); // double-tap: a heart pops on the message
  const { touch, bind } = usePressHold((p, rect) => { setPress({ ...p, rect }); }, ({ msg }) => {
    const hearted = (msg.reactions || []).some((r) => r.emoji === '❤️' && (r.users || []).map(lc).includes(me));
    if (!hearted) react(msg.id, '❤️'); // like Messenger: double-tap adds a heart (it never takes one away)
    setBurst(msg.id); setTimeout(() => setBurst((b) => (b === msg.id ? null : b)), 750);
  });
  // On phones the hover toolbar is replaced by press-and-hold (a tap used to drag the toolbar to whatever you touched).
  const setHover = (id) => { if (!touch) setHoverRaw(id); };
  const [editing, setEditing] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const toBottom = (smooth) => {
    const el = box.current;
    if (el) { if (smooth) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); else el.scrollTop = el.scrollHeight; }
    atBottom.current = true; setNewBelow(0);
  };

  // Keep position when older messages load; follow new ones only if already at the bottom.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    if (restoring.current != null) { el.scrollTop = el.scrollHeight - restoring.current; restoring.current = null; prevLen.current = messages.length; return; }
    const added = messages.length - prevLen.current;
    const last = messages[messages.length - 1];
    // Jump (no animation) so a sent message lands instantly, and the view never ends up mid-scroll.
    if (prevLen.current === 0 || (added > 0 && (atBottom.current || lc(last?.sender_email) === me))) toBottom(false);
    else if (added > 0) setNewBelow((n) => n + added);
    prevLen.current = messages.length;
  }, [messages, me]);

  // Images load after layout; stay pinned to the bottom while they do.
  useEffect(() => {
    const el = box.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => { if (atBottom.current) el.scrollTop = el.scrollHeight; });
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    ro.observe(el); // the list shrinks when the phone keyboard opens: keep the newest message in view
    return () => ro.disconnect();
  }, [loading]);

  useEffect(() => {
    const el = topRef.current;
    if (!el || !hasMore) return undefined;
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting || loadingOlder) return;
      setLoadingOlder(true);
      restoring.current = box.current.scrollHeight - box.current.scrollTop;
      const n = await loadOlder();
      if (!n) restoring.current = null;
      setLoadingOlder(false);
    }, { root: box.current, rootMargin: '200px 0px 0px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadOlder, loadingOlder]);

  const onScroll = () => {
    const el = box.current;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom.current && newBelow) setNewBelow(0);
  };

  const rows = useMemo(() => {
    const out = [];
    let prev = null; let unreadMarked = false;
    for (const m of messages) {
      const d = new Date(m.created_date);
      if (!prev || new Date(prev.created_date).toDateString() !== d.toDateString()) out.push({ type: 'day', key: `day-${d.toDateString()}`, label: dayLabel(d) });
      if (!unreadMarked && firstUnreadAt && m.created_date > firstUnreadAt && lc(m.sender_email) !== me) { out.push({ type: 'new', key: 'new-line' }); unreadMarked = true; }
      const compact = prev && lc(prev.sender_email) === lc(m.sender_email) && d - new Date(prev.created_date) < GROUP_MS && new Date(prev.created_date).toDateString() === d.toDateString() && !String(prev.content).startsWith('[call]');
      out.push({ type: 'msg', key: m.nonce || m.id, m, compact }); // nonce keeps the row steady when the sent copy replaces the draft
      prev = m;
    }
    return out;
  }, [messages, firstUnreadAt, me]);

  const lastMine = [...messages].reverse().find((m) => lc(m.sender_email) === me && !m._failed);

  return (
    <div className="relative flex-1 min-h-0">
      <div ref={box} onScroll={onScroll} className="absolute inset-0 overflow-y-auto overscroll-contain" onClick={() => setHover(null)}>
        <div className="min-h-full flex flex-col">
          <div className="mt-auto" />
          <div ref={topRef} className="h-1" />
          {loadingOlder && <div className="py-3 flex justify-center"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>}
          {!hasMore && !loading && (intro || (messages.length > 0 && <p className="text-center text-xs text-muted-foreground py-4">This is the beginning of the conversation.</p>))}
          {loading ? <div className="flex-1 flex items-center justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            : !messages.length ? <div className={cn('flex items-center justify-center text-sm text-muted-foreground px-6 text-center', intro ? 'pb-6' : 'flex-1 py-16')}>{emptyText || 'No messages yet. Say hi!'}</div>
              : rows.map((r) => {
                if (r.type === 'day') return <div key={r.key} className="flex items-center gap-3 px-4 my-3"><div className="flex-1 h-px bg-border/60" /><span className="text-[11px] font-medium text-muted-foreground">{r.label}</span><div className="flex-1 h-px bg-border/60" /></div>;
                if (r.type === 'new') return <div key={r.key} className="flex items-center gap-3 px-4 my-2"><div className="flex-1 h-px bg-red-400/70" /><span className="text-[11px] font-semibold text-red-500">New</span></div>;
                const m = r.m;
                const own = lc(m.sender_email) === me;
                const person = chat.personOf(m.sender_email, m.sender_name);
                const time = format(new Date(m.created_date), 'h:mm a');
                const showTools = hover === m.id && !editing && !m._pending && !m._failed;
                const tools = showTools && <Toolbar msg={m} own={own} canModerate={canModerate} kind={kind} onReact={react} onEdit={setEditing} onDelete={setConfirmDel} onPin={setPinned} onThread={onThread} align={variant === 'bubble' && own ? 'right' : 'left'} />;
                const status = m._failed ? <button className="text-[11px] text-red-600 flex items-center gap-1" onClick={() => retry(m)}><AlertCircle className="w-3 h-3" /> Not sent. Tap to retry</button> : null;
                const replies = threadCounts[m.id];

                if (variant === 'bubble') {
                  return (
                    <div key={r.key} className={cn('group relative flex gap-2 px-3 sm:px-4', r.compact ? 'mt-0.5' : 'mt-3', own && 'justify-end')}
                      onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)} onClick={(e) => { e.stopPropagation(); setHover(m.id); }}>
                      {!own && <div className="w-8 flex-shrink-0 self-start">{!r.compact && <Avatar person={person} size={32} online={chat.online.has(lc(m.sender_email))} />}</div>}
                      <div className={cn('flex flex-col min-w-0 max-w-[80%] sm:max-w-[65%]', own && 'items-end')}>
                        {!own && !r.compact && kind === 'group' && <span className="text-[11px] text-muted-foreground ml-1 mb-0.5">{person.name}</span>}
                        {editing?.id === m.id ? <EditBox msg={m} onCancel={() => setEditing(null)} onSave={(v) => { edit(m.id, v); setEditing(null); }} /> : (
                          <div title={time} {...(m._pending || m._failed ? {} : bind({ msg: m, own, variant }, (e) => e.currentTarget))}
                            className={cn('rounded-2xl px-3.5 py-2 text-sm leading-relaxed', own ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md', String(m.content).startsWith('[file]') && 'bg-transparent p-0', touch && 'select-none [-webkit-touch-callout:none]', press?.msg.id === m.id && 'invisible')}>
                            <MessageBody msg={m} personOf={chat.personOf} renderCall={renderCall} bubble own={own} />
                          </div>
                        )}
                        <Reactions msg={m} me={me} personOf={chat.personOf} onReact={react} align={own ? 'right' : 'left'} />
                        {(status || m.edited_at) && <div className="flex gap-2 mt-0.5 px-1">{m.edited_at && <span className="text-[11px] text-muted-foreground">edited</span>}{status}</div>}
                        {own && lastMine?.id === m.id && seenBy && <span className="text-[11px] text-muted-foreground mt-0.5 px-1 flex items-center gap-1">{seenBy}</span>}
                      </div>
                      {tools}
                      {burst === m.id && <span className={cn('pointer-events-none absolute top-1/2 -translate-y-1/2 text-5xl gbh-heart-burst z-20', own ? 'right-10' : 'left-14')}>❤️</span>}
                    </div>
                  );
                }

                return (
                  <div key={r.key} className={cn('group relative flex gap-3 px-4 sm:px-5 hover:bg-muted/40', r.compact ? 'py-0.5' : 'pt-2 pb-0.5 mt-1', m.pinned && 'bg-amber-50/70 dark:bg-amber-900/10', touch && 'select-none [-webkit-touch-callout:none]')}
                    {...(m._pending || m._failed ? {} : bind({ msg: m, own, variant, person, time }, (e) => e.currentTarget))}
                    onMouseEnter={() => setHover(m.id)} onMouseLeave={() => setHover(null)} onClick={(e) => { e.stopPropagation(); setHover(m.id); }}>
                    <div className="w-9 flex-shrink-0">
                      {r.compact ? <span className="hidden group-hover:block text-[10px] text-muted-foreground pt-1 text-right">{format(new Date(m.created_date), 'h:mm')}</span>
                        : <Avatar person={person} size={36} online={chat.online.has(lc(m.sender_email))} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      {!r.compact && <div className="flex items-baseline gap-2"><span className="text-sm font-semibold">{person.name}</span><span className="text-[11px] text-muted-foreground">{time}</span>{m.pinned && <span className="text-[11px] text-amber-600 flex items-center gap-0.5"><Pin className="w-3 h-3" /> pinned</span>}</div>}
                      {editing?.id === m.id ? <EditBox msg={m} onCancel={() => setEditing(null)} onSave={(v) => { edit(m.id, v); setEditing(null); }} /> : (
                        <div className="text-sm leading-relaxed text-foreground">
                          <MessageBody msg={m} personOf={chat.personOf} renderCall={renderCall} />
                          {m.edited_at && <span className="text-[11px] text-muted-foreground"> (edited)</span>}
                        </div>
                      )}
                      <Reactions msg={m} me={me} personOf={chat.personOf} onReact={react} />
                      {onThread && replies?.count > 0 && (
                        <button onClick={(e) => { e.stopPropagation(); onThread(m); }} className="mt-1 flex items-center gap-2 text-xs text-primary font-medium hover:underline">
                          <span className="flex -space-x-1.5">{replies.people.slice(0, 3).map((p) => <Avatar key={p} person={chat.personOf(p)} size={18} />)}</span>
                          {replies.count} {replies.count === 1 ? 'reply' : 'replies'}<span className="text-muted-foreground font-normal">Last {format(new Date(replies.last), 'MMM d, h:mm a')}</span>
                        </button>
                      )}
                      {status}
                      {own && lastMine?.id === m.id && seenBy && <p className="text-[11px] text-muted-foreground mt-0.5">{seenBy}</p>}
                    </div>
                    {tools}
                    {burst === m.id && <span className="pointer-events-none absolute left-16 top-1/2 -translate-y-1/2 text-5xl gbh-heart-burst z-20">❤️</span>}
                  </div>
                );
              })}
          {typers.length > 0 && (
            <div className="px-5 py-2 text-xs text-muted-foreground flex items-center gap-2">
              <span className="flex gap-0.5">{[0, 0.15, 0.3].map((d) => <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-bounce" style={{ animationDelay: `${d}s` }} />)}</span>
              {typers.slice(0, 3).join(', ')} {typers.length === 1 ? 'is' : 'are'} typing…
            </div>
          )}
          <div className="h-3" />
        </div>
      </div>
      {newBelow > 0 && (
        <button onClick={() => toBottom(true)} className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-primary text-primary-foreground text-xs font-medium px-3 py-1.5 shadow-lg flex items-center gap-1">
          <ArrowDown className="w-3.5 h-3.5" /> {newBelow} new message{newBelow > 1 ? 's' : ''}
        </button>
      )}
      {press && (
        <PressMenu press={press} me={me} canModerate={canModerate} kind={kind} onReact={react} onEdit={setEditing} onDelete={setConfirmDel} onPin={setPinned} onThread={onThread} onClose={() => setPress(null)}>
          {press.variant === 'bubble' ? (
            <div className={cn('rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-lg w-full', press.own ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-muted text-foreground rounded-bl-md', String(press.msg.content).startsWith('[file]') && 'bg-transparent p-0 shadow-none')}>
              <MessageBody msg={press.msg} personOf={chat.personOf} renderCall={renderCall} bubble own={press.own} />
            </div>
          ) : (
            <div className="rounded-2xl bg-card shadow-lg px-4 py-3 text-sm leading-relaxed">
              <p className="text-sm font-semibold">{press.person?.name} <span className="text-[11px] font-normal text-muted-foreground">{press.time}</span></p>
              <MessageBody msg={press.msg} personOf={chat.personOf} renderCall={renderCall} />
            </div>
          )}
        </PressMenu>
      )}
      {confirmDel && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="rounded-xl border bg-card p-5 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="font-semibold mb-1">Delete this message?</p>
            <p className="text-sm text-muted-foreground mb-4">It's removed for everyone. This can't be undone.</p>
            <div className="flex justify-end gap-2">
              <button className="rounded-lg border px-3 py-1.5 text-sm" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="rounded-lg bg-destructive text-destructive-foreground px-3 py-1.5 text-sm" onClick={() => { remove(confirmDel.id); setConfirmDel(null); }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const SeenIcons = { Check, CheckCheck, Phone, Video };
