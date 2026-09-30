import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowLeft, UserCheck, CheckCircle, PhoneCall, Plus, MessageSquare, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ChatBubble from '@/components/chat/ChatBubble';
import ChatInput from '@/components/chat/ChatInput';
import TagButton from '@/components/chat/TagButton';
import NewConversationDialog from '@/components/chat/NewConversationDialog';
import ConversationList from '@/components/dashboard/ConversationList';
import { motion } from 'framer-motion';

export default function Chat() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const conversationId = urlParams.get('id');
  const isNewConversation = urlParams.get('typing') === '1';
  const messagesEndRef = useRef(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showNewConvo, setShowNewConvo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSummary, setShowSummary] = useState(false);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const isAdmin = user?.role === 'admin';

  const { data: brokerageSettings } = useQuery({
    queryKey: ['brokerage-settings', brokerageId],
    queryFn: () => base44.entities.BrokerageSettings.filter({ brokerage_id: brokerageId }),
    enabled: !!brokerageId,
    select: (data) => data[0],
  });

  const { data: conversation } = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: () => base44.entities.Conversation.filter({ id: conversationId }),
    enabled: !!conversationId,
    select: (data) => data[0],
  });

  const getAiSystemPrompt = () => {
    if (!brokerageSettings) {
      return 'You are a managing broker.';
    }
    const brokerPersona = `You are ${brokerageSettings.broker_name}${brokerageSettings.broker_title ? `, ${brokerageSettings.broker_title}` : ''} at ${brokerageSettings.brokerage_name}. Your name is ${brokerageSettings.broker_name}.`;
    const agentName = conversation?.agent_name ? ` You are speaking with ${conversation.agent_name}.` : '';
    return `${brokerPersona}${agentName} You provide expert support to your agents through "Guru Broker." You help with transactions, compliance, marketing, commissions, training, and general real estate support. Be professional, warm, and concise. Address the agent by their name naturally in conversation. Speak as if you ARE this broker in person — never reveal you are AI. If asked your name, always say you are ${brokerageSettings.broker_name}.`;
  };

  const aiSystemPrompt = getAiSystemPrompt();

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: () => base44.entities.Message.filter({ conversation_id: conversationId }, 'created_date', 200),
    enabled: !!conversationId,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Mark messages from the other party as read when conversation is open
  useEffect(() => {
    if (!messages.length || !conversationId) return;
    const unread = messages.filter(m => {
      const isFromOther = isAdmin ? m.sender_role === 'agent' : m.sender_role !== 'agent';
      return isFromOther && !m.read;
    });
    unread.forEach(m => base44.entities.Message.update(m.id, { read: true }));
    if (unread.length > 0) {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
    }
  }, [messages, conversationId]);

  // Real-time subscription for instant read status updates
  useEffect(() => {
    if (!conversationId) return;
    const unsubscribe = base44.entities.Message.subscribe((event) => {
      if (event.data?.conversation_id === conversationId) {
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      }
    });
    return unsubscribe;
  }, [conversationId]);

  // On new conversation, show typing indicator then generate AI response
  useEffect(() => {
    if (!isNewConversation || !conversationId || !brokerageId || messages.length === 0) return;

    let cancelled = false;
    const triggerAI = async () => {
      setAiLoading(true);
      // Realistic typing delay: 4-7 seconds
      const delay = 4000 + Math.random() * 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
      if (cancelled) return;

      const firstMsg = messages[0];
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `${aiSystemPrompt}\n\nAgent: ${firstMsg?.content}\n\nRespond to the agent's message.`,
      });
      if (cancelled) return;

      const aiResponse = result || 'I appreciate your question. Let me help you with that.';
      await base44.entities.Message.create({
        conversation_id: conversationId,
        brokerage_id: brokerageId,
        sender_role: 'ai',
        sender_name: brokerageSettings?.broker_name || 'Broker Support',
        content: aiResponse,
      });
      await base44.entities.Conversation.update(conversationId, { last_message_preview: aiResponse });
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      setAiLoading(false);
      // Remove the typing param from URL without reloading
      window.history.replaceState({}, '', `/Chat?id=${conversationId}`);
    };

    triggerAI();
    return () => { cancelled = true; };
  }, [isNewConversation, conversationId, brokerageId, messages.length]);

  const [editingMsgId, setEditingMsgId] = useState(null);
  const [editingMsgText, setEditingMsgText] = useState('');
  const [optimisticMessages, setOptimisticMessages] = useState([]);

  const sendMessage = useMutation({
    mutationFn: async (content) => {
      const senderRole = isAdmin ? 'broker' : 'agent';
      const tempId = `temp-${Date.now()}`;
      
      // Optimistic UI update
      const optimisticMsg = {
        id: tempId,
        conversation_id: conversationId,
        brokerage_id: brokerageId,
        sender_role: senderRole,
        sender_name: user.full_name,
        sender_email: user.email,
        content,
        created_date: new Date().toISOString(),
        read: true,
        optimistic: true,
      };
      
      setOptimisticMessages(prev => [...prev, optimisticMsg]);
      
      try {
        const createdMsg = await base44.entities.Message.create({
          conversation_id: conversationId,
          brokerage_id: brokerageId,
          sender_role: senderRole,
          sender_name: user.full_name,
          sender_email: user.email,
          content,
        });
        
        await base44.entities.Conversation.update(conversationId, {
          last_message_preview: content,
        });

        // If broker sends a message, mark conversation as broker-handled
        if (isAdmin) {
          await base44.entities.Conversation.update(conversationId, {
            handled_by: 'broker',
            broker_email: user.email,
          });
        }

        // Remove optimistic message and refetch
        setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
        queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });

        // If agent sent message and AI is handling, generate ChatGPT response
        if (!isAdmin && conversation?.handled_by === 'ai') {
          setAiLoading(true);

          const allMessages = [...messages, optimisticMsg];
          const conversationHistory = allMessages.map(m =>
            `${m.sender_role === 'agent' ? 'Agent' : 'Broker'}: ${m.content}`
          ).join('\n');

          const result = await base44.integrations.Core.InvokeLLM({
            prompt: `${aiSystemPrompt}\n\nConversation so far:\n${conversationHistory}\n\nRespond to the agent's latest message.`,
          });

          const aiResponse = result || 'I apologize, I was unable to process that. Please try again.';

          await base44.entities.Message.create({
            conversation_id: conversationId,
            brokerage_id: brokerageId,
            sender_role: 'ai',
            sender_name: brokerageSettings?.broker_name || 'Broker Support',
            content: aiResponse,
          });
          await base44.entities.Conversation.update(conversationId, {
            last_message_preview: aiResponse,
          });
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
          setAiLoading(false);
        }
      } catch (error) {
        // Rollback optimistic update on failure
        setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
        throw error;
      }
    },
    onError: (error) => {
      console.error('Failed to send message:', error);
    }
  });

  const editMessage = useMutation({
    mutationFn: (id, content) => base44.entities.Message.update(id, { content }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      setEditingMsgId(null);
      setEditingMsgText('');
    },
  });

  const deleteMessage = useMutation({
    mutationFn: (id) => base44.entities.Message.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['messages', conversationId] }),
  });

  const handleEditMessage = (message) => {
    setEditingMsgId(message.id);
    setEditingMsgText(message.content);
  };

  const handleSaveEdit = () => {
    if (editingMsgText.trim()) {
      editMessage.mutate(editingMsgId, editingMsgText.trim());
    }
  };

  const takeOver = async () => {
    await base44.entities.Conversation.update(conversationId, {
      handled_by: 'broker',
      broker_email: user.email,
    });
    queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
  };

  const resolveConversation = async () => {
    try {
      setSummaryLoading(true);
      await base44.entities.Conversation.update(conversationId, {
        status: 'resolved',
        handled_by: conversation?.handled_by || 'ai',
        broker_email: conversation?.broker_email || (conversation?.handled_by === 'broker' ? user.email : undefined),
      });
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
      setSummaryLoading(false);
    } catch (error) {
      console.error('Error resolving conversation:', error);
      setSummaryLoading(false);
    }
  };

  const isOlderThan24h = conversation?.updated_date && (Date.now() - new Date(conversation.updated_date).getTime()) > 86400000;

  const { data: conversations = [] } = useQuery({
    queryKey: ['chat-conversations', user?.email],
    queryFn: () => isAdmin
      ? base44.entities.Conversation.filter({ brokerage_id: brokerageId }, '-updated_date', 50)
      : base44.entities.Conversation.filter({ agent_email: user?.email, brokerage_id: brokerageId }, '-updated_date', 50),
    enabled: !conversationId && !!user && !!brokerageId,
  });

  const handleCreate = async ({ title, category, firstMessage }) => {
    const convo = await base44.entities.Conversation.create({
      title,
      category,
      agent_email: user.email,
      agent_name: user.full_name,
      brokerage_id: brokerageId,
      status: 'active',
      handled_by: 'ai',
      last_message_preview: firstMessage,
    });
    await base44.entities.Message.create({
      conversation_id: convo.id,
      brokerage_id: brokerageId,
      sender_role: 'agent',
      sender_name: user.full_name,
      sender_email: user.email,
      content: firstMessage,
    });
    setShowNewConvo(false);
    navigate(`/Chat?id=${convo.id}&typing=1`);
  };

  const filteredConversations = conversations.filter(convo => {
    const query = searchQuery.toLowerCase();
    return (
      convo.title?.toLowerCase().includes(query) ||
      convo.category?.toLowerCase().includes(query) ||
      convo.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  });

  if (!conversationId) {
    return (
      <div className="p-6 lg:p-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl lg:text-3xl font-bold text-foreground tracking-tight">Broker Support Chat</h1>
            <p className="text-muted-foreground mt-1">Ask your broker anything — AI-powered, instant responses</p>
          </div>
          {!isAdmin && brokerageId && (
            <Button onClick={() => setShowNewConvo(true)} className="gap-2 rounded-xl min-h-[44px] px-4 text-sm font-medium">
              <Plus className="w-5 h-5" /> New Conversation
            </Button>
          )}
        </div>

        {conversations.length > 0 && (
          <div className="mb-6">
            <input
              type="text"
              placeholder="Search by title, category, or tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        )}

        {!brokerageId ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <p className="text-muted-foreground">You are not associated with a brokerage yet.</p>
            <Button variant="outline" className="mt-4" onClick={() => navigate('/JoinBrokerage')}>Join a Brokerage</Button>
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">No conversations yet</h2>
            <p className="text-muted-foreground mb-6 max-w-sm">Start a conversation to get instant AI-powered support from your broker on any topic.</p>
            {!isAdmin && (
              <Button onClick={() => setShowNewConvo(true)} className="gap-2 rounded-xl">
                <Plus className="w-4 h-4" /> Start Your First Conversation
              </Button>
            )}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground/20 mb-3" />
            <p className="text-muted-foreground">No conversations match your search.</p>
          </div>
        ) : (
          <ConversationList conversations={filteredConversations} isBrokerView={isAdmin} />
        )}

        <NewConversationDialog
          open={showNewConvo}
          onClose={() => setShowNewConvo(false)}
          onCreate={handleCreate}
        />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border/30 bg-background flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link to="/Chat">
            <Button variant="ghost" className="rounded-lg h-9 w-9 p-0 flex items-center justify-center flex-shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg text-foreground truncate">{conversation?.title || 'Loading...'}</h2>
            <div className="flex items-center gap-2 mt-1">
              {conversation?.handled_by === 'broker' ? (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-primary/15 text-primary border-0 h-5">
                  <UserCheck className="w-3 h-3" /> Broker
                </Badge>
              ) : (
                <Badge variant="secondary" className="text-[10px] gap-1 bg-accent/15 text-accent border-0 h-5">
                  <PhoneCall className="w-3 h-3" /> Support
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px] capitalize h-5">{conversation?.status}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
           <TagButton
             tags={conversation?.tags || []}
             onTagsChange={(newTags) => {
               base44.entities.Conversation.update(conversationId, { tags: newTags });
               queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
             }}
           />
           {isAdmin && (
             <>
               {conversation?.handled_by === 'ai' && (
                 <Button onClick={takeOver} size="sm" className="gap-1.5 rounded-lg text-xs h-8 px-2">
                   <UserCheck className="w-3.5 h-3.5" /> Step In
                 </Button>
               )}
               {conversation?.handled_by === 'broker' && (
                 <Button onClick={async () => {
                   await base44.entities.Conversation.update(conversationId, { handled_by: 'ai' });
                   queryClient.invalidateQueries({ queryKey: ['conversation', conversationId] });
                 }} variant="outline" size="sm" className="gap-1.5 rounded-lg text-xs h-8 px-2">
                   Step Back
                 </Button>
               )}
               <Button onClick={resolveConversation} variant="outline" size="sm" className="gap-1.5 rounded-lg text-xs h-8 px-2" disabled={conversation?.status !== 'active' || summaryLoading}>
                  {summaryLoading ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Summarizing...</>
                  ) : (
                    <><CheckCircle className="w-3.5 h-3.5" /> Resolve</>
                  )}
                </Button>
             </>
           )}
         </div>
      </div>

      {/* Summary */}
       {conversation?.summary && (
         <div className="border-b border-border/30 bg-accent/5 flex-shrink-0">
           <button
             onClick={() => setShowSummary(!showSummary)}
             className="w-full px-6 py-3 flex items-center justify-between hover:bg-accent/10 transition-colors"
           >
             <div className="flex items-center gap-3 text-left">
               <div className="text-accent font-semibold text-sm">📋 Summary</div>
             </div>
             {showSummary ? <ChevronUp className="w-4 h-4 text-accent" /> : <ChevronDown className="w-4 h-4 text-accent" />}
           </button>
           {showSummary && (
             <div className="px-6 pb-4 text-sm text-foreground whitespace-pre-wrap max-h-64 overflow-y-auto">
               {conversation.summary}
             </div>
           )}
         </div>
       )}

      {/* Messages */}
       <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3 bg-background pb-[calc(env(safe-area-inset-bottom)+5rem)] flex flex-col">
         {[...messages, ...optimisticMessages].map((msg) => {
           const isOwnMsg = (msg.sender_role === 'agent' && !isAdmin) || (msg.sender_role === 'broker' && isAdmin);
           const isEditing = editingMsgId === msg.id;
           return (
             <div key={msg.id}>
               {isEditing ? (
                 <div className="flex gap-2 max-w-[85%] ml-auto">
                   <textarea
                     value={editingMsgText}
                     onChange={(e) => setEditingMsgText(e.target.value)}
                     className="flex-1 bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-2.5 text-sm resize-none outline-none focus:ring-2 focus:ring-primary/50"
                     rows={2}
                   />
                   <div className="flex gap-1">
                     <Button size="sm" onClick={handleSaveEdit} className="h-8 text-xs">Save</Button>
                     <Button size="sm" variant="outline" onClick={() => setEditingMsgId(null)} className="h-8 text-xs">Cancel</Button>
                   </div>
                 </div>
               ) : (
                 <ChatBubble
                   message={msg}
                   isOwnMessage={isOwnMsg}
                   onEdit={isOwnMsg && !msg.optimistic ? handleEditMessage : null}
                   onDelete={isOwnMsg && !msg.optimistic ? deleteMessage.mutate : null}
                   isOptimistic={msg.optimistic}
                 />
               )}
             </div>
           );
         })}
        {aiLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 max-w-[85%]"
          >
            <div className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center">
              <span className="text-xs font-bold text-muted-foreground">B</span>
            </div>
            <div className="bg-card border border-border rounded-2xl rounded-tl-md px-4 py-3">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
       <div className="flex-shrink-0 border-t border-border/30 bg-background overflow-hidden">
        {conversation?.status === 'active' && !isOlderThan24h && (
          <ChatInput
            onSend={(content) => sendMessage.mutate(content)}
            disabled={sendMessage.isPending || aiLoading}
          />
        )}
        {(isOlderThan24h || conversation?.status === 'resolved') && (
          <div className="px-6 py-4 text-center text-sm text-muted-foreground">
            {conversation?.status === 'resolved' ? 'This conversation has been resolved.' : 'This conversation is archived (24+ hours old). You can read but not reply.'}
          </div>
        )}
      </div>
    </div>
  );
}