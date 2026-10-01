// Voice and video calls (Daily.co): starting, ringing, answering, the call window, and the
// call cards shown inside conversations. Mounted once for the whole app.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, PhoneOff, Video, Minimize2, Maximize2, Loader2, PhoneIncoming, PhoneMissed, NotebookPen } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { cn } from '@/lib/utils';
import { useChat, lc, playTone } from './ChatProvider';
import { Avatar } from '@/components/messaging/MessageList';

const Ctx = createContext(null);
export const useCalls = () => useContext(Ctx);
const RING_MS = 45 * 1000;

let dailyScript;
function loadDaily() {
  if (window.DailyIframe) return Promise.resolve(window.DailyIframe);
  dailyScript ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@daily-co/daily-js';
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.DailyIframe);
    s.onerror = () => { dailyScript = null; reject(new Error('Could not load the call software. Check your connection.')); };
    document.head.appendChild(s);
  });
  return dailyScript;
}

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function DailyFrame({ url, token, video, onLeft, onJoinedOthers }) {
  const box = useRef(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let frame; let gone = false;
    loadDaily().then((Daily) => {
      if (gone || !box.current) return;
      frame = Daily.createFrame(box.current, {
        showLeaveButton: true, showFullscreenButton: true,
        iframeStyle: { position: 'absolute', inset: '0', width: '100%', height: '100%', border: '0', borderRadius: '0' },
      });
      frame.on('left-meeting', () => onLeft?.());
      frame.on('participant-joined', () => onJoinedOthers?.());
      frame.on('error', (e) => setErr(e?.errorMsg || 'Call error'));
      frame.join({ url, token, startVideoOff: !video }).catch((e) => setErr(e?.message || 'Could not join'));
    }).catch((e) => setErr(e.message));
    return () => { gone = true; try { frame?.destroy(); } catch { /* already closed */ } };
  }, [url, token]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div ref={box} className="absolute inset-0 bg-slate-900">
      {err && <div className="absolute inset-0 flex items-center justify-center text-sm text-white/80 p-6 text-center">{err}</div>}
    </div>
  );
}

export function CallProvider({ children }) {
  const chat = useChat();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(null); // { call, token, video }
  const [incoming, setIncoming] = useState(null);
  const [minimized, setMinimized] = useState(false);
  const [big, setBig] = useState(false);
  const [secs, setSecs] = useState(0);
  const [busy, setBusy] = useState(false);
  const currentRef = useRef(null);
  currentRef.current = current;
  const me = chat?.me;

  const ringingForMe = useCallback((c) => c && c.status === 'ringing' && lc(c.created_by_email) !== me
    && (c.invitees || []).some((i) => lc(i.email) === me && i.status === 'ringing') && Date.now() - new Date(c.created_date).getTime() < RING_MS, [me]);

  // Live call changes: incoming rings, answers, hang-ups.
  useEffect(() => {
    if (!chat) return undefined;
    return chat.on('call', ({ type, row }) => {
      if (type === 'DELETE' || !row?.id) return;
      queryClient.setQueryData(['call', row.id], row);
      if (currentRef.current?.call?.id === row.id) setCurrent((c) => (c ? { ...c, call: row } : c));
      if (ringingForMe(row) && currentRef.current?.call?.id !== row.id) setIncoming(row);
      else setIncoming((inc) => (inc?.id === row.id ? null : inc));
    });
  }, [chat, queryClient, ringingForMe]);

  // A call that started ringing while the page was loading.
  useEffect(() => {
    if (!chat?.brokerageId || !me) return;
    base44.entities.Call.filter({ brokerage_id: chat.brokerageId, status: 'ringing' }, '-created_date', 5)
      .then((rows) => { const r = rows.find(ringingForMe); if (r) setIncoming(r); }).catch(() => {});
  }, [chat?.brokerageId, me, ringingForMe]);

  // Ring tone + auto-dismiss.
  useEffect(() => {
    if (!incoming) return undefined;
    playTone({ freq: 620, times: 2, ms: 300, gap: 150, volume: 0.08 });
    const t = setInterval(() => playTone({ freq: 620, times: 2, ms: 300, gap: 150, volume: 0.08 }), 2500);
    const stop = setTimeout(() => setIncoming(null), Math.max(0, RING_MS - (Date.now() - new Date(incoming.created_date).getTime())));
    try {
      if (document.visibilityState !== 'visible' && Notification.permission === 'granted') {
        const n = new Notification(`${incoming.created_by_name || 'Someone'} is calling`, { body: incoming.kind === 'video' ? 'Video call' : 'Voice call', tag: incoming.id, requireInteraction: true });
        n.onclick = () => { window.focus(); n.close(); };
      }
    } catch { /* optional */ }
    return () => { clearInterval(t); clearTimeout(stop); };
  }, [incoming]);

  // Call timer, and give up if nobody answers.
  useEffect(() => {
    if (!current) return undefined;
    setSecs(0);
    const t = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [current?.call?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const c = current?.call;
    if (!c || c.status !== 'ringing' || lc(c.created_by_email) !== me) return undefined;
    const t = setTimeout(() => { base44.functions.invoke('callAction', { callId: c.id, action: 'cancel' }).catch(() => {}); }, Math.max(0, RING_MS - (Date.now() - new Date(c.created_date).getTime())));
    return () => clearTimeout(t);
  }, [current?.call?.status, current?.call?.id, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const open = (data, video) => { setCurrent({ call: data.call, token: data.token, video }); setMinimized(false); setIncoming(null); };

  const start = useCallback(async (kind, key, video = false) => {
    if (currentRef.current) { window.alert("You're already on a call."); return; }
    setBusy(true);
    try { open((await base44.functions.invoke('callStart', { kind, key, video })).data, video); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  }, []);

  const join = useCallback(async (callId, video) => {
    if (currentRef.current?.call?.id === callId) { setMinimized(false); return; }
    if (currentRef.current) { window.alert("You're already on a call."); return; }
    setBusy(true);
    try { const d = (await base44.functions.invoke('callJoin', { callId, video })).data; open(d, video ?? d.call.kind === 'video'); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  }, []);

  const decline = useCallback(async (call) => {
    setIncoming(null);
    base44.functions.invoke('callAction', { callId: call.id, action: 'decline' }).catch(() => {});
  }, []);

  // If I turned on AI notes, ask for them a few times after the call (a scheduled job is the backup).
  const fetchNotesLater = (callId) => {
    let tries = 0;
    const tick = async () => {
      tries += 1;
      const r = await base44.functions.invoke('callNotes', { callId, action: 'summarize' }).catch(() => null);
      if (r?.data?.status === 'pending' && tries < 6) setTimeout(tick, 30000);
    };
    setTimeout(tick, 20000);
  };

  const left = useCallback(() => {
    const c = currentRef.current?.call;
    setCurrent(null); setBig(false);
    if (c) {
      base44.functions.invoke('callAction', { callId: c.id, action: lc(c.created_by_email) === me && c.status === 'ringing' ? 'cancel' : 'leave' }).catch(() => {});
      if (c.notes_status === 'recording' && lc(c.notes_started_by) === me) fetchNotesLater(c.id);
    }
  }, [me]);

  const toggleNotes = async () => {
    const c = currentRef.current?.call;
    if (!c) return;
    if (c.notes_status === 'recording') {
      if (!window.confirm('Stop AI notes? A summary of what was said so far will be posted after the call.')) return;
      await base44.functions.invoke('callNotes', { callId: c.id, action: 'stop' }).catch((e) => window.alert(e.message));
      return;
    }
    if (!window.confirm('Turn on AI notes? Everyone on the call is told it is being transcribed, and a summary with to-dos is posted in the chat afterwards.')) return;
    try { const r = await base44.functions.invoke('callNotes', { callId: c.id, action: 'start' }); setCurrent((x) => (x ? { ...x, call: r.data.call } : x)); }
    catch (e) { window.alert(e.message); }
  };

  const c = current?.call;
  const waiting = c && c.status === 'ringing' && lc(c.created_by_email) === me;
  const ended = c && ['ended', 'missed'].includes(c.status);
  useEffect(() => { if (ended) { const t = setTimeout(() => { setCurrent(null); setBig(false); }, 1500); return () => clearTimeout(t); } return undefined; }, [ended]);
  const others = c ? [c.created_by_email, ...(c.invitees || []).map((i) => i.email)].filter((e) => lc(e) !== me) : [];

  return (
    <Ctx.Provider value={{ start, join, decline, current, busy, inCall: !!current }}>
      {children}

      {incoming && (
        <div className="fixed inset-x-3 top-3 sm:inset-x-auto sm:right-4 sm:top-4 z-[100] sm:w-80 rounded-2xl bg-slate-900 text-white shadow-2xl p-4 animate-in slide-in-from-top">
          <div className="flex items-center gap-3">
            <span className="relative"><span className="absolute inset-0 rounded-full bg-emerald-400/40 animate-ping" /><Avatar person={chat.personOf(incoming.created_by_email)} size={48} /></span>
            <div className="min-w-0">
              <p className="font-semibold truncate">{incoming.created_by_name || chat.personOf(incoming.created_by_email).name}</p>
              <p className="text-xs text-white/70 flex items-center gap-1"><PhoneIncoming className="w-3.5 h-3.5" /> {incoming.kind === 'video' ? 'Video call' : 'Voice call'}{incoming.conversation_kind !== 'dm' ? ` · ${incoming.title}` : ''}</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => decline(incoming)} className="flex-1 rounded-full bg-red-500 hover:bg-red-600 py-2 text-sm font-medium flex items-center justify-center gap-1.5"><PhoneOff className="w-4 h-4" /> Decline</button>
            <button onClick={() => join(incoming.id, false)} className="flex-1 rounded-full bg-emerald-500 hover:bg-emerald-600 py-2 text-sm font-medium flex items-center justify-center gap-1.5"><Phone className="w-4 h-4" /> Answer</button>
            <button onClick={() => join(incoming.id, true)} title="Answer with video" className="rounded-full bg-emerald-500 hover:bg-emerald-600 px-3 py-2"><Video className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {current && (
        <>
          {minimized && (
            <button onClick={() => setMinimized(false)} className="fixed bottom-20 md:bottom-4 right-4 z-[90] rounded-full bg-emerald-600 text-white shadow-xl pl-3 pr-4 py-2 text-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" /> {waiting ? 'Calling…' : `On call · ${fmt(secs)}`}
            </button>
          )}
          <div className={cn('fixed z-[90] bg-slate-900 text-white shadow-2xl overflow-hidden flex flex-col',
            minimized ? 'w-px h-px -left-[9999px] top-0 opacity-0 pointer-events-none'
              : big ? 'inset-2 sm:inset-6 rounded-2xl' : 'inset-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[400px] sm:h-[560px] sm:rounded-2xl')}>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-950/80 text-sm z-10">
              {c.kind === 'video' ? <Video className="w-4 h-4 text-emerald-400" /> : <Phone className="w-4 h-4 text-emerald-400" />}
              <span className="font-medium truncate flex-1">{c.conversation_kind === 'dm' ? chat.personOf(others[0]).name : c.title}</span>
              <span className="text-xs text-white/60 tabular-nums">{waiting ? 'Ringing…' : ended ? 'Call ended' : fmt(secs)}</span>
              {!waiting && !ended && c.conversation_kind !== 'scheduled' && (
                <button className={cn('p-1.5 rounded hover:bg-white/10', c.notes_status === 'recording' && 'text-red-400')} title={c.notes_status === 'recording' ? 'AI notes are on (click to stop)' : 'Turn on AI notes'} onClick={toggleNotes}><NotebookPen className="w-4 h-4" /></button>
              )}
              <button className="p-1.5 rounded hover:bg-white/10" title="Minimize" onClick={() => setMinimized(true)}><Minimize2 className="w-4 h-4" /></button>
              <button className="hidden sm:block p-1.5 rounded hover:bg-white/10" title={big ? 'Smaller' : 'Bigger'} onClick={() => setBig((x) => !x)}><Maximize2 className="w-4 h-4" /></button>
              <button className="p-1.5 rounded-full bg-red-500 hover:bg-red-600" title="Hang up" onClick={left}><PhoneOff className="w-4 h-4" /></button>
            </div>
            {c.notes_status === 'recording' && <div className="bg-red-600/90 text-white text-xs px-3 py-1 flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-white animate-pulse" /> AI notes are on. This call is being transcribed{c.notes_started_by_name ? ` (turned on by ${c.notes_started_by_name})` : ''}.</div>}
            <div className="relative flex-1">
              <DailyFrame url={c.room_url} token={current.token} video={current.video} onLeft={left} />
              {waiting && (
                <div className="absolute inset-x-0 top-0 flex flex-col items-center pt-10 gap-3 pointer-events-none">
                  <span className="relative"><span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" /><Avatar person={chat.personOf(others[0])} size={72} /></span>
                  <p className="text-sm text-white/80">Calling {others.length > 1 ? `${others.length} people` : chat.personOf(others[0]).name}…</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}

/** The card shown in a conversation for a call. */
export function CallCard({ id, kind }) {
  const chat = useChat();
  const calls = useCalls();
  const { data: call } = useQuery({ queryKey: ['call', id], queryFn: () => base44.entities.Call.get(id), staleTime: 60 * 1000 });
  const video = (call?.kind || kind) === 'video';
  const Icon = video ? Video : Phone;
  if (!call) return <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Icon className="w-4 h-4" /> {video ? 'Video' : 'Voice'} call</span>;
  const live = ['ringing', 'active'].includes(call.status) && Date.now() - new Date(call.created_date).getTime() < 4 * 3600 * 1000;
  const mine = lc(call.created_by_email) === chat.me;
  const mins = call.ended_at && call.answered_at ? Math.max(1, Math.round((new Date(call.ended_at) - new Date(call.answered_at)) / 60000)) : null;
  const inThis = calls?.current?.call?.id === id;
  return (
    <div className="inline-flex items-center gap-3 rounded-xl border bg-background/80 text-foreground px-3 py-2">
      <span className={cn('w-9 h-9 rounded-full flex items-center justify-center', live ? 'bg-emerald-100 text-emerald-700' : call.status === 'missed' ? 'bg-red-100 text-red-600' : 'bg-muted text-muted-foreground')}>
        {call.status === 'missed' ? <PhoneMissed className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
      </span>
      <span className="text-sm">
        <span className="font-medium block">{call.status === 'missed' ? (mine ? `${video ? 'Video' : 'Voice'} call, no answer` : `Missed ${video ? 'video' : 'voice'} call`) : live ? `${video ? 'Video' : 'Voice'} call${call.conversation_kind === 'channel' ? ' (huddle)' : ''}` : `${video ? 'Video' : 'Voice'} call ended`}</span>
        <span className="text-xs text-muted-foreground">{live ? `${(call.invitees || []).filter((i) => i.status === 'joined').length + 1} on the call` : mins ? `${mins} min` : `started by ${call.created_by_name || 'someone'}`}</span>
      </span>
      {live && !inThis && <button onClick={() => calls.join(id)} className="rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3 py-1.5">Join</button>}
      {!live && call.conversation_kind !== 'scheduled' && <button onClick={() => calls.start(call.conversation_kind, call.conversation_kind === 'dm' ? (mine ? call.invitees?.[0]?.email : call.created_by_email) : call.conversation_key, video)} className="rounded-full border text-xs font-medium px-3 py-1.5 hover:bg-muted">Call back</button>}
    </div>
  );
}

export function CallButtons({ kind, convKey, className }) {
  const calls = useCalls();
  if (!calls) return null;
  return (
    <span className={cn('flex items-center gap-1', className)}>
      <button disabled={calls.busy} onClick={() => calls.start(kind, convKey, false)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title={kind === 'channel' ? 'Start a voice huddle' : 'Voice call'}>{calls.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}</button>
      <button disabled={calls.busy} onClick={() => calls.start(kind, convKey, true)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground" title="Video call"><Video className="w-4 h-4" /></button>
    </span>
  );
}
