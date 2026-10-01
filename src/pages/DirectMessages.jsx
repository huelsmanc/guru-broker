import React, { useEffect, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, PenSquare, Users, X, Check, LogOut, UserPlus, Pencil } from 'lucide-react';
import { format, isToday, isThisWeek } from 'date-fns';
import { base44, supabase } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChat, useRoom, lc, preview } from '@/lib/chat/ChatProvider';
import { useConversation } from '@/lib/chat/useConversation';
import { CallButtons, CallCard } from '@/lib/chat/CallProvider';
import MessageList, { Avatar } from '@/components/messaging/MessageList';
import Composer from '@/components/messaging/Composer';
import CatchUp from '@/components/messaging/CatchUp';

const renderCall = (id, kind) => <CallCard id={id} kind={kind} />;
const when = (d) => { const x = new Date(d); return isToday(x) ? format(x, 'h:mm a') : isThisWeek(x) ? format(x, 'EEE') : format(x, 'MMM d'); };

export default function DirectMessages() {
  const { user } = useOutletContext();
  const chat = useChat();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dm = params.get('dm') ? lc(params.get('dm')) : null;
  const groupId = params.get('group');
  const [search, setSearch] = useState('');
  const [composing, setComposing] = useState(false);
  const me = chat?.me;

  // Conversation list: latest DM per person + every group I'm in.
  const { data: list = [] } = useQuery({
    queryKey: ['dm-list', me],
    enabled: !!me,
    queryFn: async () => {
      const [{ data: dms }, groups] = await Promise.all([
        supabase.from('direct_message').select('id,sender_email,receiver_email,content,created_date').order('created_date', { ascending: false }).limit(800),
        base44.entities.GroupChat.filter({ brokerage_id: chat.brokerageId }, '-created_date', 200),
      ]);
      const out = new Map();
      for (const m of dms || []) {
        const other = lc(m.sender_email) === me ? lc(m.receiver_email) : lc(m.sender_email);
        if (!out.has(`dm:${other}`)) out.set(`dm:${other}`, { kind: 'dm', key: other, last: m });
      }
      const ids = groups.map((g) => g.id);
      const { data: gms } = ids.length ? await supabase.from('group_message').select('id,group_id,sender_email,content,created_date').in('group_id', ids).order('created_date', { ascending: false }).limit(800) : { data: [] };
      for (const g of groups) {
        const last = (gms || []).find((m) => m.group_id === g.id);
        out.set(`group:${g.id}`, { kind: 'group', key: g.id, group: g, last: last || { created_date: g.created_date, content: '' } });
      }
      return [...out.values()].sort((a, b) => String(b.last.created_date).localeCompare(String(a.last.created_date)));
    },
  });
  useEffect(() => {
    if (!chat) return undefined;
    let t;
    const bump = () => { clearTimeout(t); t = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['dm-list', me] }), 300); };
    const offs = [chat.on('direct_message', bump), chat.on('group_message', bump), chat.on('group_chat', bump)];
    return () => { clearTimeout(t); offs.forEach((o) => o()); };
  }, [chat, queryClient, me]);

  if (!chat) return null;
  const open = (kind, key) => setParams(kind === 'dm' ? { dm: key } : { group: key });
  const close = () => setParams({});
  const nameFor = (c) => (c.kind === 'dm' ? chat.personOf(c.key).name : groupName(c.group, chat));
  const filtered = list.filter((c) => !search || nameFor(c).toLowerCase().includes(search.toLowerCase()));
  const activeGroup = groupId ? list.find((c) => c.key === groupId)?.group : null;
  const hasOpen = !!dm || !!groupId;

  return (
    <div className="h-full flex overflow-hidden bg-background">
      <aside className={cn('w-full md:w-80 border-r flex-col flex-shrink-0', hasOpen ? 'hidden md:flex' : 'flex')}>
        <div className="px-4 pt-4 pb-3 border-b space-y-3">
          <div className="flex items-center justify-between"><h1 className="text-xl font-bold">Chats</h1>
            <button onClick={() => setComposing(true)} className="p-2 rounded-full bg-primary/10 text-primary hover:bg-primary/15" title="New message" aria-label="New message"><PenSquare className="w-5 h-5" /></button></div>
          <div className="flex items-center gap-2 rounded-full bg-muted px-3 py-2"><Search className="w-4 h-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" className="bg-transparent outline-none text-base sm:text-sm flex-1 min-w-0" /></div>
          <OnlineRow chat={chat} onOpen={(e) => open('dm', e)} />
        </div>
        <div className="flex-1 overflow-y-auto">
          {!filtered.length ? <p className="text-sm text-muted-foreground text-center py-10 px-6">{search ? 'No chats match.' : 'No messages yet. Tap the pencil to start one.'}</p>
            : filtered.map((c) => {
              const u = chat.unread.get(`${c.kind}:${c.key}`);
              const selected = (c.kind === 'dm' && c.key === dm) || (c.kind === 'group' && c.key === groupId);
              const lastFromMe = lc(c.last.sender_email) === me;
              return (
                <button key={`${c.kind}:${c.key}`} onClick={() => open(c.kind, c.key)} className={cn('w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60', selected && 'bg-primary/10')}>
                  {c.kind === 'dm' ? <Avatar person={chat.personOf(c.key)} size={48} online={chat.online.has(c.key)} />
                    : <span className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-200 to-sky-200 dark:from-violet-900 dark:to-sky-900 flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5 text-violet-700 dark:text-violet-200" /></span>}
                  <span className="flex-1 min-w-0">
                    <span className={cn('block truncate text-sm', u?.unread ? 'font-bold' : 'font-medium')}>{nameFor(c)}</span>
                    <span className={cn('flex gap-1 text-xs truncate', u?.unread ? 'text-foreground font-semibold' : 'text-muted-foreground')}>
                      <span className="truncate">{c.last.content ? `${lastFromMe ? 'You: ' : c.kind === 'group' ? `${chat.personOf(c.last.sender_email).name.split(' ')[0]}: ` : ''}${preview(c.last.content)}` : 'New group'}</span>
                      <span className="flex-shrink-0">· {when(c.last.created_date)}</span>
                    </span>
                  </span>
                  {u?.unread > 0 && <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">{u.unread > 99 ? '99+' : u.unread}</span>}
                </button>
              );
            })}
        </div>
      </aside>

      <main className={cn('flex-1 min-w-0 flex-col', hasOpen ? 'flex' : 'hidden md:flex')}>
        {dm ? <Conversation key={`dm:${dm}`} kind="dm" convKey={dm} chat={chat} onBack={close} />
          : groupId ? (activeGroup ? <Conversation key={`group:${groupId}`} kind="group" convKey={groupId} group={activeGroup} chat={chat} onBack={close} /> : <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Loading…</div>)
            : <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2"><PenSquare className="w-10 h-10 opacity-30" /><p className="text-sm">Pick a chat or start a new one.</p></div>}
      </main>

      {composing && <NewChat chat={chat} user={user} onClose={() => setComposing(false)} onOpen={(kind, key) => { setComposing(false); queryClient.invalidateQueries({ queryKey: ['dm-list', me] }); open(kind, key); }} />}
    </div>
  );
}

export function groupName(g, chat) {
  if (!g) return 'Group';
  if (g.name && !g.auto_name) return g.name;
  return (g.members || []).filter((m) => lc(m.email) !== chat.me).map((m) => chat.personOf(m.email).name.split(' ')[0]).join(', ') || g.name || 'Group';
}

function OnlineRow({ chat, onOpen }) {
  const on = chat.peopleList.filter((p) => chat.online.has(lc(p.email)) && lc(p.email) !== chat.me).slice(0, 12);
  if (!on.length) return null;
  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
      {on.map((p) => (
        <button key={p.id} onClick={() => onOpen(lc(p.email))} className="flex flex-col items-center gap-1 w-14 flex-shrink-0">
          <Avatar person={chat.personOf(p.email)} size={44} online />
          <span className="text-[11px] truncate w-full text-center">{chat.personOf(p.email).name.split(' ')[0]}</span>
        </button>
      ))}
    </div>
  );
}

export function Conversation({ kind, convKey, group, chat, onBack, embedded }) {
  const room = useRoom(`${kind}:${kind === 'dm' ? [chat.me, convKey].sort().join('|') : convKey}`);
  const [manage, setManage] = useState(false);
  const conv = useConversation(kind, convKey, {
    onSent: (m) => {
      if (kind === 'group') {
        base44.entities.GroupChat.update(convKey, { last_message_at: m.created_date }).catch(() => {});
        if (m.mentions?.length) base44.functions.invoke('chatNotify', { kind: 'group', id: m.id }).catch(() => {});
      }
    },
  });
  useEffect(() => { chat.setActive({ kind, key: convKey }); return () => chat.setActive(null); }, [chat, kind, convKey]);
  // Last read time before opening, for "Catch me up".
  const [lastRead, setLastRead] = useState(null);
  useEffect(() => {
    supabase.from('chat_read_state').select('last_read_at').eq('kind', kind).eq('conv_key', convKey).maybeSingle().then(({ data }) => setLastRead(data?.last_read_at || ''));
  }, [kind, convKey]);
  const lastId = conv.messages[conv.messages.length - 1]?.id;
  useEffect(() => {
    if (conv.loading) return undefined;
    const t = setTimeout(() => { if (document.visibilityState === 'visible') { chat.markRead(kind, convKey); room.announceRead(); } }, 500);
    return () => clearTimeout(t);
  }, [lastId, conv.loading]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const v = () => { if (document.visibilityState === 'visible') { chat.markRead(kind, convKey); room.announceRead(); } };
    document.addEventListener('visibilitychange', v);
    return () => document.removeEventListener('visibilitychange', v);
  }, [chat, kind, convKey, room]);

  // Seen: DMs use the read flag; groups use read times.
  const { data: readers = [], refetch } = useQuery({
    queryKey: ['readers', kind, convKey], enabled: kind === 'group',
    queryFn: async () => (await supabase.rpc('chat_readers', { p_kind: 'group', p_key: convKey })).data || [],
  });
  useEffect(() => { if (kind === 'group') refetch(); }, [room.seenTick, kind, refetch]);
  const myLast = [...conv.messages].reverse().find((m) => lc(m.sender_email) === chat.me && !m._pending && !m._failed);
  let seenBy = null;
  if (myLast && kind === 'dm') seenBy = myLast.read ? 'Seen' : 'Sent';
  if (myLast && kind === 'group') {
    const s = readers.filter((r) => r.user_email !== chat.me && r.last_read_at >= myLast.created_date).map((r) => chat.personOf(r.user_email).name.split(' ')[0]);
    seenBy = s.length ? `Seen by ${s.slice(0, 4).join(', ')}${s.length > 4 ? ` +${s.length - 4}` : ''}` : 'Sent';
  }

  const members = kind === 'group' ? (group.members || []).map((m) => lc(m.email)) : [convKey];
  const people = members.filter((e) => e !== chat.me).map((e) => chat.personOf(e));
  const title = kind === 'dm' ? chat.personOf(convKey).name : groupName(group, chat);
  const online = kind === 'dm' ? chat.online.has(convKey) : people.some((p) => chat.online.has(p.email));

  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
      <header className="flex items-center gap-2.5 sm:gap-3 pl-1 pr-1.5 sm:px-4 py-2 border-b bg-card/95 backdrop-blur flex-shrink-0">
        {!embedded && <button onClick={onBack} className="md:hidden p-2 rounded-full hover:bg-muted" aria-label="Back to chats"><ArrowLeft className="w-5 h-5" /></button>}
        {kind === 'dm' ? <Avatar person={chat.personOf(convKey)} size={38} online={online} /> : <span className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-violet-200 to-sky-200 dark:from-violet-900 dark:to-sky-900 flex items-center justify-center flex-shrink-0"><Users className="w-5 h-5 text-violet-700 dark:text-violet-200" /></span>}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[15px] leading-tight truncate">{title}</p>
          <p className="text-xs text-muted-foreground truncate">{kind === 'dm' ? (online ? <span className="text-emerald-600">Active now</span> : chat.people.get(convKey)?.role ? 'Offline' : '') : group.transaction_id ? `Deal chat · ${people.map((p) => p.name.split(' ')[0]).join(', ')}` : `${members.length} people${online ? ' · some online' : ''}`}</p>
        </div>
        <div className="flex items-center flex-shrink-0">
          <CatchUp kind={kind} convKey={convKey} since={lastRead || undefined} />
          <CallButtons kind={kind} convKey={convKey} className="gap-0" />
        </div>
        {kind === 'group' && group.transaction_id && !embedded && <a href={`/Transactions/${group.transaction_id}`} className="text-xs text-primary hover:underline px-2">Open deal</a>}
        {kind === 'group' && !group.transaction_id && <button onClick={() => setManage(true)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground" title="Group settings"><Users className="w-4 h-4" /></button>}
      </header>
      <MessageList key={`${kind}:${convKey}`} conv={conv} kind={kind} chat={chat} variant="bubble" renderCall={renderCall} seenBy={seenBy} typers={room.typers}
        emptyText={kind === 'dm' ? 'No messages yet. Say hi!' : 'Say hi to the group!'}
        intro={(
          <div className="flex flex-col items-center text-center px-6 pt-8 pb-4">
            {kind === 'dm' ? <Avatar person={chat.personOf(convKey)} size={72} online={online} />
              : <span className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-violet-200 to-sky-200 dark:from-violet-900 dark:to-sky-900 flex items-center justify-center"><Users className="w-8 h-8 text-violet-700 dark:text-violet-200" /></span>}
            <p className="mt-3 font-semibold text-lg leading-tight">{title}</p>
            <p className="text-xs text-muted-foreground mt-1">{kind === 'dm' ? convKey : `${members.length} ${members.length === 1 ? 'person' : 'people'}`}</p>
            <p className="text-[11px] text-muted-foreground/80 mt-3">{kind === 'dm' ? 'Private conversation. Only the two of you can see it.' : 'Only members can see this group.'}</p>
          </div>
        )} />
      <Composer draftKey={`${kind}:${convKey}`} fileScope={kind === 'dm' ? { kind: 'dm', emails: [chat.me, convKey] } : { kind: 'group', id: convKey }} people={kind === 'group' ? people : []} placeholder="Aa" onSend={(t, extra) => conv.send(t, kind === 'group' ? extra : {})}
        onTyping={room.typing} onStopTyping={room.stopTyping} />
      {manage && group && <GroupSettings group={group} chat={chat} onClose={() => setManage(false)} onLeft={onBack} />}
    </div>
  );
}

function PeoplePicker({ chat, exclude = [], picked, setPicked }) {
  const [q, setQ] = useState('');
  const options = chat.peopleList.filter((p) => !p.suspended && lc(p.email) !== chat.me && !exclude.includes(lc(p.email))
    && `${p.display_name || ''} ${p.full_name || ''} ${p.email}`.toLowerCase().includes(q.toLowerCase())).slice(0, 50);
  return (
    <>
      <div className="flex flex-wrap gap-1.5 items-center rounded-lg border px-2 py-1.5">
        <span className="text-sm text-muted-foreground">To:</span>
        {picked.map((e) => <span key={e} className="flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs px-2 py-1">{chat.personOf(e).name}<button onClick={() => setPicked(picked.filter((x) => x !== e))}><X className="w-3 h-3" /></button></span>)}
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="flex-1 min-w-[120px] bg-transparent outline-none text-base sm:text-sm py-1" />
      </div>
      <ul className="max-h-72 overflow-y-auto divide-y">
        {options.map((p) => {
          const e = lc(p.email); const on = picked.includes(e);
          return (
            <li key={p.id}><button onClick={() => { setPicked(on ? picked.filter((x) => x !== e) : [...picked, e]); setQ(''); }} className="w-full flex items-center gap-3 px-2 py-2 hover:bg-muted text-left">
              <Avatar person={chat.personOf(e)} size={36} online={chat.online.has(e)} />
              <span className="flex-1 min-w-0"><span className="block text-sm font-medium truncate">{chat.personOf(e).name}</span><span className="block text-xs text-muted-foreground truncate">{p.email}</span></span>
              <span className={cn('w-5 h-5 rounded-full border flex items-center justify-center', on && 'bg-primary border-primary text-primary-foreground')}>{on && <Check className="w-3 h-3" />}</span>
            </button></li>
          );
        })}
      </ul>
    </>
  );
}

function NewChat({ chat, user, onClose, onOpen }) {
  const [picked, setPicked] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (picked.length === 1) return onOpen('dm', picked[0]);
    setBusy(true);
    try {
      const members = [{ id: user.id, email: chat.me, full_name: chat.personOf(chat.me).name }, ...picked.map((e) => ({ id: chat.personOf(e).id, email: e, full_name: chat.personOf(e).name }))];
      const g = await base44.entities.GroupChat.create({ brokerage_id: chat.brokerageId, name: name.trim() || members.map((m) => m.full_name.split(' ')[0]).join(', '), auto_name: !name.trim(), members, created_by_email: chat.me, created_by_name: chat.personOf(chat.me).name });
      onOpen('group', g.id);
    } catch (err) { window.alert(err.message); setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>New message</DialogTitle></DialogHeader>
        <PeoplePicker chat={chat} picked={picked} setPicked={setPicked} />
        {picked.length > 1 && <Input placeholder="Group name (optional)" value={name} onChange={(e) => setName(e.target.value)} />}
        <Button disabled={!picked.length || busy} onClick={go}>{picked.length > 1 ? `Create group with ${picked.length}` : 'Chat'}</Button>
      </DialogContent>
    </Dialog>
  );
}

function GroupSettings({ group, chat, onClose, onLeft }) {
  const [name, setName] = useState(group.auto_name ? '' : group.name || '');
  const [adding, setAdding] = useState([]);
  const [busy, setBusy] = useState(false);
  const memberEmails = (group.members || []).map((m) => lc(m.email));
  const save = async () => {
    setBusy(true);
    try {
      const members = [...(group.members || []), ...adding.map((e) => ({ id: chat.personOf(e).id, email: e, full_name: chat.personOf(e).name }))];
      await base44.entities.GroupChat.update(group.id, { name: name.trim() || group.name, auto_name: !name.trim(), members });
      onClose();
    } catch (err) { window.alert(err.message); } finally { setBusy(false); }
  };
  const leave = async () => {
    if (!window.confirm('Leave this group? You will stop getting its messages.')) return;
    await base44.entities.GroupChat.update(group.id, { members: (group.members || []).filter((m) => lc(m.email) !== chat.me) });
    onClose(); onLeft();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Group settings</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2"><Pencil className="w-4 h-4 text-muted-foreground" /><Input placeholder="Group name" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <p className="text-xs font-semibold text-muted-foreground uppercase mt-2">Members ({memberEmails.length})</p>
        <ul className="max-h-40 overflow-y-auto space-y-1">{memberEmails.map((e) => <li key={e} className="flex items-center gap-2 text-sm"><Avatar person={chat.personOf(e)} size={24} online={chat.online.has(e)} />{chat.personOf(e).name}{e === chat.me && ' (you)'}</li>)}</ul>
        <p className="text-xs font-semibold text-muted-foreground uppercase mt-2 flex items-center gap-1"><UserPlus className="w-3.5 h-3.5" /> Add people</p>
        <PeoplePicker chat={chat} exclude={memberEmails} picked={adding} setPicked={setAdding} />
        <div className="flex justify-between gap-2 pt-2">
          <Button variant="ghost" className="text-red-600 gap-1" onClick={leave}><LogOut className="w-4 h-4" /> Leave group</Button>
          <Button onClick={save} disabled={busy}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
