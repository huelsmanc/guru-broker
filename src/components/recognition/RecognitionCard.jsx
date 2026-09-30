import React, { useState } from 'react';
import { Heart, SmilePlus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CATEGORY_COLORS = {
  teamwork: { emoji: '🤝', bgGradient: 'from-blue-500/10 to-cyan-500/10', borderGradient: 'from-blue-500/20 to-cyan-500/20', accent: 'text-blue-600 dark:text-blue-400' },
  client_service: { emoji: '😊', bgGradient: 'from-green-500/10 to-emerald-500/10', borderGradient: 'from-green-500/20 to-emerald-500/20', accent: 'text-green-600 dark:text-green-400' },
  sales: { emoji: '🎯', bgGradient: 'from-amber-500/10 to-orange-500/10', borderGradient: 'from-amber-500/20 to-orange-500/20', accent: 'text-amber-600 dark:text-amber-400' },
  leadership: { emoji: '⭐', bgGradient: 'from-purple-500/10 to-pink-500/10', borderGradient: 'from-purple-500/20 to-pink-500/20', accent: 'text-purple-600 dark:text-purple-400' },
  creativity: { emoji: '💡', bgGradient: 'from-pink-500/10 to-rose-500/10', borderGradient: 'from-pink-500/20 to-rose-500/20', accent: 'text-pink-600 dark:text-pink-400' },
  persistence: { emoji: '💪', bgGradient: 'from-red-500/10 to-orange-500/10', borderGradient: 'from-red-500/20 to-orange-500/20', accent: 'text-red-600 dark:text-red-400' },
  other: { emoji: '👏', bgGradient: 'from-slate-500/10 to-gray-500/10', borderGradient: 'from-slate-500/20 to-gray-500/20', accent: 'text-slate-600 dark:text-slate-400' },
};

const EMOJIS = ['❤️', '🎉', '🔥', '⭐', '👏', '💪', '🚀', '😍'];

export default function RecognitionCard({ recognition, isOwn, user, brokerageId, brokerageUsers = [] }) {
  const colors = CATEGORY_COLORS[recognition.category] || CATEGORY_COLORS.other;
  const categoryLabel = recognition.category.replace('_', ' ').toUpperCase();
  const queryClient = useQueryClient();
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const isAdmin = user?.role === 'admin';
  const getDisplayName = (email, fallback) => {
    const u = brokerageUsers.find(user => user.email === email);
    return u?.display_name || u?.full_name || fallback || 'Unknown';
  };
  const fromName = getDisplayName(recognition.from_email, recognition.from_name);
  const toName = getDisplayName(recognition.to_email, recognition.to_name);

  const deleteRecognition = useMutation({
    mutationFn: () => base44.entities.Recognition.delete(recognition.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['recognitions', brokerageId] }),
  });

  const handleAddReaction = async (emoji) => {
    const newReactions = recognition.reactions ? [...recognition.reactions] : [];
    const existingReaction = newReactions.find(r => r.emoji === emoji);
    
    if (existingReaction) {
      if (existingReaction.users.includes(user?.email)) {
        existingReaction.users = existingReaction.users.filter(e => e !== user?.email);
        if (existingReaction.users.length === 0) {
          newReactions = newReactions.filter(r => r.emoji !== emoji);
        }
      } else {
        existingReaction.users.push(user?.email);
      }
    } else {
      newReactions.push({ emoji, users: [user?.email] });
    }

    await base44.entities.Recognition.update(recognition.id, { reactions: newReactions });
    queryClient.invalidateQueries({ queryKey: ['recognitions', brokerageId] });
    setShowEmojiPicker(false);
  };

  return (
    <div className={cn(`group relative rounded-2xl border backdrop-blur-xl transition-all duration-500 hover:shadow-2xl hover:shadow-foreground/10 overflow-hidden
      bg-gradient-to-br ${colors.bgGradient}
      border-gradient-to-br ${colors.borderGradient}
      before:absolute before:inset-0 before:bg-gradient-to-br before:from-white/5 before:to-transparent before:rounded-2xl
      hover:before:opacity-100 before:opacity-0 before:transition-opacity hover:scale-[1.02]
      p-7`)}>
      
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Header with emoji and badge */}
          <div className="flex items-center gap-3 mb-5 flex-wrap">
            <div className="text-3xl animate-bounce" style={{ animationDuration: '2s' }}>
              {colors.emoji}
            </div>
            <Badge className={cn('text-xs font-bold bg-white/10 border border-white/20 backdrop-blur-sm', colors.accent)}>
              {categoryLabel}
            </Badge>
            {recognition.is_anonymous && (
              <Badge className="text-xs font-medium bg-amber-500/20 border border-amber-500/30 text-amber-600 dark:text-amber-400">🔒</Badge>
            )}
          </div>

          {/* Recognition text */}
          <p className="text-sm font-bold text-foreground mb-3 leading-relaxed">
            <span className={colors.accent}>{recognition.is_anonymous ? 'Someone' : fromName}</span>
            {' '}<span className="text-muted-foreground">recognized</span>{' '}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent font-black">{toName}</span>
          </p>

          {/* Message */}
          <p className="text-sm text-foreground/90 leading-relaxed mb-5">{recognition.message}</p>

          {/* Reactions */}
          {recognition.reactions && recognition.reactions.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {recognition.reactions.map((reaction, idx) => (
                <motion.button
                  key={idx}
                  whileHover={{ scale: 1.15 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleAddReaction(reaction.emoji)}
                  className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 backdrop-blur-sm',
                    reaction.users.includes(user?.email)
                      ? 'bg-green-500/30 border border-green-500/50 text-green-700 dark:text-green-300'
                      : 'bg-white/10 border border-white/20 text-foreground hover:bg-white/20'
                  )}
                >
                  <span>{reaction.emoji}</span>
                  {reaction.users.length > 1 && <span>{reaction.users.length}</span>}
                </motion.button>
              ))}
            </div>
          )}

          {/* Footer with add reaction */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground/70 font-medium">
              {format(new Date(recognition.created_date), 'MMM d, yyyy · h:mm a')}
            </p>
            <motion.div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 transition-all duration-200"
              >
                <SmilePlus className="w-4 h-4 text-foreground/70" />
              </motion.button>
              {showEmojiPicker && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="absolute bottom-full right-0 mb-2 bg-card border border-border/50 backdrop-blur-xl rounded-xl p-2 flex gap-1 shadow-xl"
                >
                  {EMOJIS.map(emoji => (
                    <motion.button
                      key={emoji}
                      whileHover={{ scale: 1.2 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleAddReaction(emoji)}
                      className="text-lg hover:bg-white/10 p-2 rounded-lg transition-colors flex-shrink-0"
                    >
                      {emoji}
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </motion.div>
          </div>
        </div>

        {/* Heart and Delete icons */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <motion.div
            whileHover={{ scale: 1.3, rotate: 15 }}
            whileTap={{ scale: 0.9 }}
          >
            <Heart className={cn('w-6 h-6 transition-all duration-300', isOwn ? 'text-green-500 fill-green-500 drop-shadow-lg' : 'text-green-500/50 hover:text-green-500')} fill={isOwn ? 'currentColor' : 'none'} />
          </motion.div>
          {isAdmin && (
            <>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowDeleteDialog(true)}
                disabled={deleteRecognition.isPending}
                className="p-1.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-all duration-200 disabled:opacity-50"
                title="Delete recognition"
              >
                <Trash2 className="w-4 h-4" />
              </motion.button>
              <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Recognition</DialogTitle>
                    <DialogDescription>Are you sure you want to delete this recognition? This action cannot be undone.</DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
                    <Button 
                      variant="destructive" 
                      onClick={() => {
                        deleteRecognition.mutate();
                        setShowDeleteDialog(false);
                      }}
                      disabled={deleteRecognition.isPending}
                    >
                      {deleteRecognition.isPending ? 'Deleting...' : 'Delete'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>
    </div>
  );
}