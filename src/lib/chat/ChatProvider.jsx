// One live connection per signed-in user that powers all messaging: channel messages,
// DMs, group chats, threads and calls arrive here once and are handed to whichever
// screen is listening. Also keeps unread badges, who's online, and desktop alerts.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, base44 } from '@/api/base44Client';
import { fromRow } from '../../../shared/entities.js';

const Ctx = createContext(null);
export const useChat = () => useContext(Ctx);

const TABLES = ['social_message', 'thread_reply', 'direct_message', 'group_message', 'group_chat', 'call', 'channel', 'channel_member'];
export const lc = (e) => String(e || '').toLowerCase();

// Short "ping" without shipping an audio file.
let audioCtx;
export function playTone({ freq = 880, ms = 140, times = 1, gap = 90, volume = 0.06 } = {}) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let i = 0; i < times; i += 1) {
      const t = audioCtx.currentTime + i * (ms + gap) / 1000;
      const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = freq; g.gain.setValueAtTime(volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
      o.connect(g); g.connect(audioCtx.destination); o.start(t); o.stop(t + ms / 1000 + 0.02);
    }
  } catch { /* sound is optional */ }
}

export function preview(content) {
  const c = String(content || '');
  if (c.startsWith('[voice_memo]')) return '🎤 Voice message';
  if (c.startsWith('[file]')) { const [, type, name] = c.slice(6).split('|'); return type?.startsWith('image/') ? '📷 Photo' : `📎 ${name || 'File'}`; }
  if (c.startsWith('[call]')) return '📞 Call';
  return c.slice(0, 140);
}

export function ChatProvider({ user, children }) {
  const queryClient = useQueryClient();
  const b = user?.brokerage_id || null;
  const me = lc(user?.email);
  const listeners = useRef(new Map());
  const active = useRef(null); // { kind, key } on screen right now
  const [online, setOnline] = useState(() => new Set());

  // Everyone in the brokerage, for names and photos.
  const { data: peopleList = [] } = useQuery({
    queryKey: ['chat-people', b],
    queryFn: () => base44.entities.User.filter({ brokerage_id: b }, 'full_name', 2000),
    enabled: !!b,
    staleTime: 5 * 60 * 1000,
  });
  const people = useMemo(() => new Map(peopleList.map((p) => [lc(p.email), p])), [peopleList]);
  const personOf = useCallback((email) => {
    const p = people.get(lc(email));
    return { email: lc(email), name: p?.display_name || p?.full_name || email || 'Someone', photo: p?.headshot || null, id: p?.id, role: p?.role };
  }, [people]);

  // Unread badges.
  const { data: unreadRows = [], refetch: refetchUnread } = useQuery({
    queryKey: ['chat-unread', me, b],
    queryFn: async () => { const { data, error } = await supabase.rpc('chat_unread'); if (error) throw error; return data || []; },
    enabled: !!b && !!me,
    staleTime: 30 * 1000,
  });
  const unread = useMemo(() => {
    const m = new Map();
    for (const r of unreadRows) m.set(`${r.kind}:${r.conv_key}`, r);
    if (active.current) m.delete(`${active.current.kind}:${active.current.key}`);
    return m;
  }, [unreadRows]);
  const totals = useMemo(() => {
    let channels = 0; let dms = 0; let mentions = 0;
    for (const [k, r] of unread) {
      if (k.startsWith('channel:')) { channels += r.unread ? 1 : 0; mentions += r.mentions || 0; } else dms += r.unread || 0;
    }
    return { channels, dms, mentions };
  }, [unread]);
  const refreshTimer = useRef(null);
  const refreshUnreadSoon = useCallback(() => {
    clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => refetchUnread(), 500);
  }, [refetchUnread]);

  const on = useCallback((table, cb) => {
    if (!listeners.current.has(table)) listeners.current.set(table, new Set());
    listeners.current.get(table).add(cb);
    return () => listeners.current.get(table)?.delete(cb);
  }, []);

  const markRead = useCallback(async (kind, key) => {
    if (!key) return;
    queryClient.setQueryData(['chat-unread', me, b], (rows = []) => rows.filter((r) => !(r.kind === kind && r.conv_key === key)));
    const { error } = await supabase.rpc('chat_mark_read', { p_kind: kind, p_key: key });
    if (error) console.warn('mark read', error.message);
  }, [queryClient, me, b]);

  const setActive = useCallback((conv) => { active.current = conv; }, []);

  // Desktop alerts for things meant for me, when I'm not looking at that conversation.
  const alert = useCallback((title, body, link) => {
    playTone({ freq: 760, times: 2, ms: 90 });
    if (document.visibilityState === 'visible') return;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        const n = new Notification(title, { body, icon: '/favicon.ico', tag: link });
        n.onclick = () => { window.focus(); if (link) window.location.assign(link); n.close(); };
      }
    } catch { /* not supported */ }
  }, []);

  useEffect(() => {
    if (!b || !me) return undefined;
    const ch = supabase.channel(`chat-db:${b}:${me}:${Math.random().toString(36).slice(2, 7)}`);
    for (const table of TABLES) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table }, (payload) => {
        const row = payload.eventType === 'DELETE' ? payload.old : fromRow(payload.new);
        const evt = { type: payload.eventType, row, old: payload.old };
        listeners.current.get(table)?.forEach((cb) => { try { cb(evt); } catch (e) { console.error(e); } });
        if (payload.eventType !== 'INSERT') return;
        if (!['social_message', 'direct_message', 'group_message', 'thread_reply'].includes(table)) return;
        if (lc(row.sender_email) === me) return;
        refreshUnreadSoon();
        const here = active.current;
        const looking = document.visibilityState === 'visible';
        const who = row.sender_name || personOf(row.sender_email).name;
        if (table === 'direct_message' && lc(row.receiver_email) === me) {
          if (!(looking && here?.kind === 'dm' && here.key === lc(row.sender_email))) alert(who, preview(row.content), `/DirectMessages?dm=${encodeURIComponent(lc(row.sender_email))}`);
        } else if (table === 'group_message') {
          if (!(looking && here?.kind === 'group' && here.key === row.group_id)) alert(`${who} (group)`, preview(row.content), `/DirectMessages?group=${row.group_id}`);
        } else if (table === 'social_message' && Array.isArray(row.mentions) && (row.mentions.includes(me) || row.mentions.includes('channel'))) {
          if (!(looking && here?.kind === 'channel' && here.key === row.channel)) alert(`${who} in #${row.channel}`, preview(row.content), `/SocialChat?channel=${encodeURIComponent(row.channel)}`);
        }
      });
    }
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [b, me, alert, personOf, refreshUnreadSoon]);

  // Who's online.
  useEffect(() => {
    if (!b || !me) return undefined;
    const ch = supabase.channel(`presence:${b}`, { config: { presence: { key: me } } });
    ch.on('presence', { event: 'sync' }, () => setOnline(new Set(Object.keys(ch.presenceState()))));
    ch.subscribe(async (status) => { if (status === 'SUBSCRIBED') await ch.track({ at: Date.now() }); });
    return () => { supabase.removeChannel(ch); };
  }, [b, me]);

  // Ask once for desktop notification permission, on the first click anywhere.
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'default') return undefined;
    const ask = () => { Notification.requestPermission().catch(() => {}); window.removeEventListener('click', ask); };
    window.addEventListener('click', ask);
    return () => window.removeEventListener('click', ask);
  }, []);

  const value = useMemo(() => ({
    user, me, brokerageId: b, people, peopleList, personOf, online, unread, totals, on, markRead, setActive, refreshUnread: refetchUnread,
  }), [user, me, b, people, peopleList, personOf, online, unread, totals, on, markRead, setActive, refetchUnread]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// "Ann is typing…" and live "seen" updates for one conversation, over a broadcast channel.
export function useRoom(roomKey) {
  const chat = useChat();
  const [typers, setTypers] = useState({});
  const [seenTick, setSeenTick] = useState(0);
  const chRef = useRef(null);
  const last = useRef(0);
  useEffect(() => {
    if (!roomKey || !chat?.brokerageId) return undefined;
    const ch = supabase.channel(`room:${chat.brokerageId}:${roomKey}`, { config: { broadcast: { self: false } } });
    const timers = {};
    ch.on('broadcast', { event: 'typing' }, ({ payload }) => {
      if (!payload?.email) return;
      setTypers((t) => ({ ...t, [payload.email]: payload.name }));
      clearTimeout(timers[payload.email]);
      timers[payload.email] = setTimeout(() => setTypers((t) => { const n = { ...t }; delete n[payload.email]; return n; }), 4000);
    });
    ch.on('broadcast', { event: 'stop' }, ({ payload }) => setTypers((t) => { const n = { ...t }; delete n[payload?.email]; return n; }));
    ch.on('broadcast', { event: 'read' }, () => setSeenTick((x) => x + 1));
    ch.subscribe();
    chRef.current = ch;
    return () => { Object.values(timers).forEach(clearTimeout); supabase.removeChannel(ch); chRef.current = null; setTypers({}); };
  }, [roomKey, chat?.brokerageId]);
  const typing = useCallback(() => {
    const now = Date.now();
    if (now - last.current < 2000) return;
    last.current = now;
    chRef.current?.send({ type: 'broadcast', event: 'typing', payload: { email: chat.me, name: chat.personOf(chat.me).name } });
  }, [chat]);
  const stopTyping = useCallback(() => { last.current = 0; chRef.current?.send({ type: 'broadcast', event: 'stop', payload: { email: chat?.me } }); }, [chat]);
  const announceRead = useCallback(() => chRef.current?.send({ type: 'broadcast', event: 'read', payload: { email: chat?.me } }), [chat]);
  return { typers: Object.values(typers), typing, stopTyping, announceRead, seenTick };
}
