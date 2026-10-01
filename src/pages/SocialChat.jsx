import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Hash, Lock, Search, Pin, Users, Settings2, Bell, X, Loader2, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { base44, supabase } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isAdminRole } from '../../shared/permissions.generated.js';
import { useChat, useRoom, lc } from '@/lib/chat/ChatProvider';
import { useConversation } from '@/lib/chat/useConversation';
import { CallButtons, CallCard } from '@/lib/chat/CallProvider';
import MessageList, { MessageBody, Avatar } from '@/components/messaging/MessageList';
import Composer from '@/components/messaging/Composer';
import CatchUp from '@/components/messaging/CatchUp';
import ChannelMembersManageDialog from '@/components/chat/ChannelMembersManageDialog';

const renderCall = (id, kind) => <CallCard id={id} kind={kind} />;

export default function SocialChat() {
  const { user, brokerageId } = useOutletContext();
  const chat = useChat();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const channel = params.get('channel');
  const threadId = params.get('thread');
  const admin = isAdminRole(user?.role);
  const [panel, setPanel] = useState(null); // 'search' | 'pins' | null
  const [showMembers, setShowMembers] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const { data: channels = [], isLoading: loadingChannels } = useQuery({
    queryKey: ['channels', brokerageId],
    queryFn: () => base44.entities.Channel.filter({ brokerage_id: brokerageId }, 'created_date', 200),
    enabled: !!brokerageId,
  });
  const current = channels.find((c) => c.name === channel);

  // Pick the first channel when none (or one you can't see) is in the link.
  useEffect(() => {
    if (loadingChannels || !channels.length) return;
    if (!channel || !current) navigate(`/SocialChat?channel=${encodeURIComponent(channels[0].name)}`, { replace: true });
  }, [channel, current, channels, loadingChannels, navigate]);

  if (!chat) return null;
  if (!loadingChannels && !channels.length) {
    return <div className="h-[calc(100dvh-4rem)] md:h-[100dvh] flex items-center justify-center text-sm text-muted-foreground p-6 text-center">{admin ? 'No channels yet. Create one with the + next to Channels in the sidebar.' : "You're not in any channels yet."}</div>;
  }
  if (!current) return <div className="h-[100dvh] flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="h-[calc(100dvh-4rem)] md:h-[100dvh] flex overflow-hidden bg-background">
      <ChannelView key={current.name} channel={current} admin={admin} chat={chat} panel={panel} setPanel={setPanel}
        openThread={(m) => setParams((p) => { p.set('thread', m.id); return p; })} onMembers={() => setShowMembers(true)} onSettings={() => setShowSettings(true)} />
      {threadId && (
        <ThreadPanel key={threadId} parentId={threadId} channel={current} chat={chat} admin={admin} onClose={() => setParams((p) => { p.delete('thread'); return p; })} />
      )}
      <ChannelMembersManageDialog open={showMembers} onOpenChange={setShowMembers} channel={current.name} brokerageId={brokerageId} brokerageUsers={chat.peopleList} />
      {showSettings && <ChannelSettings channel={current} onClose={() => setShowSettings(false)} onChanged={(deleted) => { queryClient.invalidateQueries({ queryKey: ['channels', brokerageId] }); if (deleted) navigate('/SocialChat', { replace: true }); }} />}
    </div>
  );
}

function ChannelView({ channel, admin, chat, panel, setPanel, openThread, onMembers, onSettings }) {
  const key = channel.name;
  const room = useRoom(`channel:${key}`);
  const conv = useConversation('channel', key, {
    onSent: (m) => { if (m.mentions?.length) base44.functions.invoke('chatNotify', { kind: 'channel', id: m.id }).catch(() => {}); },
  });

  // Unread "New" line: everything after my last read time.
  const [lastRead, setLastRead] = useState(null);
  useEffect(() => {
    supabase.from('chat_read_state').select('last_read_at').eq('kind', 'channel').eq('conv_key', key).maybeSingle().then(({ data }) => setLastRead(data?.last_read_at || ''));
  }, [key]);

  // Mark read when opened and whenever new messages arrive while I'm looking.
  useEffect(() => {
    chat.setActive({ kind: 'channel', key });
    return () => chat.setActive(null);
  }, [chat, key]);
  const lastId = conv.messages[conv.messages.length - 1]?.id;
  useEffect(() => {
    if (conv.loading) return undefined;
    const t = setTimeout(() => { if (document.visibilityState === 'visible') { chat.markRead('channel', key); room.announceRead(); } }, 600);
    return () => clearTimeout(t);
  }, [lastId, conv.loading, key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = () => { if (document.visibilityState === 'visible') { chat.markRead('channel', key); room.announceRead(); } };
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, [chat, key, room]);

  // Thread reply counts for the visible messages.
  const ids = conv.messages.filter((m) => !m._pending).map((m) => m.id);
  const idKey = ids.join(',');
  const { data: threadCounts = {}, refetch: refetchThreads } = useQuery({
    queryKey: ['thread-counts', key, idKey],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('thread_reply').select('message_id,sender_email,created_date').in('message_id', ids).order('created_date');
      const out = {};
      for (const r of data || []) {
        const x = (out[r.message_id] ||= { count: 0, people: [], last: r.created_date });
        x.count += 1; x.last = r.created_date;
        if (!x.people.includes(lc(r.sender_email))) x.people.push(lc(r.sender_email));
      }
      return out;
    },
  });
  useEffect(() => chat.on('thread_reply', () => refetchThreads()), [chat, refetchThreads]);

  // "Seen by" under my latest message.
  const { data: readers = [], refetch: refetchReaders } = useQuery({
    queryKey: ['readers', 'channel', key],
    queryFn: async () => (await supabase.rpc('chat_readers', { p_kind: 'channel', p_key: key })).data || [],
  });
  useEffect(() => { refetchReaders(); }, [room.seenTick, refetchReaders]);
  const myLast = [...conv.messages].reverse().find((m) => lc(m.sender_email) === chat.me && !m._pending);
  const seen = myLast ? readers.filter((r) => r.user_email !== chat.me && r.last_read_at >= myLast.created_date).map((r) => chat.personOf(r.user_email).name) : [];
  const seenBy = seen.length ? `Seen by ${seen.slice(0, 3).join(', ')}${seen.length > 3 ? ` +${seen.length - 3}` : ''}` : null;

  // People who can be @mentioned here.
  const { data: members = [] } = useQuery({
    queryKey: ['channel-members', key, chat.brokerageId],
    queryFn: () => base44.entities.ChannelMember.filter({ channel_id: key, brokerage_id: chat.brokerageId }, 'created_date', 2000),
    enabled: !!channel.is_private,
  });
  const mentionable = useMemo(() => {
    const allowed = channel.is_private ? new Set(members.map((m) => lc(m.user_email))) : null;
    return chat.peopleList.filter((p) => lc(p.email) !== chat.me && !p.suspended && (!allowed || allowed.has(lc(p.email)) || isAdminRole(p.role)))
      .map((p) => chat.personOf(p.email));
  }, [chat, members, channel.is_private]);
  const onlineHere = mentionable.filter((p) => chat.online.has(p.email)).length + 1;

  const ringBell = () => conv.send(`🔔 ${chat.personOf(chat.me).name} just went under contract! 🎉🏆`, { mentions: [] });

  return (
    <div className="flex-1 min-w-0 flex flex-col relative">
      <header className="flex items-center gap-2 px-4 sm:px-5 py-3 border-b">
        <span className="text-lg">{channel.emoji || (channel.is_private ? '🔒' : '#')}</span>
        <div className="min-w-0 flex-1">
          <h1 className="font-bold truncate flex items-center gap-1">{channel.is_private ? <Lock className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5 text-muted-foreground" />}{channel.label || channel.name}</h1>
          <p className="text-xs text-muted-foreground truncate">{channel.topic || (channel.is_private ? 'Private channel' : 'Everyone in the brokerage')} · <span className="text-emerald-600">{onlineHere} online</span></p>
        </div>
        <CatchUp kind="channel" convKey={key} since={lastRead || undefined} />
        <CallButtons kind="channel" convKey={key} />
        <button className={cn('p-2 rounded-lg hover:bg-muted text-muted-foreground', panel === 'search' && 'bg-muted text-foreground')} title="Search this channel" onClick={() => setPanel(panel === 'search' ? null : 'search')}><Search className="w-4 h-4" /></button>
        <button className={cn('p-2 rounded-lg hover:bg-muted text-muted-foreground', panel === 'pins' && 'bg-muted text-foreground')} title="Pinned messages" onClick={() => setPanel(panel === 'pins' ? null : 'pins')}><Pin className="w-4 h-4" /></button>
        <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Ring the bell (under contract!)" onClick={ringBell}><Bell className="w-4 h-4" /></button>
        {admin && channel.is_private && <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Members" onClick={onMembers}><Users className="w-4 h-4" /></button>}
        {admin && <button className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Channel settings" onClick={onSettings}><Settings2 className="w-4 h-4" /></button>}
      </header>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <MessageList key={key} conv={conv} kind="channel" chat={chat} variant="slack" canModerate={admin} onThread={openThread} threadCounts={threadCounts}
            renderCall={renderCall} seenBy={seenBy} typers={room.typers} firstUnreadAt={lastRead || null}
            emptyText={`This is the start of #${channel.label || channel.name}. Say hello!`} />
          <Composer draftKey={`channel:${key}`} people={mentionable} allowChannel placeholder={`Message #${channel.label || channel.name}`}
            onSend={(text, extra) => conv.send(text, extra)} onTyping={room.typing} onStopTyping={room.stopTyping} />
        </div>
        {panel && <SidePanel kind={panel} channel={channel} chat={chat} onClose={() => setPanel(null)} />}
      </div>
    </div>
  );
}

function SidePanel({ kind, channel, chat, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const run = useCallback(async () => {
    let query = supabase.from('social_message').select('*').eq('brokerage_id', chat.brokerageId).eq('channel', channel.name).order('created_date', { ascending: false }).limit(50);
    if (kind === 'pins') query = query.eq('pinned', true);
    else if (q.trim().length >= 2) query = query.ilike('content', `%${q.trim().replace(/[%_]/g, '')}%`);
    else { setResults(null); return; }
    const { data } = await query;
    setResults((data || []).map((r) => ({ ...(r.extra || {}), ...r })));
  }, [kind, q, channel.name, chat.brokerageId]);
  useEffect(() => { if (kind === 'pins') run(); }, [kind, run]);
  useEffect(() => { if (kind !== 'search') return undefined; const t = setTimeout(run, 300); return () => clearTimeout(t); }, [q, kind, run]);
  return (
    <aside className="hidden md:flex w-80 border-l flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <p className="font-semibold flex-1">{kind === 'pins' ? 'Pinned' : 'Search'}</p>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>
      {kind === 'search' && <div className="p-3 border-b"><Input autoFocus placeholder={`Search #${channel.label || channel.name}`} value={q} onChange={(e) => setQ(e.target.value)} /></div>}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {results == null ? <p className="text-xs text-muted-foreground">{kind === 'search' ? 'Type at least 2 letters.' : ''}</p>
          : !results.length ? <p className="text-xs text-muted-foreground">{kind === 'pins' ? 'Nothing pinned yet. Admins can pin from a message\'s menu.' : 'No matches.'}</p>
            : results.map((m) => (
              <div key={m.id} className="rounded-lg border p-2.5">
                <div className="flex items-center gap-2 mb-1"><Avatar person={chat.personOf(m.sender_email)} size={20} /><span className="text-xs font-medium">{chat.personOf(m.sender_email).name}</span><span className="text-[11px] text-muted-foreground ml-auto">{format(new Date(m.created_date), 'MMM d, h:mm a')}</span></div>
                <div className="text-sm"><MessageBody msg={m} personOf={chat.personOf} renderCall={renderCall} /></div>
              </div>
            ))}
      </div>
    </aside>
  );
}

function ThreadPanel({ parentId, channel, chat, admin, onClose }) {
  const [parent, setParent] = useState(null);
  useEffect(() => { base44.entities.SocialMessage.get(parentId).then(setParent).catch(() => setParent(false)); }, [parentId]);
  const room = useRoom(`thread:${parentId}`);
  const conv = useConversation('thread', parentId, {
    onSent: (m) => base44.functions.invoke('chatNotify', { kind: 'thread', id: m.id }).catch(() => {}),
  });
  const people = useMemo(() => chat.peopleList.filter((p) => lc(p.email) !== chat.me && !p.suspended).map((p) => chat.personOf(p.email)), [chat]);
  return (
    <aside className="fixed inset-0 z-40 md:static md:z-auto md:w-[380px] border-l flex flex-col bg-background">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <MessageSquare className="w-4 h-4" /><p className="font-semibold flex-1">Thread <span className="text-xs text-muted-foreground font-normal">#{channel.label || channel.name}</span></p>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
      </div>
      {parent === false ? <p className="p-4 text-sm text-muted-foreground">This message was deleted.</p> : parent && (
        <div className="px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2 mb-1"><Avatar person={chat.personOf(parent.sender_email)} size={24} /><span className="text-sm font-semibold">{chat.personOf(parent.sender_email).name}</span><span className="text-[11px] text-muted-foreground">{format(new Date(parent.created_date), 'MMM d, h:mm a')}</span></div>
          <div className="text-sm"><MessageBody msg={parent} personOf={chat.personOf} renderCall={renderCall} /></div>
        </div>
      )}
      <MessageList key={parentId} conv={conv} kind="thread" chat={chat} variant="slack" canModerate={admin} typers={room.typers} emptyText="No replies yet." renderCall={renderCall} />
      <Composer draftKey={`thread:${parentId}`} people={people} placeholder="Reply…" onSend={(t, extra) => conv.send(t, extra)} onTyping={room.typing} onStopTyping={room.stopTyping} />
    </aside>
  );
}

function ChannelSettings({ channel, onClose, onChanged }) {
  const [label, setLabel] = useState(channel.label || channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [emoji, setEmoji] = useState(channel.emoji || '💬');
  const [priv, setPriv] = useState(!!channel.is_private);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await base44.entities.Channel.update(channel.id, { label: label.trim() || channel.name, topic: topic.trim(), emoji, is_private: priv }); onChanged(false); onClose(); }
    catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  const del = async () => {
    if (!window.confirm(`Delete #${channel.label || channel.name}? Its messages stay in the database but nobody will see the channel.`)) return;
    await base44.entities.Channel.delete(channel.id); onChanged(true); onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Channel settings</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex gap-2"><Input className="w-16 text-center" value={emoji} onChange={(e) => setEmoji(e.target.value.slice(0, 4))} /><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" /></div>
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Topic (shown under the name)" />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={priv} onChange={(e) => setPriv(e.target.checked)} /><span><b>Private</b><br /><span className="text-muted-foreground">Only members you add (and admins) can see it. Public channels are open to everyone in the brokerage.</span></span></label>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-red-600" onClick={del}>Delete channel</Button>
          <div className="flex gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>Save</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
