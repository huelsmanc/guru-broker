import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Send, Check, CheckCheck, Search, Plus, X, SmilePlus, Trash2, Pencil, ArrowLeft } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import FileUploadButton from '@/components/chat/FileUploadButton';
import VoiceMemoButton from '@/components/chat/VoiceMemoButton';
import EmojiPicker from '@/components/chat/EmojiPicker';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import UserProfilePanel from '@/components/chat/UserProfilePanel';
import { useIsMobile } from '@/hooks/use-mobile.jsx';

export default function DirectMessages() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const messagesEndRef = useRef(null);
  const emojiPickerRef = useRef(null);
  const typingTimeoutRef = useRef({});

  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [messageText, setMessageText] = useState('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [messageSearch, setMessageSearch] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});
  const [voiceMemoUrl, setVoiceMemoUrl] = useState('');
  const [openEmojiFor, setOpenEmojiFor] = useState(null);
  const [selectedUserProfile, setSelectedUserProfile] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editedContent, setEditedContent] = useState('');
  const [deletingMsgId, setDeletingMsgId] = useState(null);

  // Fetch all users in brokerage
  const { data: brokerageUsers = [] } = useQuery({
    queryKey: ['brokerage-users-dm', brokerageId],
    queryFn: async () => {
      const res = await base44.functions.invoke('getBrokerageUsers', {});
      return res.data?.users || [];
    },
    enabled: !!brokerageId,
    staleTime: 0,
  });

  // Fetch conversations
  const { data: conversations = [] } = useQuery({
    queryKey: ['dm-conversations', user?.id, brokerageId],
    queryFn: async () => {
      const sent = await base44.entities.DirectMessage.filter(
        { sender_id: user.id, brokerage_id: brokerageId },
        '-created_date',
        1000
      );
      const received = await base44.entities.DirectMessage.filter(
        { receiver_id: user.id, brokerage_id: brokerageId },
        '-created_date',
        1000
      );
      const all = [...sent, ...received];

      const userMap = new Map();
      all.forEach(msg => {
        const otherUserId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        const otherName = msg.sender_id === user.id ? msg.receiver_name : msg.sender_name;
        const otherEmail = msg.sender_id === user.id ? msg.receiver_email : msg.sender_email;

        if (!userMap.has(otherUserId)) {
          userMap.set(otherUserId, { id: otherUserId, name: otherName, email: otherEmail, lastMessage: msg });
        } else if (new Date(msg.created_date) > new Date(userMap.get(otherUserId).lastMessage.created_date)) {
          userMap.get(otherUserId).lastMessage = msg;
        }
      });

      return Array.from(userMap.values()).sort((a, b) => new Date(b.lastMessage.created_date) - new Date(a.lastMessage.created_date));
    },
    enabled: !!user?.id && !!brokerageId,
  });

  // Fetch group chats
  const { data: groups = [] } = useQuery({
    queryKey: ['group-chats', user?.id, brokerageId],
    queryFn: async () => {
      const groups = await base44.entities.GroupChat.filter({ brokerage_id: brokerageId }, '-created_date', 100);
      return groups.filter(g => g.members.some(m => m.id === user.id));
    },
    enabled: !!user?.id && !!brokerageId,
  });

  // Fetch messages with selected user
  const { data: messages = [] } = useQuery({
    queryKey: ['dm-messages', user?.id, selectedUserId],
    queryFn: async () => {
      const sent = await base44.entities.DirectMessage.filter(
        { sender_id: user.id, receiver_id: selectedUserId },
        'created_date',
        500
      );
      const received = await base44.entities.DirectMessage.filter(
        { sender_id: selectedUserId, receiver_id: user.id },
        'created_date',
        500
      );
      return [...sent, ...received].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));
    },
    enabled: !!selectedUserId && !!user?.id,
    staleTime: 0,
  });

  // Fetch group messages
  const { data: groupMessages = [] } = useQuery({
    queryKey: ['group-messages', selectedGroupId],
    queryFn: () => base44.entities.GroupMessage.filter({ group_id: selectedGroupId, brokerage_id: brokerageId }, 'created_date', 500),
    enabled: !!selectedGroupId && !!brokerageId,
    staleTime: 0,
  });

  // Mark messages as read
  useEffect(() => {
    if (!messages.length || !selectedUserId) return;
    const unread = messages.filter(m => m.sender_id === selectedUserId && !m.read);
    unread.forEach(m => base44.entities.DirectMessage.update(m.id, { read: true }));
    if (unread.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['dm-conversations', user?.id, brokerageId] });
    }
  }, [messages, selectedUserId]);

  // Real-time subscriptions
  useEffect(() => {
    const unsubs = [];
    unsubs.push(base44.entities.DirectMessage.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['dm-messages', user?.id, selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ['dm-conversations', user?.id, brokerageId] });
    }));
    unsubs.push(base44.entities.User.subscribe(() => {
      queryClient.refetchQueries({ queryKey: ['brokerage-users-dm', brokerageId] });
    }));
    unsubs.push(base44.entities.GroupChat.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['group-chats', user?.id, brokerageId] });
    }));
    return () => unsubs.forEach(u => u());
  }, [user?.id, brokerageId, selectedUserId, queryClient]);

  // Scroll to bottom on new messages only
  const prevMessageCountRef = useRef(0);
  useEffect(() => {
    const currentMessages = selectedGroupId ? groupMessages : messages;
    const currentCount = currentMessages.length;
    const isNewMessage = currentCount > prevMessageCountRef.current;
    if (isNewMessage && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCountRef.current = currentCount;
  }, [messages.length, groupMessages.length, selectedGroupId]);

  const sendMessage = useMutation({
    mutationFn: async (content) => {
      if (!selectedUserId) return;
      const selectedUser = brokerageUsers.find(u => u.id === selectedUserId) ||
        (() => { const c = conversations.find(c => c.id === selectedUserId); return c ? { id: c.id, full_name: c.name, email: c.email, headshot: c.headshot } : null; })();
      if (!selectedUser) throw new Error('User not found');
      await base44.entities.DirectMessage.create({
        brokerage_id: brokerageId,
        sender_id: user.id,
        sender_name: user.display_name || user.full_name,
        sender_email: user.email,
        sender_photo: user.headshot || '',
        receiver_id: selectedUserId,
        receiver_name: selectedUser.display_name || selectedUser.full_name,
        receiver_email: selectedUser.email,
        receiver_photo: selectedUser.headshot || '',
        content,
      });
      queryClient.invalidateQueries({ queryKey: ['dm-messages', user?.id, selectedUserId] });
      queryClient.invalidateQueries({ queryKey: ['dm-conversations', user?.id, brokerageId] });
    },
  });

  const sendGroupMessage = useMutation({
    mutationFn: async (content) => {
      await base44.entities.GroupMessage.create({
        group_id: selectedGroupId,
        brokerage_id: brokerageId,
        sender_id: user.id,
        sender_name: user.full_name,
        sender_email: user.email,
        sender_photo: user.headshot || '',
        content,
      });
      queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroupId] });
    },
  });

  const editMessage = useMutation({
    mutationFn: ({ id, content, isGroup }) => {
      if (isGroup) {
        return base44.entities.GroupMessage.update(id, { content });
      } else {
        return base44.entities.DirectMessage.update(id, { content });
      }
    },
    onSuccess: () => {
      if (selectedGroupId) {
        queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroupId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['dm-messages', user?.id, selectedUserId] });
      }
      setEditingMsgId(null);
      setEditedContent('');
    },
  });

  const deleteMessage = useMutation({
    mutationFn: ({ id, isGroup }) => {
      if (isGroup) {
        return base44.entities.GroupMessage.delete(id);
      } else {
        return base44.entities.DirectMessage.delete(id);
      }
    },
    onSuccess: () => {
      if (selectedGroupId) {
        queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroupId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['dm-messages', user?.id, selectedUserId] });
      }
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      if (selectedUsers.length < 2) return;
      const freshMembers = selectedUsers.map(su => {
        const fresh = brokerageUsers.find(u => u.id === su.id);
        return fresh || su;
      });
      const groupMembers = [{ id: user.id, email: user.email, full_name: user.full_name }, ...freshMembers];
      const group = await base44.entities.GroupChat.create({
        brokerage_id: brokerageId,
        name: `${groupMembers.map(m => m.full_name.split(' ')[0]).join(', ')}`,
        created_by_email: user.email,
        created_by_name: user.full_name,
        members: groupMembers,
      });
      await queryClient.refetchQueries({ queryKey: ['group-chats', user?.id, brokerageId], type: 'all' });
      setTimeout(() => setSelectedGroupId(group.id), 50);
      setShowNewChat(false);
      setSelectedUsers([]);
    },
  });

  const broadcastTyping = (isTyping) => {
    if (!user?.email) return;
    const chatId = selectedGroupId || selectedUserId;
    if (!chatId) return;
    
    const key = `${chatId}-${user.id}`;
    if (isTyping) {
      if (typingTimeoutRef.current[key]) clearTimeout(typingTimeoutRef.current[key]);
      typingTimeoutRef.current[key] = setTimeout(() => {
        setTypingUsers(prev => { const u = { ...prev }; delete u[key]; return u; });
      }, 3000);
      setTypingUsers(prev => ({ ...prev, [key]: { id: user.id, name: user.display_name || user.full_name, email: user.email } }));
    }
  };

  const handleSend = () => {
    if (!messageText.trim()) return;
    if (selectedGroupId) {
      sendGroupMessage.mutate(messageText);
    } else {
      sendMessage.mutate(messageText);
    }
    setMessageText('');
    broadcastTyping(false);
    setTypingUsers({});
  };

  const updateGroupName = async () => {
    if (!newGroupName.trim()) return;
    await base44.entities.GroupChat.update(selectedGroupId, { name: newGroupName });
    await queryClient.refetchQueries({ queryKey: ['group-chats', user?.id, brokerageId] });
    setEditingGroupName(false);
    setNewGroupName('');
  };

  const filteredConversations = useMemo(() =>
    conversationSearch.trim()
      ? conversations.filter(c =>
          c.name?.toLowerCase().includes(conversationSearch.toLowerCase()) ||
          c.email?.toLowerCase().includes(conversationSearch.toLowerCase())
        )
      : conversations,
    [conversationSearch, conversations]
  );

  const filteredGroups = useMemo(() =>
    conversationSearch.trim()
      ? groups.filter(g => g.name?.toLowerCase().includes(conversationSearch.toLowerCase()))
      : groups,
    [conversationSearch, groups]
  );

  const filteredMessages = useMemo(() =>
    messageSearch.trim()
      ? (selectedGroupId ? groupMessages : messages).filter(msg => msg.content?.toLowerCase().includes(messageSearch.toLowerCase()))
      : (selectedGroupId ? groupMessages : messages),
    [messageSearch, messages, groupMessages, selectedGroupId]
  );

  const selectedUser = brokerageUsers.find(u => u.id === selectedUserId) ||
    (() => { const c = conversations.find(c => c.id === selectedUserId); return c ? { id: c.id, full_name: c.name, email: c.email, headshot: c.headshot } : null; })();

  const selectedGroup = groups.find(g => g.id === selectedGroupId);

  const getGroupDisplayName = (group) => {
    const freshMembers = group.members.map(m => {
      const fresh = brokerageUsers.find(u => u.id === m.id);
      return fresh || m;
    });
    return freshMembers.map(m => m.full_name.split(' ')[0]).join(', ');
  };

  const allChats = [
    ...filteredConversations.map(c => ({ ...c, type: 'dm' })),
    ...filteredGroups.map(g => ({ id: g.id, name: g.name, lastMessage: { created_date: g.created_date, content: g.last_message_preview }, type: 'group', members: g.members }))
  ].sort((a, b) => new Date(b.lastMessage?.created_date || 0) - new Date(a.lastMessage?.created_date || 0));

  const isGroupChat = !!selectedGroupId;
  const displayMessages = isGroupChat ? groupMessages : messages;
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const diffX = touchEndX - touchStartX.current;
    const diffY = Math.abs(touchEndY - touchStartY.current);
    
    // Swipe right with minimal vertical movement = go back
    if (diffX > 50 && diffY < 30 && isMobile && (selectedUserId || selectedGroupId)) {
      setSelectedUserId(null);
      setSelectedGroupId(null);
    }
  };

  return (
    <div 
      className="h-[100dvh] flex overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Sidebar - hidden on mobile when chat is open */}
      {(!isMobile || (!selectedUserId && !selectedGroupId)) && (
        <div className={cn('border-r border-border bg-background flex flex-col flex-shrink-0', isMobile ? 'w-full' : 'w-80')}>
            {/* Header */}
          <div className="px-6 py-4 border-b border-border/30 flex-shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-foreground">Messages</h1>
            <Button
              onClick={() => { setSelectedUsers([]); setShowNewChat(true); }}
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border border-border/40">
            <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              placeholder="Search..."
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
              className="bg-transparent outline-none text-sm w-full placeholder:text-muted-foreground/50"
            />
            {conversationSearch && (
              <button onClick={() => setConversationSearch('')} className="p-1 hover:bg-background rounded">
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            )}
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto">
          {allChats.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <MessageSquare className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            <div className="divide-y divide-border/30">
              {allChats.map((chat, i) => {
                const isSelected = (isGroupChat && chat.id === selectedGroupId) || (!isGroupChat && chat.id === selectedUserId);
                const isGroup = chat.type === 'group';
                const freshUser = !chat.type || chat.type === 'dm' ? brokerageUsers.find(u => u.id === chat.id) : null;
                let displayName = chat.name;
                if (!isGroup && freshUser) {
                  displayName = freshUser.display_name || freshUser.full_name || chat.name;
                }

                return (
                  <motion.button
                    key={chat.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    onClick={() => isGroup ? setSelectedGroupId(chat.id) : setSelectedUserId(chat.id)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-l-2',
                      isSelected ? 'bg-primary/5 border-primary' : 'hover:bg-muted/30 border-transparent'
                    )}
                  >
                    <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 overflow-hidden', isGroup ? 'bg-accent/20 text-accent text-lg' : 'bg-gradient-to-br from-primary/20 to-accent/20 text-primary')}>
                      {isGroup ? '👥' : freshUser?.headshot ? <img src={freshUser.headshot} alt={displayName} className="w-full h-full object-cover" /> : displayName?.[0]?.toUpperCase() || 'U'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{displayName}</p>
                      <p className="text-xs text-muted-foreground truncate line-clamp-1">{chat.lastMessage?.content || 'No messages'}</p>
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
        </div>
      )}

      {/* Main area - full screen on mobile when chat is open */}
      {!selectedUserId && !selectedGroupId && !isMobile ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 bg-background">
          <MessageSquare className="w-16 h-16 text-muted-foreground/20" />
          <p className="text-muted-foreground">Select a conversation to start messaging</p>
        </div>
      ) : (selectedUserId || selectedGroupId) ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className={cn('px-6 py-4 border-b border-border/30 bg-background flex-shrink-0 fixed top-16 left-0 right-0 z-40 md:top-0', isMobile && 'px-4 py-3')}>
            <div className="flex items-center justify-between gap-3">
              {isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedUserId(null);
                    setSelectedGroupId(null);
                  }}
                  className="rounded-lg h-9 w-9 flex-shrink-0"
                >
                  <ArrowLeft className="w-4 h-4" />
                </Button>
              )}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={cn('flex items-center gap-3', isMobile && 'flex-1 min-w-0')}>
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm', isGroupChat ? 'bg-accent/20 text-accent text-lg' : 'bg-gradient-to-br from-primary/20 to-accent/20 text-primary')}>
                    {isGroupChat ? '👥' : selectedUser?.full_name?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingGroupName ? (
                      <input
                        autoFocus
                        value={newGroupName}
                        onChange={(e) => setNewGroupName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') updateGroupName();
                          if (e.key === 'Escape') setEditingGroupName(false);
                        }}
                        className="px-2 py-1 rounded border border-primary bg-transparent text-sm font-semibold text-foreground outline-none"
                      />
                    ) : (
                      <div onClick={() => isGroupChat && (setEditingGroupName(true), setNewGroupName(selectedGroup?.name || ''))}>
                        <h2 className={cn('font-semibold text-foreground', isMobile && 'text-sm')}>{isGroupChat ? getGroupDisplayName(selectedGroup) : selectedUser?.display_name || selectedUser?.full_name}</h2>
                        <p className={cn('text-xs text-muted-foreground', isMobile && 'text-[11px]')}>{isGroupChat ? `${selectedGroup?.members?.length} members` : selectedUser?.email}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {!isMobile && (
                <div className="flex items-center gap-2 bg-muted rounded-lg px-3 py-2 border border-border/40">
                  <Search className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <input
                    type="text"
                    placeholder="Search..."
                    value={messageSearch}
                    onChange={(e) => setMessageSearch(e.target.value)}
                    className="bg-transparent outline-none text-sm w-28 placeholder:text-muted-foreground/50"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className={cn('flex-1 overflow-hidden flex flex-col', isMobile && 'mt-[72px]')}>
            <div className={cn('flex-1 overflow-y-auto space-y-3 flex flex-col justify-end scroll-smooth', isMobile ? 'px-3 py-3' : 'px-6 py-4')} style={{ overscrollBehavior: 'contain' }}>
              {displayMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-center">
                  <p className="text-sm text-muted-foreground">{messageSearch ? 'No messages found' : 'No messages yet. Start the conversation!'}</p>
                </div>
              ) : (
                displayMessages.map((msg, idx) => {
                  const isOwn = msg.sender_id === user.id;
                  const isMediaFile = msg.content?.startsWith('[file]');
                  const isVoiceMemo = msg.content?.startsWith('[voice_memo]');
                  const fileData = isMediaFile ? msg.content.replace('[file]', '').split('|') : [];
                  const senderUser = brokerageUsers.find(u => u.id === msg.sender_id);
                  const senderName = senderUser?.display_name || senderUser?.full_name || msg.sender_name;
                  const senderPhoto = senderUser?.headshot || (msg.sender_id === user.id ? user.headshot : msg.sender_photo);

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, delay: idx * 0.02 }}
                      className={cn('flex gap-2.5 group', isOwn && 'flex-row-reverse')}
                      onMouseEnter={() => setHoveredMsgId(msg.id)}
                      onMouseLeave={() => setHoveredMsgId(null)}
                    >
                      <button
                        onClick={() => setSelectedUserProfile({ ...brokerageUsers.find(u => u.id === msg.sender_id), email: msg.sender_email, full_name: msg.sender_name, headshot: msg.sender_photo })}
                        className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0 font-bold text-xs text-primary overflow-hidden hover:opacity-80 transition-opacity mt-0.5"
                      >
                        {senderPhoto ? <img src={senderPhoto} alt={senderName} className="w-full h-full object-cover" /> : senderName?.[0]?.toUpperCase() || 'U'}
                      </button>

                      <div className={cn('flex flex-col max-w-sm', isOwn && 'items-end')}>
                        {editingMsgId === msg.id ? (
                          <div className="flex gap-2 mb-2 w-full">
                            <textarea
                              value={editedContent}
                              onChange={(e) => setEditedContent(e.target.value)}
                              className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 resize-none max-h-24"
                              rows={2}
                            />
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={() => editMessage.mutate({ id: msg.id, content: editedContent, isGroup: isGroupChat })}
                                disabled={editMessage.isPending}
                                className="px-2 py-1 bg-primary text-primary-foreground rounded text-xs font-medium hover:bg-primary/90 transition-colors"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => {
                                  setEditingMsgId(null);
                                  setEditedContent('');
                                }}
                                className="px-2 py-1 bg-muted text-foreground rounded text-xs font-medium hover:bg-muted/80 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className={cn('rounded-2xl px-4 py-2.5 text-sm leading-relaxed', isOwn ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-card border border-border rounded-tl-sm')}>
                            {isVoiceMemo ? (
                              <audio controls src={msg.content.replace('[voice_memo]', '')} className="h-8 max-w-xs" />
                            ) : isMediaFile ? (
                              fileData[1]?.startsWith('image/') ? (
                                <img src={fileData[0]} alt={fileData[2]} className="rounded-lg max-w-xs max-h-64 object-cover" />
                              ) : fileData[1]?.startsWith('video/') ? (
                                <video src={fileData[0]} controls className="rounded-lg max-w-xs max-h-64" />
                              ) : (
                                <a href={fileData[0]} target="_blank" rel="noopener noreferrer" className={cn('underline text-sm', isOwn ? 'text-primary-foreground' : 'text-primary')}>
                                  {fileData[2]}
                                </a>
                              )
                            ) : (
                              <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                            )}
                          </div>
                        )}
                        <div className={cn('flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1.5 px-1', isOwn && 'flex-row-reverse')}>
                          <span>{format(new Date(msg.created_date), 'h:mm a')}</span>
                          {isOwn && (msg.read ? <CheckCheck className="w-3.5 h-3.5 text-accent" /> : <Check className="w-3.5 h-3.5 text-muted-foreground/50" />)}
                        </div>
                        {msg.reactions?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {msg.reactions.map((reaction, ridx) => (
                              <button
                                key={ridx}
                                onClick={async () => {
                                  const newReactions = [...msg.reactions];
                                  const userIdx = newReactions[ridx].users.indexOf(user?.email);
                                  if (userIdx !== -1) {
                                    newReactions[ridx].users.splice(userIdx, 1);
                                    if (newReactions[ridx].users.length === 0) newReactions.splice(ridx, 1);
                                  } else {
                                    newReactions[ridx].users.push(user?.email);
                                  }
                                  if (isGroupChat) {
                                    await base44.entities.GroupMessage.update(msg.id, { reactions: newReactions });
                                    queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroupId] });
                                  } else {
                                    await base44.entities.DirectMessage.update(msg.id, { reactions: newReactions });
                                    queryClient.invalidateQueries({ queryKey: ['dm-messages', user?.id, selectedUserId] });
                                  }
                                }}
                                className={cn('flex items-center gap-1 px-2 py-0.5 rounded-full text-xs border transition-all', reaction.users.includes(user?.email) ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted/50 border-border/50 hover:bg-muted/70')}
                              >
                                <span>{reaction.emoji}</span>
                                {reaction.users.length > 1 && <span className="text-[10px]">{reaction.users.length}</span>}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {hoveredMsgId === msg.id && !editingMsgId && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex gap-1 mt-0.5"
                        >
                          {isOwn && (
                            <>
                              <button
                                onClick={() => {
                                  setEditingMsgId(msg.id);
                                  setEditedContent(msg.content);
                                }}
                                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                title="Edit message"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingMsgId(msg.id)}
                                className="p-1 rounded hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition-colors"
                                title="Delete message"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => setOpenEmojiFor(openEmojiFor === msg.id ? null : msg.id)}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <SmilePlus className="w-4 h-4" />
                          </button>
                        </motion.div>
                      )}

                      <AnimatePresence>
                        {openEmojiFor === msg.id && (
                          <div ref={emojiPickerRef} className="absolute top-0 right-0 z-50">
                            <div className="bg-card border border-border rounded-lg p-1 shadow-lg">
                              <EmojiPicker
                                onSelect={async (emoji) => {
                                  const newReactions = (msg.reactions || []).length > 0 ? [...msg.reactions] : [];
                                  const idx = newReactions.findIndex(r => r.emoji === emoji);
                                  if (idx !== -1) {
                                    if (!newReactions[idx].users.includes(user?.email)) newReactions[idx].users.push(user?.email);
                                  } else {
                                    newReactions.push({ emoji, users: [user?.email] });
                                  }
                                  if (isGroupChat) {
                                    await base44.entities.GroupMessage.update(msg.id, { reactions: newReactions });
                                    queryClient.invalidateQueries({ queryKey: ['group-messages', selectedGroupId] });
                                  } else {
                                    await base44.entities.DirectMessage.update(msg.id, { reactions: newReactions });
                                    queryClient.invalidateQueries({ queryKey: ['dm-messages', user?.id, selectedUserId] });
                                  }
                                  setOpenEmojiFor(null);
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Typing indicator */}
          <AnimatePresence>
            {Object.values(typingUsers).length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className={cn('text-xs text-muted-foreground flex items-center gap-2', isMobile ? 'px-3 py-2' : 'px-6 py-2')}
              >
                <span className="flex gap-0.5 items-center">
                  {[0, 0.15, 0.3].map((d) => (
                    <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-bounce" style={{ animationDelay: `${d}s` }} />
                  ))}
                </span>
                <span>
                  {Object.values(typingUsers).map(t => t.name).join(', ')} {Object.values(typingUsers).length === 1 ? 'is' : 'are'} typing…
                </span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <div className={cn('border-t border-border/30 bg-background flex-shrink-0', isMobile ? 'px-3 py-3' : 'px-6 py-4')}>
            {voiceMemoUrl && (
              <div className="flex items-center gap-3 bg-muted/40 rounded-lg px-4 py-2 mb-3 border border-border/30">
                <audio controls src={voiceMemoUrl} className="flex-1 h-8" />
                <button onClick={() => setVoiceMemoUrl('')} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            <div className={cn('flex items-end gap-2.5', isMobile && 'gap-2')}>
              <textarea
                value={messageText}
                onChange={(e) => {
                  setMessageText(e.target.value);
                  if (e.target.value.trim()) broadcastTyping(true);
                }}
                onBlur={() => broadcastTyping(false)}
                onKeyDown={(e) => {
                   if (e.key === 'Enter' && !e.shiftKey) {
                     e.preventDefault();
                     handleSend();
                   }
                 }}
                placeholder="Type a message..."
                disabled={sendMessage.isPending || sendGroupMessage.isPending || !!voiceMemoUrl}
                rows={1}
                className={cn('flex-1 resize-none bg-muted border border-border/50 rounded-2xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 focus:border-transparent placeholder:text-muted-foreground/50 max-h-[120px] transition-all disabled:opacity-50', isMobile ? 'min-h-[40px]' : 'min-h-[44px]')}
              />
              {!isMobile && (
                <>
                  <FileUploadButton onFileSelect={({ file_url, fileName, fileType }) => sendMessage.mutate(`[file]${file_url}|${fileType}|${fileName}`)} disabled={sendMessage.isPending || !!voiceMemoUrl} />
                  <VoiceMemoButton
                    onSend={(content) => { sendMessage.mutate(content); setVoiceMemoUrl(''); }}
                    onStage={(content) => setVoiceMemoUrl(content.replace('[voice_memo]', ''))}
                    disabled={sendMessage.isPending || !!messageText.trim()}
                  />
                </>
              )}
              <Button
                onClick={() => {
                  if (voiceMemoUrl) {
                    sendMessage.mutate(`[voice_memo]${voiceMemoUrl}`);
                    setVoiceMemoUrl('');
                  } else {
                    handleSend();
                  }
                }}
                disabled={sendMessage.isPending || (!messageText.trim() && !voiceMemoUrl)}
                className={cn('rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground p-0 flex-shrink-0', isMobile ? 'h-10 w-10' : 'h-11 w-11')}
              >
                <Send className={cn('', isMobile ? 'w-3.5 h-3.5' : 'w-4 h-4')} />
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {/* New chat modal */}
      <AnimatePresence>
        {showNewChat && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => { setShowNewChat(false); setSelectedUsers([]); setUserSearchQuery(''); }}
            />
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="fixed inset-x-4 top-28 z-50 bg-card border border-border rounded-2xl shadow-xl max-h-96 overflow-hidden"
            >
              <div className="p-4 border-b border-border/50 flex-shrink-0 space-y-3">
                <Input
                  placeholder="Search teammates..."
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  autoFocus
                  className="text-sm"
                />
                {selectedUsers.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {selectedUsers.map(u => (
                      <div key={u.id} className="bg-primary/10 border border-primary/20 rounded-full px-3 py-1.5 text-xs font-medium flex items-center gap-2">
                        {u.display_name || u.full_name}
                        <button onClick={() => setSelectedUsers(selectedUsers.filter(su => su.id !== u.id))} className="text-primary/60 hover:text-primary ml-0.5">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="overflow-y-auto max-h-72">
                {(() => {
                  const filtered = brokerageUsers.filter(u => u.id !== user.id && !selectedUsers.some(su => su.id === u.id)).filter(u =>
                    u.full_name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                    u.display_name?.toLowerCase().includes(userSearchQuery.toLowerCase()) ||
                    u.email?.toLowerCase().includes(userSearchQuery.toLowerCase())
                  );
                  if (filtered.length === 0) {
                    return <div className="p-8 text-center text-sm text-muted-foreground">{userSearchQuery ? 'No users found' : 'No teammates'}</div>;
                  }
                  return filtered.map((u) => (
                    <motion.button
                      key={u.id}
                      onClick={() => setSelectedUsers([...selectedUsers, u])}
                      className="w-full flex items-center gap-3 px-4 py-3 border-b border-border/30 last:border-b-0 text-left hover:bg-muted/40 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center flex-shrink-0 font-bold text-sm text-primary overflow-hidden">
                        {u.headshot ? <img src={u.headshot} alt={u.display_name || u.full_name} className="w-full h-full object-cover" /> : (u.display_name || u.full_name)?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{u.display_name || u.full_name}</p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <Plus className="w-4 h-4 text-muted-foreground" />
                    </motion.button>
                  ));
                })()}
              </div>
              {selectedUsers.length > 0 && (
                <div className="p-4 border-t border-border/50 flex gap-2">
                  <Button
                    onClick={() => setSelectedUsers([])}
                    variant="outline"
                    className="flex-1 h-9 rounded-lg text-sm"
                  >
                    Clear
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedUsers.length === 1) {
                        setSelectedUserId(selectedUsers[0].id);
                      } else {
                        createGroup.mutate();
                      }
                      setShowNewChat(false);
                      setSelectedUsers([]);
                      setUserSearchQuery('');
                    }}
                    disabled={createGroup.isPending}
                    className="flex-1 h-9 rounded-lg text-sm font-medium"
                  >
                    {selectedUsers.length === 1 ? 'Start Chat →' : 'Create Group →'}
                  </Button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedUserProfile && (
          <UserProfilePanel user={selectedUserProfile} brokerageId={brokerageId} onClose={() => setSelectedUserProfile(null)} />
        )}
      </AnimatePresence>

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {deletingMsgId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setDeletingMsgId(null)}
            />
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 20, opacity: 0 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-card border border-border rounded-xl shadow-lg p-6 max-w-sm"
            >
              <h3 className="font-semibold text-foreground mb-2">Delete message?</h3>
              <p className="text-sm text-muted-foreground mb-6">This action cannot be undone.</p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeletingMsgId(null)}
                  className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    deleteMessage.mutate({ id: deletingMsgId, isGroup: isGroupChat });
                    setDeletingMsgId(null);
                  }}
                  disabled={deleteMessage.isPending}
                  className="px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}