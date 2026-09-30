import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useOutletContext, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Send, Hash, Trash2, Pin, Bell, Search, X, MessageSquare, SmilePlus, Users, Pencil, Eye, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, isToday, isYesterday } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import VoiceMemoButton from '@/components/chat/VoiceMemoButton';
import FileUploadButton from '@/components/chat/FileUploadButton';
import EmojiPicker from '@/components/chat/EmojiPicker';
import PinnedMessages from '@/components/chat/PinnedMessages';
import ChannelMembersManageDialog from '@/components/chat/ChannelMembersManageDialog';
import MessageThread from '@/components/chat/MessageThread';
import UserProfilePanel from '@/components/chat/UserProfilePanel';
import LinkPreviewCard from '@/components/chat/LinkPreviewCard';
import FilePreview from '@/components/viewer/FilePreview';

function formatDayLabel(dateStr) {
  const d = new Date(dateStr);
  if (isToday(d)) return 'Today';
  if (isYesterday(d)) return 'Yesterday';
  return format(d, 'MMMM d, yyyy');
}

export default function SocialChat() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const channel = new URLSearchParams(location.search).get('channel');

  // ────── State ──────
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [voiceMemoUrl, setVoiceMemoUrl] = useState('');
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [cursorPos, setCursorPos] = useState(0);
  const [showMembersDialog, setShowMembersDialog] = useState(false);
  const [threadMessageId, setThreadMessageId] = useState(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [linkMetadata, setLinkMetadata] = useState({});
  const [loadingLinks, setLoadingLinks] = useState(new Set());
  const [deletingMessageId, setDeletingMessageId] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [typingUsers, setTypingUsers] = useState({});
  const [openEmojiFor, setOpenEmojiFor] = useState(null);
  const [ringingBell, setRingingBell] = useState(false);
  const [editingChannelName, setEditingChannelName] = useState(false);
  const [newChannelLabel, setNewChannelLabel] = useState('');
  const [deletingChannelId, setDeletingChannelId] = useState(null);

  const refs = {
    messagesContainer: useRef(null),
    emojiPicker: useRef(null),
    typingTimeouts: useRef({}),
    typingDebounce: useRef(null),
    emojiOpenTime: useRef(Date.now()),
  };

  const isAdmin = user?.role === 'admin';

  // ────── Queries ──────
  const { data: channels = [] } = useQuery({
    queryKey: ['channels', brokerageId],
    queryFn: () => base44.entities.Channel.filter({ brokerage_id: brokerageId }, 'created_date', 100),
    enabled: !!brokerageId,
  });

  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users-chat', brokerageId],
    queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }),
    enabled: !!brokerageId,
    staleTime: 0,
  });

  const { data: channelMembers = [] } = useQuery({
    queryKey: ['channel-members-user', brokerageId],
    queryFn: () => base44.entities.ChannelMember.filter({ user_email: user?.email, brokerage_id: brokerageId }),
    enabled: !!user && !!brokerageId,
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['social-messages', channel, brokerageId],
    queryFn: () => base44.entities.SocialMessage.filter({ channel, brokerage_id: brokerageId }, 'created_date', 100),
    enabled: !!user && !!brokerageId && !!channel,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: allThreadReplies = {} } = useQuery({
    queryKey: ['all-thread-replies', brokerageId],
    queryFn: async () => {
      const replies = await base44.entities.ThreadReply.filter({ brokerage_id: brokerageId }, '-created_date', 1000);
      const grouped = {};
      replies.forEach(r => {
        if (!grouped[r.message_id]) grouped[r.message_id] = [];
        grouped[r.message_id].push(r);
      });
      return grouped;
    },
    enabled: !!brokerageId,
  });

  // ────── Helpers ──────
  const userPhotoMap = useMemo(() => {
    const map = new Map();
    brokerageUsers.forEach(u => map.set(u.email, { photo: u.headshot, name: u.full_name }));
    return map;
  }, [brokerageUsers]);

  const getUserPhoto = (email, fallback) => userPhotoMap.get(email)?.photo || fallback || null;
  const getUserName = (email, fallback) => userPhotoMap.get(email)?.name || fallback || null;

  const getReplyCount = (msgId) => {
    const replies = allThreadReplies[msgId] || [];
    return replies.length;
  };

  const hasChannelAccess = !channel || isAdmin || channelMembers.some(m => m.channel_id === channel);

  const pinnedMessages = messages.filter(m => m.pinned);

  const currentChannel = channels.find(c => c.name === channel) || { label: channel, emoji: '💬' };

  const filteredMessages = useMemo(() =>
    searchQuery.trim()
      ? messages.filter(msg => msg.content?.toLowerCase().includes(searchQuery.toLowerCase()) || msg.sender_name?.toLowerCase().includes(searchQuery.toLowerCase()))
      : messages,
    [searchQuery, messages]
  );

  const grouped = useMemo(() =>
    filteredMessages.reduce((acc, msg) => {
      const day = msg.created_date ? format(new Date(msg.created_date), 'yyyy-MM-dd') : 'today';
      if (!acc[day]) acc[day] = [];
      acc[day].push(msg);
      return acc;
    }, {}),
    [filteredMessages]
  );

  // ────── Effects ──────
  useEffect(() => {
    if (channels.length === 0) return;
    if (!channel || !hasChannelAccess) {
      navigate('/SocialChat?channel=' + channels[0].name, { replace: true });
    }
  }, [hasChannelAccess, channel, channels, navigate]);

  useEffect(() => {
    const el = refs.messagesContainer.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      setTimeout(() => { el.scrollTop = el.scrollHeight; }, 80);
    }
  }, [messages]);

  useEffect(() => {
    const unread = messages.filter(msg => msg.sender_email !== user?.email && !msg.read_by?.includes(user.email));
    unread.forEach(msg => {
      const readBy = [...(msg.read_by || []), user.email];
      base44.entities.SocialMessage.update(msg.id, { read_by: readBy });
    });
  }, [messages, user?.email]);

  useEffect(() => {
    const unsubMsg = base44.entities.SocialMessage.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['social-messages', channel] });
    });
    const unsubUser = base44.entities.User.subscribe(() => {
      queryClient.refetchQueries({ queryKey: ['brokerage-users-chat', brokerageId] });
      queryClient.invalidateQueries({ queryKey: ['social-messages', channel, brokerageId] });
    });
    return () => {
      unsubMsg();
      unsubUser();
    };
  }, [channel, brokerageId, queryClient]);

  useEffect(() => {
    messages.forEach(msg => {
      if (!msg.content?.startsWith('[') && msg.content) {
        const urlPattern = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+|www\.[^\s<>"{}|\\^`\[\]]+)/g;
        let match;
        while ((match = urlPattern.exec(msg.content)) !== null) {
          const url = match[1].startsWith('www.') ? 'https://' + match[1] : match[1];
          if (!linkMetadata[msg.id]) {
            setLoadingLinks(prev => new Set([...prev, msg.id]));
            base44.functions.invoke('fetchLinkMetadata', { url })
              .then(res => setLinkMetadata(prev => ({ ...prev, [msg.id]: res.data })))
              .catch(() => {})
              .finally(() => setLoadingLinks(prev => { const s = new Set(prev); s.delete(msg.id); return s; }));
          }
        }
      }
    });
  }, [messages]);

  useEffect(() => {
    const handleClick = (e) => {
      if (refs.emojiPicker.current && !refs.emojiPicker.current.contains(e.target)) {
        if (Date.now() - refs.emojiOpenTime.current > 300) setOpenEmojiFor(null);
      }
    };
    if (openEmojiFor) {
      refs.emojiOpenTime.current = Date.now();
      document.addEventListener('mousedown', handleClick, true);
      return () => document.removeEventListener('mousedown', handleClick, true);
    }
  }, [openEmojiFor]);

  // ────── Handlers ──────
  const broadcastTyping = (isTyping) => {
    if (!user?.email) return;
    const key = `${channel}-${user.email}`;
    if (isTyping) {
      if (refs.typingDebounce.current) clearTimeout(refs.typingDebounce.current);
      refs.typingDebounce.current = setTimeout(() => {
        setTypingUsers(prev => ({ ...prev, [key]: { email: user.email, name: user.full_name } }));
      }, 100);
      if (refs.typingTimeouts.current[key]) clearTimeout(refs.typingTimeouts.current[key]);
      refs.typingTimeouts.current[key] = setTimeout(() => {
        setTypingUsers(prev => { const u = { ...prev }; delete u[key]; return u; });
      }, 5000);
    }
  };

  const handleTextChange = (e) => {
    const value = e.target.value;
    setText(value);
    setCursorPos(e.target.selectionStart || 0);
    const lastAt = value.lastIndexOf('@', e.target.selectionStart);
    if (lastAt !== -1) {
      const query = value.substring(lastAt + 1, e.target.selectionStart).toLowerCase();
      setMentionSuggestions(brokerageUsers.filter(u => (u.display_name || u.full_name).toLowerCase().startsWith(query) || u.full_name.toLowerCase().startsWith(query) || u.email.toLowerCase().startsWith(query)));
    } else {
      setMentionSuggestions([]);
    }
    if (value.trim()) broadcastTyping(true);
  };

  const insertMention = (userName) => {
    const lastAt = text.lastIndexOf('@');
    if (lastAt !== -1) {
      const before = text.substring(0, lastAt);
      const after = text.substring(cursorPos);
      const newText = before + `@${userName} ` + after;
      setText(newText);
      setMentionSuggestions([]);
      const pos = lastAt + userName.length + 2;
      setTimeout(() => {
        const ta = document.getElementById('chat-input');
        if (ta) { ta.focus(); ta.setSelectionRange(pos, pos); }
      }, 0);
    }
  };

  const handleSend = async (content) => {
    const msgContent = content || text.trim();
    if (!msgContent || sending) return;
    setSending(true);
    const me = await base44.auth.me();
    const mentionPattern = /@([a-zA-Z]+(?:\s[a-zA-Z]+)*|channel)/g;
    const mentions = [];
    let m;
    while ((m = mentionPattern.exec(msgContent)) !== null) mentions.push(m[1]);
    const msg = await base44.entities.SocialMessage.create({
      sender_name: me.display_name || me.full_name,
      sender_email: me.email,
      sender_photo: me.headshot || '',
      content: msgContent,
      channel,
      brokerage_id: brokerageId,
      mentions,
    });
    const userMentions = mentions.filter(m => m.toLowerCase() !== 'channel');
    if (userMentions.length > 0) {
      base44.functions.invoke('notifyOnMention', { mentions: userMentions, messageId: msg.id, senderName: me.full_name, senderEmail: me.email, channel, brokerageId, content: msgContent }).catch(() => {});
    }
    if (!content) setText('');
    setMentionSuggestions([]);
    setSending(false);
    queryClient.refetchQueries({ queryKey: ['social-messages', channel], type: 'all' });
  };

  const handleEditMessage = async (messageId, newContent) => {
    if (!newContent.trim()) return;
    await base44.entities.SocialMessage.update(messageId, { content: newContent });
    queryClient.invalidateQueries({ queryKey: ['social-messages', channel, brokerageId] });
    setEditingMsgId(null);
    setEditingMsgText('');
  };

  const handleDeleteMessage = async (messageId) => {
    await base44.entities.SocialMessage.delete(messageId);
    queryClient.invalidateQueries({ queryKey: ['social-messages', channel, brokerageId] });
    setDeletingMessageId(null);
  };

  const handlePinMessage = async (msg) => {
    await base44.entities.SocialMessage.update(msg.id, { pinned: !msg.pinned, pinned_by: !msg.pinned ? user?.email : null });
    queryClient.invalidateQueries({ queryKey: ['social-messages', channel, brokerageId] });
  };

  const handleChannelRename = async () => {
    if (!newChannelLabel.trim() || !currentChannel.id) return;
    await base44.entities.Channel.update(currentChannel.id, { label: newChannelLabel });
    queryClient.invalidateQueries({ queryKey: ['channels', brokerageId] });
    setEditingChannelName(false);
    setNewChannelLabel('');
  };

  const handleDeleteChannel = async () => {
    if (!currentChannel.id || currentChannel.is_default) return;
    await base44.entities.Channel.delete(currentChannel.id);
    queryClient.invalidateQueries({ queryKey: ['channels', brokerageId] });
    setDeletingChannelId(null);
    const nextChannel = channels.find(c => c.id !== currentChannel.id);
    if (nextChannel) navigate('/SocialChat?channel=' + nextChannel.name, { replace: true });
    else navigate('/SocialChat', { replace: true });
  };

  const handleRingBell = async () => {
    if (ringingBell || !channel) return;
    setRingingBell(true);
    const me = await base44.auth.me();
    const bid = brokerageId || me?.brokerage_id;
    if (!bid) { setRingingBell(false); return; }
    await base44.entities.SocialMessage.create({
      sender_name: me.full_name || 'Someone',
      sender_email: me.email || '',
      sender_photo: me.headshot || '',
      content: `🔔 ${me.full_name || 'Someone'} just went under contract! They rang the bell! 🎉🏆`,
      channel,
      brokerage_id: bid,
      mentions: [],
      reactions: [],
      read_by: [],
    });
    await queryClient.refetchQueries({ queryKey: ['social-messages', channel], type: 'all' });
    setTimeout(() => setRingingBell(false), 3000);
  };

  const renderContent = (msg) => {
    if (msg.content?.startsWith('[voice_memo]')) {
      return <audio controls src={msg.content.replace('[voice_memo]', '')} className="h-9 mt-1 max-w-xs" preload="metadata" />;
    }
    if (msg.content?.startsWith('[file]')) {
      const [url, type, name] = msg.content.replace('[file]', '').split('|');
      return <FilePreview fileUrl={url} fileName={name} fileType={type} maxWidth="400px" showCaption={false} />;
    }
    const parts = [];
    let lastIdx = 0;
    const combined = /(@)([a-zA-Z]+(?:\s[a-zA-Z]+)*)|(https?:\/\/[^\s]+|www\.[^\s]+)/g;
    let match;
    while ((match = combined.exec(msg.content)) !== null) {
      if (match.index > lastIdx) parts.push(msg.content.substring(lastIdx, match.index));
      if (match[1]) {
        parts.push('@');
        parts.push(<span key={match.index} className="bg-primary/15 text-primary font-medium px-1 rounded text-sm">{match[2]}</span>);
      } else if (match[3]) {
        const url = match[3].startsWith('www.') ? 'https://' + match[3] : match[3];
        parts.push(<a key={match.index} href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{match[3]}</a>);
      }
      lastIdx = match.index + match[0].length;
    }
    if (lastIdx < msg.content.length) parts.push(msg.content.substring(lastIdx));
    return <span>{parts}</span>;
  };

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 bg-background flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-lg leading-none flex-shrink-0">{currentChannel.emoji}</span>
          {editingChannelName ? (
            <Input
              autoFocus
              value={newChannelLabel}
              onChange={(e) => setNewChannelLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleChannelRename();
                if (e.key === 'Escape') setEditingChannelName(false);
              }}
              className="h-8 text-lg font-bold px-2 py-1"
            />
          ) : (
            <h1 className="text-lg font-bold text-foreground truncate">{currentChannel.label}</h1>
          )}
          <span className="text-xs text-muted-foreground/60">·</span>
          <p className="text-xs text-muted-foreground/60">{messages.length}</p>
          {isAdmin && !editingChannelName && (
            <button
              onClick={() => {
                setEditingChannelName(true);
                setNewChannelLabel(currentChannel.label);
              }}
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
              title="Edit channel name"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {editingChannelName && (
            <div className="flex gap-1 flex-shrink-0">
              <button onClick={handleChannelRename} className="text-xs font-medium text-primary hover:text-primary/80">Save</button>
              <span className="text-xs text-muted-foreground">·</span>
              <button onClick={() => setEditingChannelName(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}
          {isAdmin && !currentChannel.is_default && !editingChannelName && (
            <button
              onClick={() => setDeletingChannelId(currentChannel.id)}
              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
              title="Delete channel"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-1.5 border border-border/40">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent outline-none text-sm w-32 placeholder:text-muted-foreground/50"
            />
            {searchQuery && <button onClick={() => setSearchQuery('')} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>}
          </div>
          {isAdmin && (
            <Button onClick={() => setShowMembersDialog(true)} variant="ghost" size="sm" className="gap-1.5 rounded-lg text-xs h-8 px-2">
              <Users className="w-3.5 h-3.5" /> Members
            </Button>
          )}
        </div>
      </div>

      {/* Pinned Messages */}
      <PinnedMessages pinnedMessages={pinnedMessages} channel={channel} isAdmin={isAdmin} getUserPhoto={getUserPhoto} />

      {/* Messages */}
      <div className="flex-1 overflow-hidden bg-background flex flex-col">
        <div ref={refs.messagesContainer} className="flex-1 overflow-y-auto pb-2 flex flex-col justify-end" onClick={() => setThreadMessageId(null)}>
          {!hasChannelAccess ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center text-2xl">🔒</div>
              <div>
                <p className="font-semibold text-foreground text-sm">No access to this channel</p>
                <p className="text-xs text-muted-foreground mt-1">Ask an admin to add you.</p>
              </div>
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-6">
              <div className="text-4xl">{currentChannel.emoji}</div>
              <div>
                <p className="font-semibold text-foreground text-sm">Welcome to {currentChannel.label}</p>
                <p className="text-xs text-muted-foreground mt-1">Be the first to send a message!</p>
              </div>
            </div>
          ) : (
            Object.entries(grouped).map(([day, dayMessages]) => (
              <div key={day}>
                <div className="flex items-center gap-3 px-6 my-4">
                  <div className="flex-1 h-px bg-border/30" />
                  <span className="text-xs font-medium text-muted-foreground/70 px-2">{formatDayLabel(dayMessages[0].created_date || day)}</span>
                  <div className="flex-1 h-px bg-border/30" />
                </div>
                {dayMessages.map((msg) => {
                  const isEditing = editingMsgId === msg.id;
                  const isHovered = hoveredMsgId === msg.id;
                  const photo = getUserPhoto(msg.sender_email, msg.sender_photo);

                  return (
                    <div key={msg.id}>
                      {isEditing ? (
                        <div className="px-4 py-2 flex gap-3 items-start">
                          <div className="w-9 flex-shrink-0" />
                          <div className="flex-1">
                            <textarea
                              value={editingMsgText}
                              onChange={(e) => setEditingMsgText(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleEditMessage(msg.id, editingMsgText);
                                }
                                if (e.key === 'Escape') setEditingMsgId(null);
                              }}
                              className="w-full bg-card border border-primary/40 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/30"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex gap-2 mt-1.5">
                              <button onClick={() => handleEditMessage(msg.id, editingMsgText)} className="text-xs font-medium text-primary hover:text-primary/80">Save</button>
                              <span className="text-xs text-muted-foreground">·</span>
                              <button onClick={() => setEditingMsgId(null)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.15 }}
                          className="relative group flex gap-3 px-6 py-1"
                          onMouseEnter={() => setHoveredMsgId(msg.id)}
                          onMouseLeave={() => setHoveredMsgId(null)}
                        >
                          {/* Avatar */}
                          <div className="flex-shrink-0 mt-0.5">
                            <button
                              onClick={() => setSelectedUserProfile({ ...brokerageUsers.find(u => u.email === msg.sender_email), email: msg.sender_email, full_name: msg.sender_name, headshot: msg.sender_photo })}
                              className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center text-xs font-bold text-primary hover:opacity-80 transition-opacity flex-shrink-0"
                            >
                              {photo ? <img src={photo} alt={getUserName(msg.sender_email, msg.sender_name)} className="w-full h-full object-cover" /> : getUserName(msg.sender_email, msg.sender_name)?.[0]?.toUpperCase()}
                            </button>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className={cn('px-4 py-3 rounded-2xl transition-all duration-150', msg.pinned && 'bg-amber-100/50 dark:bg-amber-900/30 border border-amber-200/50 dark:border-amber-800/50', !msg.pinned && 'bg-card border border-border/40 hover:border-border/60')}>
                              <div className="flex items-baseline gap-2 mb-1.5">
                                <button
                                  onClick={() => setSelectedUserProfile({ ...brokerageUsers.find(u => u.email === msg.sender_email), email: msg.sender_email, full_name: msg.sender_name, headshot: msg.sender_photo })}
                                  className="text-sm font-bold text-foreground hover:text-primary transition-colors"
                                >
                                  {brokerageUsers.find(u => u.email === msg.sender_email)?.display_name || brokerageUsers.find(u => u.email === msg.sender_email)?.full_name || getUserName(msg.sender_email, msg.sender_name)}
                                </button>
                                <span className="text-xs text-muted-foreground/50">{msg.created_date ? format(new Date(msg.created_date), 'h:mm a') : ''}</span>
                                {msg.sender_email === user?.email && msg.read_by?.length > 0 && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="flex items-center gap-1 cursor-default ml-auto">
                                          <Eye className="w-3 h-3 text-accent" />
                                          <span className="text-xs text-accent">{msg.read_by.length}</span>
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent side="top">
                                        <p className="text-xs font-semibold mb-1">Read by:</p>
                                        {msg.read_by.map((email, i) => (
                                          <p key={i} className="text-xs">{brokerageUsers.find(u => u.email === email)?.full_name || email}</p>
                                        ))}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>

                              <div className="text-sm text-foreground leading-relaxed break-words">{renderContent(msg)}</div>

                              {!msg.content?.startsWith('[') && <LinkPreviewCard metadata={linkMetadata[msg.id]} loading={loadingLinks.has(msg.id)} />}

                              {msg.reactions?.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2 -ml-1">
                                  {msg.reactions.map((reaction, idx) => {
                                    const reactionNames = reaction.users.map(email => brokerageUsers.find(u => u.email === email)?.full_name || email).join(', ');
                                    return (
                                      <button
                                        key={idx}
                                        onClick={async () => {
                                          const newReactions = [...msg.reactions];
                                          const userIdx = newReactions[idx].users.indexOf(user?.email);
                                          if (userIdx !== -1) {
                                            newReactions[idx].users.splice(userIdx, 1);
                                            if (newReactions[idx].users.length === 0) newReactions.splice(idx, 1);
                                          } else {
                                            newReactions[idx].users.push(user?.email);
                                          }
                                          await base44.entities.SocialMessage.update(msg.id, { reactions: newReactions });
                                          queryClient.invalidateQueries({ queryKey: ['social-messages', channel, brokerageId] });
                                        }}
                                        className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all duration-150', reaction.users.includes(user?.email) ? 'bg-primary/15 border-primary/30 text-primary hover:bg-primary/20' : 'bg-muted/50 border-border/50 hover:bg-muted/70 hover:border-border')}
                                        title={reactionNames}
                                      >
                                        <span>{reaction.emoji}</span>
                                        {reaction.users.length > 1 && <span className="text-[10px]">{reaction.users.length}</span>}
                                      </button>
                                    );
                                  })}
                                </div>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setThreadMessageId(threadMessageId === msg.id ? null : msg.id);
                                }}
                                className="flex items-center gap-1.5 mt-2.5 text-xs text-primary/80 hover:text-primary transition-colors"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                {getReplyCount(msg.id) > 0 ? `${getReplyCount(msg.id)} ${getReplyCount(msg.id) === 1 ? 'reply' : 'replies'}` : 'Reply'}
                              </button>
                            </div>

                            {/* Actions */}
                            <AnimatePresence>
                              {isHovered && (
                                <motion.div
                                  initial={{ opacity: 0, y: -4, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                  transition={{ duration: 0.1 }}
                                  className="absolute right-4 top-0 -translate-y-1/2 flex items-center gap-0.5 bg-card border border-border/60 rounded-2xl shadow-lg px-2 py-1.5 z-20 backdrop-blur-md bg-opacity-95"
                                >
                                  {/* Emoji */}
                                  <div className="relative">
                                    <button
                                      onClick={() => {
                                        setOpenEmojiFor(openEmojiFor === msg.id ? null : msg.id);
                                        refs.emojiOpenTime.current = Date.now();
                                      }}
                                      className="p-1 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors duration-150"
                                      title="Add reaction"
                                    >
                                      <SmilePlus className="w-4 h-4" />
                                    </button>
                                    <AnimatePresence>
                                      {openEmojiFor === msg.id && (
                                        <div ref={refs.emojiPicker} className="absolute bottom-full right-0 mb-2 z-50">
                                          <div className="bg-card border border-border rounded-xl p-2 shadow-xl">
                                            <EmojiPicker
                                              onSelect={async (emoji) => {
                                                const newReactions = msg.reactions ? [...msg.reactions] : [];
                                                const idx = newReactions.findIndex(r => r.emoji === emoji);
                                                if (idx !== -1) {
                                                  if (!newReactions[idx].users.includes(user?.email)) newReactions[idx].users.push(user?.email);
                                                } else {
                                                  newReactions.push({ emoji, users: [user?.email] });
                                                }
                                                await base44.entities.SocialMessage.update(msg.id, { reactions: newReactions });
                                                queryClient.invalidateQueries({ queryKey: ['social-messages', channel, brokerageId] });
                                                setOpenEmojiFor(null);
                                              }}
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </AnimatePresence>
                                  </div>

                                  {/* Pin */}
                                  {isAdmin && (
                                    <button
                                      onClick={() => handlePinMessage(msg)}
                                      className={cn('p-1 rounded-lg transition-colors duration-150', msg.pinned ? 'text-amber-500 bg-amber-500/10' : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground')}
                                      title={msg.pinned ? 'Unpin' : 'Pin'}
                                    >
                                      <Pin className="w-4 h-4" />
                                    </button>
                                  )}

                                  {/* Edit */}
                                  {msg.sender_email === user?.email && (
                                    <button
                                      onClick={() => {
                                        setEditingMsgId(msg.id);
                                        setEditingMsgText(msg.content);
                                        setHoveredMsgId(null);
                                      }}
                                      className="p-1 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors duration-150"
                                      title="Edit"
                                    >
                                      <Pencil className="w-4 h-4" />
                                    </button>
                                  )}

                                  {/* Delete */}
                                  {(msg.sender_email === user?.email || isAdmin) && (
                                    <button
                                      onClick={() => setDeletingMessageId(msg.id)}
                                      className="p-1 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors duration-150"
                                      title="Delete"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {/* Thread */}
                            {threadMessageId === msg.id && (
                              <div className="w-full mt-2" onClick={(e) => e.stopPropagation()}>
                                <MessageThread messageId={msg.id} brokerageId={brokerageId} user={user} brokerageUsers={brokerageUsers} />
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Input */}
      {hasChannelAccess && (
        <div className="flex-shrink-0 border-t border-border/30 bg-background overflow-hidden">
          {Object.keys(typingUsers).length > 0 && (
            <div className="px-6 py-2 text-xs text-muted-foreground flex items-center gap-2 border-b border-border/30">
              <span className="flex gap-0.5 items-center">
                {[0, 0.15, 0.3].map((d, i) => (
                  <span key={i} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${d}s` }} />
                ))}
              </span>
              <span>{Object.values(typingUsers).map(u => u.name).join(', ')} {Object.keys(typingUsers).length === 1 ? 'is' : 'are'} typing</span>
            </div>
          )}
          <div className="px-6 py-4">
            {voiceMemoUrl && (
              <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-2 mb-3 border border-border/30">
                <audio controls src={voiceMemoUrl} className="flex-1 h-8" preload="metadata" />
                <button onClick={() => setVoiceMemoUrl('')} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2.5">
              <div className="flex-1 relative">
                <textarea
                  id="chat-input"
                  value={text}
                  onChange={handleTextChange}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && !mentionSuggestions.length) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={`Message #${currentChannel.label.toLowerCase()}`}
                  disabled={!!voiceMemoUrl}
                  rows={1}
                  className="w-full resize-none bg-muted/50 border border-border/40 focus:border-primary/50 rounded-lg px-4 py-3 text-sm outline-none focus:ring-1 focus:ring-primary/30 placeholder:text-muted-foreground/50 min-h-[44px] max-h-36 transition-all disabled:opacity-50"
                />

                {mentionSuggestions.length > 0 && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 bg-card border border-border/50 rounded-lg shadow-lg z-[9999] overflow-hidden">
                    <div className="p-1 max-h-48 overflow-y-auto">
                      <button onClick={() => insertMention('channel')} className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-muted/50 text-left text-sm">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">#</div>
                        <div className="min-w-0"><p className="font-semibold">@channel</p><p className="text-xs text-muted-foreground">Notify all members</p></div>
                      </button>
                      {mentionSuggestions.map((u) => {
                        const displayName = u.display_name || u.full_name;
                        return (
                          <button key={u.id} onClick={() => insertMention(displayName)} className="w-full flex items-center gap-3 px-3 py-2 rounded hover:bg-muted/50 text-left text-sm select-none">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary overflow-hidden flex-shrink-0">
                              {u.headshot ? <img src={u.headshot} alt={displayName} className="w-full h-full object-cover" /> : displayName?.[0]?.toUpperCase()}
                            </div>
                            <div className="min-w-0"><p className="font-medium truncate text-sm">{displayName}</p><p className="text-xs text-muted-foreground truncate">{u.email}</p></div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {!voiceMemoUrl && (
                <Button
                  onClick={handleRingBell}
                  disabled={ringingBell || sending}
                  variant="ghost"
                  size="icon"
                  className={cn('h-9 w-9 rounded-lg flex-shrink-0', ringingBell && 'animate-pulse bg-yellow-400/10 text-yellow-600')}
                  title="Ring the bell!"
                >
                  <Bell className={cn('w-4 h-4', ringingBell && 'text-yellow-600')} />
                </Button>
              )}

              <FileUploadButton onFileSelect={({ file_url, fileName, fileType }) => handleSend(`[file]${file_url}|${fileType}|${fileName}`)} disabled={sending || !!voiceMemoUrl} />
              <VoiceMemoButton onSend={handleSend} onStage={(c) => setVoiceMemoUrl(c.replace('[voice_memo]', ''))} disabled={sending || !!voiceMemoUrl} />

              <Button
                onClick={() => {
                  if (voiceMemoUrl) {
                    handleSend(`[voice_memo]${voiceMemoUrl}`);
                    setVoiceMemoUrl('');
                  } else {
                    handleSend();
                  }
                }}
                disabled={sending || (!text.trim() && !voiceMemoUrl)}
                size="icon"
                className="h-9 w-9 rounded-lg flex-shrink-0 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <ChannelMembersManageDialog open={showMembersDialog} onOpenChange={setShowMembersDialog} channel={channel} brokerageId={brokerageId} brokerageUsers={brokerageUsers} />

      <Dialog open={!!deletingMessageId} onOpenChange={(open) => !open && setDeletingMessageId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete this message?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingMessageId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleDeleteMessage(deletingMessageId)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingChannelId} onOpenChange={(open) => !open && setDeletingChannelId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Delete channel?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground py-2">Deleting <strong>{currentChannel.label}</strong> will remove it permanently. All messages will be deleted. This cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingChannelId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteChannel}>Delete Channel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AnimatePresence>
        {selectedUserProfile && (
          <UserProfilePanel user={selectedUserProfile} brokerageId={brokerageId} onClose={() => setSelectedUserProfile(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}