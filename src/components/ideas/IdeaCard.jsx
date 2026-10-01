import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import CommentThread from './CommentThread';

const STATUS_COLORS = {
  under_review: { bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-700', badge: 'bg-blue-100' },
  in_progress: { bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-700', badge: 'bg-amber-100' },
  implemented: { bg: 'bg-green-50 dark:bg-green-950', text: 'text-green-700', badge: 'bg-green-100' },
  rejected: { bg: 'bg-red-50 dark:bg-red-950', text: 'text-red-700', badge: 'bg-red-100' },
};

const CATEGORY_EMOJIS = {
  process: '⚙️',
  technology: '💻',
  culture: '🤝',
  marketing: '📣',
  client_service: '😊',
  other: '💡',
};

export default function IdeaCard({ idea, onUpvote, onDownvote, currentUserEmail, isAdmin, brokerageUsers = [], brokerageId }) {
  const [showComments, setShowComments] = useState(false);
  const colors = STATUS_COLORS[idea.status] || STATUS_COLORS.under_review; // ideas saved without a status count as under review
  const hasUpvoted = idea.upvotes?.includes(currentUserEmail);
  const hasDownvoted = idea.downvotes?.includes(currentUserEmail);
  const upvoteCount = idea.upvotes?.length || 0;
  const downvoteCount = idea.downvotes?.length || 0;
  const netScore = upvoteCount - downvoteCount;

  const getUserName = (email) => {
    const user = brokerageUsers.find(u => u.email === email);
    return user?.full_name || email;
  };

  return (
    <div className={cn('rounded-2xl border-2 p-5', colors.bg)}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{CATEGORY_EMOJIS[idea.category]}</span>
            <Badge className={cn('text-xs border-transparent shadow-none hover:opacity-90', colors.badge, colors.text)}>
              {idea.status.replace('_', ' ').toUpperCase()}
            </Badge>
            {idea.is_anonymous && (
              <Badge variant="outline" className="text-xs">Anonymous</Badge>
            )}
          </div>
          <h3 className="font-bold text-foreground text-lg">{idea.title}</h3>
        </div>
      </div>

      <p className="text-sm text-foreground leading-relaxed mb-3">{idea.description}</p>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {idea.is_anonymous ? 'Anonymous' : idea.submitter_name}
          {' '} • {format(new Date(idea.created_date), 'MMM d, yyyy')}
        </span>
      </div>

      {idea.admin_notes && isAdmin && (
        <div className="mt-3 pt-3 border-t border-current/10">
          <p className="text-xs font-semibold text-foreground mb-1">Admin Notes:</p>
          <p className="text-xs text-foreground/70">{idea.admin_notes}</p>
        </div>
      )}

      <div className="flex items-center gap-2 mt-4 flex-wrap">
        <Button
          onClick={() => setShowComments(!showComments)}
          variant="outline"
          size="sm"
          className="gap-1.5 rounded-lg"
        >
          <MessageSquare className="w-4 h-4" />
        </Button>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onUpvote}
                variant={hasUpvoted ? 'default' : 'outline'}
                size="sm"
                className="gap-1.5 rounded-lg"
              >
                <ThumbsUp className={cn('w-4 h-4', hasUpvoted && 'fill-current')} />
                {upvoteCount > 0 && <span>{upvoteCount}</span>}
              </Button>
            </TooltipTrigger>
            {upvoteCount > 0 && (
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Upvoted by:</p>
                  {idea.upvotes?.map((email, idx) => <p key={idx} className="text-xs">{getUserName(email)}</p>)}
                </div>
              </TooltipContent>
            )}
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                onClick={onDownvote}
                variant={hasDownvoted ? 'destructive' : 'outline'}
                size="sm"
                className="gap-1.5 rounded-lg"
              >
                <ThumbsDown className={cn('w-4 h-4', hasDownvoted && 'fill-current')} />
                {downvoteCount > 0 && <span>{downvoteCount}</span>}
              </Button>
            </TooltipTrigger>
            {downvoteCount > 0 && (
              <TooltipContent side="top" className="max-w-xs">
                <div className="space-y-1">
                  <p className="text-xs font-semibold">Downvoted by:</p>
                  {idea.downvotes?.map((email, idx) => <p key={idx} className="text-xs">{getUserName(email)}</p>)}
                </div>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        {(upvoteCount > 0 || downvoteCount > 0) && (
          <span className={cn('text-xs font-semibold ml-auto', netScore > 0 ? 'text-green-600' : netScore < 0 ? 'text-red-600' : 'text-muted-foreground')}>
            Score: {netScore > 0 ? '+' : ''}{netScore}
          </span>
        )}
      </div>

      {showComments && (
        <CommentThread
          ideaId={idea.id}
          brokerageId={brokerageId}
          currentUserEmail={currentUserEmail}
          brokerageUsers={brokerageUsers}
        />
      )}
    </div>
  );
}