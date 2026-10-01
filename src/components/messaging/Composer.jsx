import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Paperclip, Smile, Loader2, X, Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import EmojiPicker from '@/components/chat/EmojiPicker';
import { Avatar } from './MessageList';

const MAX_FILE = 25 * 1024 * 1024;

/**
 * onSend(text, { mentions }) for text; files and voice memos are sent as their own messages.
 * people: [{ email, name, photo }] who can be @mentioned. allowChannel adds @channel.
 */
export default function Composer({ onSend, people = [], allowChannel, placeholder, disabled, onTyping, onStopTyping, onEditLast, draftKey }) {
  const [text, setText] = useState(() => { try { return sessionStorage.getItem(`draft:${draftKey}`) || ''; } catch { return ''; } });
  const [picked, setPicked] = useState([]);
  const [query, setQuery] = useState(null);
  const [hi, setHi] = useState(0);
  const [emoji, setEmoji] = useState(false);
  const [uploads, setUploads] = useState([]); // [{ name, done, error }]
  const [dragging, setDragging] = useState(false);
  const [rec, setRec] = useState(null); // { recorder, started }
  const [recSecs, setRecSecs] = useState(0);
  const ta = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { try { if (text) sessionStorage.setItem(`draft:${draftKey}`, text); else sessionStorage.removeItem(`draft:${draftKey}`); } catch { /* ignore */ } }, [text, draftKey]);
  useEffect(() => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 180)}px`; }, [text]);
  useEffect(() => { if (!rec) return undefined; const t = setInterval(() => setRecSecs(Math.round((Date.now() - rec.started) / 1000)), 500); return () => clearInterval(t); }, [rec]);

  const options = useMemo(() => {
    if (query == null) return [];
    const q = query.toLowerCase();
    const list = [...(allowChannel ? [{ email: 'channel', name: 'channel', hint: 'Notify everyone here' }] : []), ...people];
    return list.filter((p) => `${p.name} ${p.email}`.toLowerCase().includes(q)).slice(0, 7);
  }, [people, query, allowChannel]);

  const change = (e) => {
    const v = e.target.value;
    setText(v);
    const m = v.slice(0, e.target.selectionStart).match(/(?:^|\s)@([\w.'-]*)$/);
    setQuery(m ? m[1] : null); setHi(0);
    if (v.trim()) onTyping?.();
  };
  const choose = (p) => {
    const el = ta.current; const caret = el?.selectionStart ?? text.length;
    const before = text.slice(0, caret).replace(/@([\w.'-]*)$/, `@${p.name} `);
    setText(before + text.slice(caret));
    setPicked((x) => (x.some((y) => y.email === p.email) ? x : [...x, p]));
    setQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(before.length, before.length); });
  };
  const submit = () => {
    const v = text.trim();
    if (!v || disabled) return;
    const mentions = picked.filter((p) => v.includes(`@${p.name}`)).map((p) => p.email);
    onSend(v, { mentions });
    setText(''); setPicked([]); setQuery(null); setEmoji(false);
    onStopTyping?.();
  };
  const key = (e) => {
    if (options.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => (h + 1) % options.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => (h - 1 + options.length) % options.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(options[hi]); return; }
      if (e.key === 'Escape') { setQuery(null); return; }
    }
    if (e.key === 'ArrowUp' && !text && onEditLast) { e.preventDefault(); onEditLast(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };

  const sendFiles = async (files) => {
    for (const file of [...files].slice(0, 10)) {
      if (file.size > MAX_FILE) { window.alert(`${file.name} is over 25 MB.`); continue; }
      const id = `${file.name}-${Date.now()}`;
      setUploads((u) => [...u, { id, name: file.name }]);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await onSend(`[file]${file_url}|${file.type || 'application/octet-stream'}|${file.name.replace(/\|/g, '-')}`, {});
        setUploads((u) => u.filter((x) => x.id !== id));
      } catch (err) {
        setUploads((u) => u.map((x) => (x.id === id ? { ...x, error: err.message || 'Upload failed' } : x)));
      }
    }
  };
  const paste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); sendFiles(files); }
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => window.MediaRecorder?.isTypeSupported?.(t)) || '';
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      const chunks = [];
      recorder.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recorder._cancel || !chunks.length) return;
        const type = recorder.mimeType || 'audio/webm';
        const file = new File([new Blob(chunks, { type })], `voice-${Date.now()}.${type.includes('mp4') ? 'm4a' : 'webm'}`, { type });
        setUploads((u) => [...u, { id: 'voice', name: 'Voice message' }]);
        try { const { file_url } = await base44.integrations.Core.UploadFile({ file }); await onSend(`[voice_memo]${file_url}`, {}); } catch (err) { window.alert(err.message); }
        setUploads((u) => u.filter((x) => x.id !== 'voice'));
      };
      recorder.start();
      setRec({ recorder, started: Date.now() }); setRecSecs(0);
    } catch { window.alert('Allow microphone access to record a voice message.'); }
  };
  const stopRec = (cancel) => { if (!rec) return; rec.recorder._cancel = cancel; rec.recorder.stop(); setRec(null); };

  return (
    <div className={cn('relative border-t bg-background px-3 sm:px-4 py-3', dragging && 'ring-2 ring-primary ring-inset')}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) sendFiles(e.dataTransfer.files); }}>
      {uploads.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {uploads.map((u) => (
            <span key={u.id} className={cn('flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs', u.error && 'border-red-300 text-red-700')}>
              {!u.error && <Loader2 className="w-3 h-3 animate-spin" />}{u.name}{u.error && `: ${u.error}`}
              {u.error && <button onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))}><X className="w-3 h-3" /></button>}
            </span>
          ))}
        </div>
      )}
      {options.length > 0 && (
        <ul className="absolute bottom-full left-3 mb-1 w-72 rounded-xl border bg-popover shadow-xl py-1 z-30">
          {options.map((p, i) => (
            <li key={p.email}><button type="button" onMouseDown={(e) => { e.preventDefault(); choose(p); }} className={cn('w-full flex items-center gap-2 px-3 py-1.5 text-left text-sm', i === hi && 'bg-muted')}>
              {p.email === 'channel' ? <span className="w-6 h-6 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold">@</span> : <Avatar person={p} size={24} />}
              <span className="font-medium">{p.email === 'channel' ? '@channel' : p.name}</span><span className="text-xs text-muted-foreground truncate">{p.hint || p.email}</span>
            </button></li>
          ))}
        </ul>
      )}
      {emoji && <div className="absolute bottom-full right-3 mb-1 z-30 rounded-xl border bg-card p-2 shadow-xl"><EmojiPicker onSelect={(e) => { setText((t) => t + e); setEmoji(false); ta.current?.focus(); }} /></div>}
      {rec ? (
        <div className="flex items-center gap-3 rounded-2xl border bg-red-50 dark:bg-red-950/30 px-4 py-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span className="text-sm font-medium flex-1">Recording {Math.floor(recSecs / 60)}:{String(recSecs % 60).padStart(2, '0')}</span>
          <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => stopRec(true)}>Cancel</button>
          <button className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm flex items-center gap-1" onClick={() => stopRec(false)}><Square className="w-3.5 h-3.5" /> Send</button>
        </div>
      ) : (
        <div className="flex items-end gap-1.5 rounded-2xl border bg-muted/40 focus-within:border-primary/50 focus-within:bg-background px-2 py-1.5">
          <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => { sendFiles(e.target.files); e.target.value = ''; }} />
          <button type="button" className="p-2 rounded-full hover:bg-muted text-muted-foreground" title="Attach files" disabled={disabled} onClick={() => fileRef.current?.click()}><Paperclip className="w-4 h-4" /></button>
          <textarea ref={ta} rows={1} value={text} onChange={change} onKeyDown={key} onPaste={paste} onBlur={() => onStopTyping?.()} disabled={disabled}
            placeholder={placeholder} className="flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none max-h-[180px] placeholder:text-muted-foreground/70" />
          <button type="button" className="p-2 rounded-full hover:bg-muted text-muted-foreground" title="Emoji" onClick={() => setEmoji((x) => !x)}><Smile className="w-4 h-4" /></button>
          {text.trim() ? (
            <button type="button" onClick={submit} disabled={disabled} className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" title="Send (Enter)"><Send className="w-4 h-4" /></button>
          ) : (
            <button type="button" onClick={startRec} disabled={disabled} className="p-2 rounded-full hover:bg-muted text-muted-foreground" title="Record a voice message"><Mic className="w-4 h-4" /></button>
          )}
        </div>
      )}
      <p className="hidden sm:block text-[10px] text-muted-foreground mt-1 px-2">Enter to send · Shift+Enter for a new line · @ to mention · drop or paste files</p>
    </div>
  );
}
