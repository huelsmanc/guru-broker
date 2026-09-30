import React, { useState, useEffect, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Send, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { isAdminRole, normalizeRole, can } from '../../shared/permissions.generated.js';

export default function AdminChat() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const isAdmin = isAdminRole(user?.role);

  const { data: messages = [] } = useQuery({
    queryKey: ['admin-messages'],
    queryFn: () => base44.entities.AdminMessage.filter({ brokerage_id: brokerageId }, 'created_date', 100),
    enabled: !!user && isAdmin && !!brokerageId,
    refetchInterval: 3000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubscribe = base44.entities.AdminMessage.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
    });
    return unsubscribe;
  }, [queryClient, isAdmin]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    await base44.entities.AdminMessage.create({
      sender_name: user.full_name,
      sender_email: user.email,
      content: text.trim(),
      brokerage_id: brokerageId,
    });
    setText('');
    setSending(false);
    queryClient.invalidateQueries({ queryKey: ['admin-messages'] });
  };

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center">
          <ShieldCheck className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">This area is for brokers and admins only.</p>
        </div>
      </div>
    );
  }

  // Group messages by date
  const grouped = messages.reduce((acc, msg) => {
    const day = msg.created_date ? format(new Date(msg.created_date), 'MMMM d, yyyy') : 'Today';
    if (!acc[day]) acc[day] = [];
    acc[day].push(msg);
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-card flex-shrink-0">
        <ShieldCheck className="w-5 h-5 text-primary" />
        <h2 className="font-semibold text-foreground">Broker Chat</h2>
        <span className="text-sm text-muted-foreground">· Admins only</span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2 bg-background">
        {Object.entries(grouped).map(([day, dayMessages]) => (
          <div key={day}>
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-xs text-muted-foreground font-medium px-2">{day}</span>
              <div className="flex-1 h-px bg-border" />
            </div>
            {dayMessages.map((msg, i) => {
              const isOwn = msg.sender_email === user?.email;
              const prevMsg = dayMessages[i - 1];
              const sameUser = prevMsg?.sender_email === msg.sender_email;

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex items-start gap-3', isOwn && 'flex-row-reverse', sameUser && 'mt-0.5')}
                >
                  {!sameUser ? (
                    <div className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold mt-0.5',
                      isOwn ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                    )}>
                      {msg.sender_name?.[0]?.toUpperCase()}
                    </div>
                  ) : (
                    <div className="w-8 flex-shrink-0" />
                  )}
                  <div className={cn('max-w-[70%]', isOwn && 'items-end flex flex-col')}>
                    {!sameUser && (
                      <div className={cn('flex items-baseline gap-2 mb-1', isOwn && 'flex-row-reverse')}>
                        <span className="text-xs font-semibold text-foreground">{isOwn ? 'You' : msg.sender_name}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {msg.created_date ? format(new Date(msg.created_date), 'h:mm a') : ''}
                        </span>
                      </div>
                    )}
                    <div className={cn(
                      'px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
                      isOwn
                        ? 'bg-primary text-primary-foreground rounded-tr-md'
                        : 'bg-card border border-border rounded-tl-md'
                    )}>
                      {msg.content}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
            <ShieldCheck className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="font-medium text-foreground">Broker Chat</p>
            <p className="text-sm text-muted-foreground mt-1">Private channel for brokers and admins.</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-card flex items-end gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
          }}
          placeholder="Message brokers..."
          rows={1}
          className="flex-1 resize-none bg-muted rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 min-h-[44px] max-h-[120px]"
        />
        <Button
          onClick={handleSend}
          disabled={sending || !text.trim()}
          className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 p-0 flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}