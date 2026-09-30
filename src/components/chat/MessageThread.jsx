import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Send, X, SmilePlus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import EmojiPicker from './EmojiPicker';
import { isAdminRole, normalizeRole, can } from '../../../shared/permissions.generated.js';

export default function MessageThread({ messageId, brokerageId, user, brokerageUsers }) {
  const [replyText, setReplyText] = useState('');
  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editingReplyText, setEditingReplyText] = useState('');
  const [deletingReplyId, setDeletingReplyId] = useState(null);
  const [openEmojiFor, setOpenEmojiFor] = useState(null);
  const [hoveredReplyId, setHoveredReplyId] = useState(null);
  const queryClient = useQueryClient();
  const emojiPickerRef = useRef(null);

  const { data: replies = [] } = useQuery({
    queryKey: ['thread-replies', messageId],
    queryFn: () => base44.entities.ThreadReply.filter({ message_id: messageId, brokerage_id: brokerageId }, 'created_date', 100),
    enabled: !!messageId && !!brokerageId,
  });

  const createReply = useMutation({
    mutationFn: async () => {
      const currentUser = await base44.auth.me();
      await base44.entities.ThreadReply.create({
        brokerage_id: brokerageId,
        message_id: messageId,
        sender_name: currentUser.full_name,
        sender_email: currentUser.email,
        sender_photo: currentUser.headshot || '',
        content: replyText,
      });
      queryClient.invalidateQueries({ queryKey: ['thread-replies', messageId] });
      
      // Trigger notifications for thread reply
      base44.functions.invoke('notifyOnThreadReply', {
        messageId,
        replyContent: replyText,
        replierName: currentUser.full_name,
        replierEmail: currentUser.email,
        brokerageId
      }).catch(() => {});
      
      setReplyText('');
    },
  });

  const deleteReply = useMutation({
    mutationFn: async (replyId) => {
      await base44.entities.ThreadReply.delete(replyId);
      queryClient.invalidateQueries({ queryKey: ['thread-replies', messageId] });
      queryClient.invalidateQueries({ queryKey: ['all-thread-replies'] });
    },
  });

  const updateReply = useMutation({
    mutationFn: async ({ replyId, content }) => {
      await base44.entities.ThreadReply.update(replyId, { content });
      queryClient.invalidateQueries({ queryKey: ['thread-replies', messageId] });
    },
  });

  const getUserPhoto = (email, fallback) => {
    if (fallback) return fallback;
    const foundUser = brokerageUsers.find(u => u.email === email);
    return foundUser?.headshot || null;
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target)) {
        setOpenEmojiFor(null);
      }
    };

    if (openEmojiFor) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [openEmojiFor]);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 bg-muted/30 rounded-lg border border-border p-3 space-y-3 relative overflow-visible"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground">
          💬 Thread • {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
        </div>
      </div>

      {/* Replies List */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        <AnimatePresence>
          {replies.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No replies yet. Start the conversation!</p>
          ) : (
            replies.map((reply) => {
              const isEditing = editingReplyId === reply.id;
              const isHovered = hoveredReplyId === reply.id;

              return (
                <motion.div
                  key={reply.id}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="group relative flex gap-2 p-2 rounded bg-background hover:bg-card transition-colors"
                  onMouseEnter={() => setHoveredReplyId(reply.id)}
                  onMouseLeave={() => setHoveredReplyId(null)}
                >
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden bg-primary/20 flex-shrink-0">
                    {getUserPhoto(reply.sender_email, reply.sender_photo) ? (
                      <img src={getUserPhoto(reply.sender_email, reply.sender_photo)} alt={reply.sender_name} className="w-full h-full object-cover" />
                    ) : (
                      reply.sender_name?.[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-1">
                        <textarea
                          value={editingReplyText}
                          onChange={(e) => setEditingReplyText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              updateReply.mutate({ replyId: reply.id, content: editingReplyText });
                              setEditingReplyId(null);
                            }
                            if (e.key === 'Escape') setEditingReplyId(null);
                          }}
                          className="w-full bg-card border border-primary/40 rounded px-2 py-1 text-xs resize-none outline-none focus:ring-1 focus:ring-primary/30"
                          rows={2}
                          autoFocus
                        />
                        <div className="flex gap-1">
                          <button onClick={() => { updateReply.mutate({ replyId: reply.id, content: editingReplyText }); setEditingReplyId(null); }} className="text-[10px] font-medium text-primary hover:text-primary/80">Save</button>
                          <span className="text-[10px] text-muted-foreground">·</span>
                          <button onClick={() => setEditingReplyId(null)} className="text-[10px] text-muted-foreground hover:text-foreground">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1.5 mb-0.5">
                          <span className="text-xs font-semibold text-foreground">{reply.sender_name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            {reply.created_date ? format(new Date(reply.created_date), 'h:mm a') : ''}
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{reply.content}</p>
                        {reply.reactions?.length > 0 && (
                           <div className="flex flex-wrap gap-1 mt-1.5">
                             {reply.reactions.map((reaction, idx) => {
                               const reactionNames = reaction.users.map(email => brokerageUsers.find(u => u.email === email)?.full_name || email).join(', ');
                               return (
                                 <button
                                   key={idx}
                                   onClick={async () => {
                                     const newReactions = [...reply.reactions];
                                     const userIdx = newReactions[idx].users.indexOf(user?.email);
                                     if (userIdx !== -1) {
                                       newReactions[idx].users.splice(userIdx, 1);
                                       if (newReactions[idx].users.length === 0) newReactions.splice(idx, 1);
                                     } else {
                                       newReactions[idx].users.push(user?.email);
                                     }
                                     await base44.entities.ThreadReply.update(reply.id, { reactions: newReactions });
                                     queryClient.invalidateQueries({ queryKey: ['thread-replies', messageId] });
                                   }}
                                   className={cn('flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border transition-all', reaction.users.includes(user?.email) ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-muted/50 border-border/50 hover:bg-muted/70')}
                                   title={reactionNames}
                                 >
                                   <span>{reaction.emoji}</span>
                                   {reaction.users.length > 1 && <span className="text-[9px]">{reaction.users.length}</span>}
                                 </button>
                               );
                             })}
                           </div>
                         )}
                      </>
                    )}
                  </div>
                  {isHovered && !isEditing && (
                    <AnimatePresence>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="absolute right-1 top-0 -translate-y-1/2 flex items-center gap-0.5 bg-card border border-border rounded-lg shadow-md px-1 py-1 z-20"
                      >
                        <div className="relative">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (openEmojiFor !== reply.id) {
                                setOpenEmojiFor(reply.id);
                              } else {
                                setOpenEmojiFor(null);
                              }
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <SmilePlus className="w-3 h-3" />
                          </button>

                        </div>
                        {(reply.sender_email === user?.email || isAdminRole(user?.role)) && (
                          <>
                            <button
                              onClick={() => {
                                setEditingReplyId(reply.id);
                                setEditingReplyText(reply.content);
                              }}
                              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => setDeletingReplyId(reply.id)}
                              className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  )}
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>

      {/* Emoji Picker - Rendered at thread level to avoid scroll clipping */}
      <AnimatePresence>
        {openEmojiFor && (
          <div ref={emojiPickerRef} className="absolute top-2 right-2 z-50">
            <div className="bg-card border border-border rounded-lg p-1 shadow-lg">
              <EmojiPicker
                key={`picker-${openEmojiFor}`}
                onSelect={async (emoji) => {
                  const reply = replies.find(r => r.id === openEmojiFor);
                  if (!reply) return;
                  const newReactions = reply.reactions ? [...reply.reactions] : [];
                  const idx = newReactions.findIndex(r => r.emoji === emoji);
                  if (idx !== -1) {
                    if (!newReactions[idx].users.includes(user?.email)) newReactions[idx].users.push(user?.email);
                  } else {
                    newReactions.push({ emoji, users: [user?.email] });
                  }
                  await base44.entities.ThreadReply.update(reply.id, { reactions: newReactions });
                  queryClient.invalidateQueries({ queryKey: ['thread-replies', messageId] });
                  setOpenEmojiFor(null);
                }}
              />
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingReplyId} onOpenChange={(open) => !open && setDeletingReplyId(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this reply?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">This action cannot be undone.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingReplyId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { deleteReply.mutate(deletingReplyId); setDeletingReplyId(null); }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reply Input */}
      <div className="flex gap-2 items-end pt-2 border-t border-border">
        <input
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && replyText.trim()) {
              e.preventDefault();
              createReply.mutate();
            }
          }}
          placeholder="Reply in thread..."
          className="flex-1 bg-background rounded px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-muted-foreground/60"
        />
        <Button
          onClick={() => createReply.mutate()}
          disabled={!replyText.trim() || createReply.isPending}
          size="sm"
          className="h-8 w-8 p-0 rounded flex-shrink-0"
        >
          <Send className="w-3 h-3" />
        </Button>
      </div>
    </motion.div>
  );
}