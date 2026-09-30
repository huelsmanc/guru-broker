import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { MessageSquare, Reply, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import CommentInput from './CommentInput';

export default function CommentThread({ ideaId, brokerageId, currentUserEmail, brokerageUsers }) {
  const queryClient = useQueryClient();
  const [replyingTo, setReplyingTo] = useState(null);

  const { data: comments = [] } = useQuery({
    queryKey: ['comments', ideaId],
    queryFn: () => base44.entities.Comment.filter({ idea_id: ideaId }, 'created_date', 100),
    enabled: !!ideaId,
  });

  const deleteCommentMutation = useMutation({
    mutationFn: (commentId) => base44.entities.Comment.delete(commentId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['comments', ideaId] }),
  });

  const topLevelComments = comments.filter(c => !c.parent_comment_id);
  const getReplies = (commentId) => comments.filter(c => c.parent_comment_id === commentId);

  const CommentItem = ({ comment, depth = 0 }) => {
    const replies = getReplies(comment.id);
    const isOwnComment = comment.author_email === currentUserEmail;

    return (
      <motion.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        className={`${depth > 0 ? 'ml-4 border-l-2 border-border pl-4' : ''}`}
      >
        <div className="bg-card rounded-lg border border-border/50 p-3 mb-3">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-sm font-medium text-foreground">{comment.author_name}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(comment.created_date), 'MMM d, h:mm a')}</p>
            </div>
            {isOwnComment && (
              <button
                onClick={() => deleteCommentMutation.mutate(comment.id)}
                className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                title="Delete comment"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <p className="text-sm text-foreground leading-relaxed mb-2">{comment.content}</p>
          <Button
            onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs h-8"
          >
            <Reply className="w-3 h-3" /> Reply
          </Button>
        </div>

        {replyingTo === comment.id && (
          <div className="ml-4 mb-3">
            <CommentInput
              ideaId={ideaId}
              brokerageId={brokerageId}
              brokerageUsers={brokerageUsers}
              parentCommentId={comment.id}
              onSuccess={() => setReplyingTo(null)}
            />
          </div>
        )}

        {replies.map(reply => (
          <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
        ))}
      </motion.div>
    );
  };

  return (
    <div className="mt-4 pt-4 border-t border-border">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm text-foreground">Comments ({comments.length})</h3>
      </div>

      <CommentInput
        ideaId={ideaId}
        brokerageId={brokerageId}
        brokerageUsers={brokerageUsers}
      />

      <div className="mt-4 space-y-3">
        {topLevelComments.length === 0 ? (
          <p className="text-xs text-muted-foreground">No comments yet. Start the discussion!</p>
        ) : (
          topLevelComments.map(comment => (
            <CommentItem key={comment.id} comment={comment} />
          ))
        )}
      </div>
    </div>
  );
}