import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Star, Smile, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';

const EMOJI_REACTIONS = ['👏', '🎉', '⭐', '❤️', '🚀', '💯'];

export default function Reviews() {
  const { brokerageId, user } = useOutletContext();
  const queryClient = useQueryClient();
  const [showEmojiPicker, setShowEmojiPicker] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users', brokerageId],
    queryFn: () => base44.entities.User.list('-created_date', 500),
    enabled: !!brokerageId,
  });



  const { data: reviews = [] } = useQuery({
    queryKey: ['brokerage-reviews', brokerageId],
    queryFn: async () => {
      const all = await base44.entities.ClientReview.filter({
        brokerage_id: brokerageId,
        status: 'submitted'
      }, '-created_date', 100);
      return all;
    },
    enabled: !!brokerageId,
    refetchInterval: 30000,
  });

  const isAdmin = user?.role === 'admin';

  const updateReaction = useMutation({
    mutationFn: async ({ reviewId, emoji }) => {
      const review = reviews.find(r => r.id === reviewId);
      const currentReactions = review?.reactions || [];
      const reactionIndex = currentReactions.findIndex(r => r.emoji === emoji);
      
      let updatedReactions = [...currentReactions];
      if (reactionIndex !== -1) {
        const userIndex = updatedReactions[reactionIndex].users.indexOf(user?.email);
        if (userIndex !== -1) {
          updatedReactions[reactionIndex].users.splice(userIndex, 1);
          if (updatedReactions[reactionIndex].users.length === 0) {
            updatedReactions.splice(reactionIndex, 1);
          }
        } else {
          updatedReactions[reactionIndex].users.push(user?.email);
        }
      } else {
        updatedReactions.push({ emoji, users: [user?.email] });
      }
      
      await base44.entities.ClientReview.update(reviewId, { reactions: updatedReactions });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brokerage-reviews', brokerageId] }),
  });

  const deleteReview = useMutation({
    mutationFn: (reviewId) => base44.entities.ClientReview.delete(reviewId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brokerage-reviews', brokerageId] }),
  });

  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length).toFixed(1)
    : 0;

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Star className="w-7 h-7 text-yellow-500 fill-yellow-500" />
          <h1 className="text-3xl font-bold text-foreground">Client Reviews</h1>
        </div>
        <p className="text-muted-foreground">Feedback from clients across your brokerage</p>
      </motion.div>

      {reviews.length > 0 && (
        <Card className="p-6 border-border/40 bg-gradient-to-br from-primary/5 to-accent/5 mb-8">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Average Rating</p>
              <p className="text-4xl font-bold text-foreground mt-1">{avgRating} / 5.0</p>
              <p className="text-xs text-muted-foreground mt-1">{reviews.length} review{reviews.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`w-8 h-8 ${
                    star <= Math.round(avgRating)
                      ? 'fill-yellow-400 text-yellow-400'
                      : 'text-muted-foreground/20'
                  }`}
                />
              ))}
            </div>
          </div>
        </Card>
      )}

      {reviews.length === 0 ? (
        <Card className="p-12 border-border/40 text-center">
          <Star className="w-12 h-12 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-muted-foreground">No reviews yet</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review, idx) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-card rounded-2xl border border-border/40 p-5"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <p className="font-semibold text-foreground">{review.client_name}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Reviewed by <strong>{review.agent_name}</strong> • {review.property_address}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex gap-0.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= review.rating
                            ? 'fill-yellow-400 text-yellow-400'
                            : 'text-muted-foreground/20'
                        }`}
                      />
                    ))}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => setDeleteConfirm(review.id)}
                      disabled={deleteReview.isPending}
                      className="p-1.5 text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                      title="Delete review"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {review.comment && (
                <p className="text-sm text-foreground leading-relaxed italic">{review.comment}</p>
              )}

              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-muted-foreground">
                  {new Date(review.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
                
                <div className="flex items-center gap-2">
                  {review.reactions?.map((reaction) => {
                    const userNames = reaction.users
                      .map(email => allUsers.find(u => u.email === email)?.full_name || email)
                      .join(', ');
                    return (
                      <button
                        key={reaction.emoji}
                        onClick={() => updateReaction.mutate({ reviewId: review.id, emoji: reaction.emoji })}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                          reaction.users.includes(user?.email)
                            ? 'bg-primary/20 text-primary border border-primary/40'
                            : 'bg-muted/50 text-muted-foreground hover:bg-muted border border-border/40'
                        }`}
                        title={userNames}
                      >
                        <span>{reaction.emoji}</span>
                        <span>{reaction.users.length}</span>
                      </button>
                    );
                  })}
                  
                  <div className="relative">
                    <button
                      onClick={() => setShowEmojiPicker(showEmojiPicker === review.id ? null : review.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-muted/50 hover:bg-muted border border-border/40 text-muted-foreground transition-all"
                    >
                      <Smile className="w-4 h-4" />
                    </button>
                    
                    {showEmojiPicker === review.id && (
                      <div className="absolute bottom-full right-0 mb-2 bg-card border border-border/40 rounded-xl shadow-lg p-2 flex gap-1 z-10">
                        {EMOJI_REACTIONS.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              updateReaction.mutate({ reviewId: review.id, emoji });
                              setShowEmojiPicker(null);
                            }}
                            className="text-lg hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Review</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Are you sure you want to delete this review? This action cannot be undone.</p>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                deleteReview.mutate(deleteConfirm);
                setDeleteConfirm(null);
              }}
              disabled={deleteReview.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}