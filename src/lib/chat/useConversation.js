// Loads one conversation (channel, DM, group or thread), keeps it live, and sends
// messages instantly (shown right away, confirmed when the database saves them).
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, base44 } from '@/api/base44Client';
import { fromRow } from '../../../shared/entities.js';
import { useChat, lc } from './ChatProvider';

export const TABLE = { channel: 'social_message', dm: 'direct_message', group: 'group_message', thread: 'thread_reply' };
const ENTITY = { channel: 'SocialMessage', dm: 'DirectMessage', group: 'GroupMessage', thread: 'ThreadReply' };
const PAGE = 50;

function scoped(kind, key, me, b) {
  let q = supabase.from(TABLE[kind]).select('*');
  if (kind === 'channel') q = q.eq('brokerage_id', b).eq('channel', key);
  if (kind === 'dm') q = q.or(`and(sender_email.eq.${me},receiver_email.eq.${key}),and(sender_email.eq.${key},receiver_email.eq.${me})`);
  if (kind === 'group') q = q.eq('group_id', key);
  if (kind === 'thread') q = q.eq('message_id', key);
  return q;
}

export function belongs(kind, key, me, row) {
  if (!row) return false;
  if (kind === 'channel') return row.channel === key;
  if (kind === 'dm') {
    const s = lc(row.sender_email); const r = lc(row.receiver_email);
    return (s === me && r === key) || (s === key && r === me);
  }
  if (kind === 'group') return row.group_id === key;
  if (kind === 'thread') return row.message_id === key;
  return false;
}

const byTime = (a, b) => String(a.created_date).localeCompare(String(b.created_date));

export function useConversation(kind, key, { onSent } = {}) {
  const chat = useChat();
  const me = chat?.me;
  const b = chat?.brokerageId;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState(null);
  const keyRef = useRef(`${kind}:${key}`);
  keyRef.current = `${kind}:${key}`;

  // First page (newest 50, shown oldest-first).
  useEffect(() => {
    if (!kind || !key || !me) return undefined;
    let cancelled = false;
    setLoading(true); setMessages([]); setError(null);
    scoped(kind, key, me, b).order('created_date', { ascending: false }).limit(PAGE).then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setMessages((data || []).map(fromRow).reverse());
      setHasMore((data || []).length === PAGE);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [kind, key, me, b]);

  const loadOlder = useCallback(async () => {
    const oldest = messages.find((m) => !m._pending);
    if (!oldest) return 0;
    const { data, error: err } = await scoped(kind, key, me, b).lt('created_date', oldest.created_date).order('created_date', { ascending: false }).limit(PAGE);
    if (err) return 0;
    const older = (data || []).map(fromRow).reverse();
    setMessages((cur) => [...older.filter((o) => !cur.some((c) => c.id === o.id)), ...cur]);
    setHasMore(older.length === PAGE);
    return older.length;
  }, [messages, kind, key, me, b]);

  // Live changes.
  useEffect(() => {
    if (!chat || !kind || !key) return undefined;
    return chat.on(TABLE[kind], ({ type, row }) => {
      if (keyRef.current !== `${kind}:${key}`) return;
      if (type === 'DELETE') { setMessages((cur) => cur.filter((m) => m.id !== row?.id)); return; }
      if (!belongs(kind, key, me, row)) return;
      setMessages((cur) => {
        const nonce = row.nonce || row.extra?.nonce;
        const i = cur.findIndex((m) => m.id === row.id || (nonce && m.nonce === nonce));
        // Keep the draft's nonce so the bubble on screen is updated in place, not redrawn.
        if (i >= 0) { const n = [...cur]; n[i] = { ...row, nonce: cur[i].nonce || nonce }; return n; }
        if (type !== 'INSERT') return cur;
        return [...cur, row].sort(byTime);
      });
    });
  }, [chat, kind, key, me]);

  const send = useCallback(async (content, extra = {}) => {
    const text = String(content || '').trim();
    if (!text) return null;
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const mine = chat.personOf(me);
    const base = { brokerage_id: b, sender_email: me, sender_name: mine.name, sender_photo: mine.photo || '', content: text, nonce, reactions: [], ...extra };
    if (kind === 'channel') Object.assign(base, { channel: key, mentions: extra.mentions || [] });
    if (kind === 'group') Object.assign(base, { group_id: key, mentions: extra.mentions || [] });
    if (kind === 'thread') Object.assign(base, { message_id: key, mentions: extra.mentions || [] });
    if (kind === 'dm') {
      const other = chat.personOf(key);
      Object.assign(base, { sender_id: chat.user?.id, receiver_id: other.id || null, receiver_email: key, receiver_name: other.name, receiver_photo: other.photo || '', read: false });
      delete base.mentions;
    }
    const temp = { ...base, id: `tmp-${nonce}`, created_date: new Date().toISOString(), _pending: true };
    setMessages((cur) => [...cur, temp]);
    try {
      const saved = await base44.entities[ENTITY[kind]].create(base);
      setMessages((cur) => {
        const exists = cur.some((m) => m.id === saved.id);
        return exists ? cur.filter((m) => m.id !== temp.id) : cur.map((m) => (m.id === temp.id ? { ...saved, nonce } : m));
      });
      onSent?.(saved);
      return saved;
    } catch (err) {
      setMessages((cur) => cur.map((m) => (m.id === temp.id ? { ...m, _pending: false, _failed: err.message || 'Not sent' } : m)));
      return null;
    }
  }, [chat, me, b, kind, key, onSent]);

  const retry = useCallback(async (msg) => {
    setMessages((cur) => cur.filter((m) => m.id !== msg.id));
    const { content, mentions } = msg;
    return send(content, mentions ? { mentions } : {});
  }, [send]);

  const edit = useCallback(async (id, content) => {
    const text = String(content || '').trim();
    if (!text) return;
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, content: text, edited_at: new Date().toISOString() } : m)));
    try { await base44.entities[ENTITY[kind]].update(id, { content: text, edited_at: new Date().toISOString() }); } catch (err) { window.alert(err.message); }
  }, [kind]);

  const remove = useCallback(async (id) => {
    const prev = messages;
    setMessages((cur) => cur.filter((m) => m.id !== id));
    try { await base44.entities[ENTITY[kind]].delete(id); } catch (err) { setMessages(prev); window.alert(err.message); }
  }, [kind, messages]);

  const react = useCallback(async (id, emoji) => {
    setMessages((cur) => cur.map((m) => {
      if (m.id !== id) return m;
      const rs = (m.reactions || []).map((r) => ({ ...r, users: [...(r.users || [])] }));
      const r = rs.find((x) => x.emoji === emoji);
      if (!r) rs.push({ emoji, users: [me] });
      else if (r.users.map(lc).includes(me)) r.users = r.users.filter((u) => lc(u) !== me);
      else r.users.push(me);
      return { ...m, reactions: rs.filter((x) => x.users.length) };
    }));
    const { data, error: err } = await supabase.rpc('chat_toggle_reaction', { p_kind: TABLE[kind], p_id: id, p_emoji: emoji });
    if (!err) setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, reactions: data } : m)));
  }, [kind, me]);

  const setPinned = useCallback(async (id, pinned) => {
    setMessages((cur) => cur.map((m) => (m.id === id ? { ...m, pinned } : m)));
    try { await base44.entities.SocialMessage.update(id, { pinned, pinned_by: pinned ? me : null }); } catch (err) { window.alert(err.message); }
  }, [me]);

  return { messages, loading, hasMore, error, loadOlder, send, retry, edit, remove, react, setPinned };
}
