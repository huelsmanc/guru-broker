import React, { useState } from 'react';
import { Pin, X, ChevronDown, ChevronUp } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function PinnedMessages({ pinnedMessages, channel, isAdmin, getUserPhoto }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  if (pinnedMessages.length === 0) return null;

  const handleUnpin = async (msgId) => {
    await base44.entities.SocialMessage.update(msgId, { pinned: false, pinned_by: null });
    queryClient.invalidateQueries({ queryKey: ['social-messages', channel] });
  };

  const latest = pinnedMessages[pinnedMessages.length - 1];

  return (
    <div className="border-b border-border bg-amber-50/60 dark:bg-amber-900/10 flex-shrink-0">
      {/* Collapsed bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2 hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors text-left"
      >
        <Pin className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
        <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex-shrink-0">
          {pinnedMessages.length} Pinned {pinnedMessages.length === 1 ? 'Message' : 'Messages'}
        </span>
        <span className="text-xs text-muted-foreground truncate flex-1">
          — {latest.content?.startsWith('[voice_memo]') ? '🎤 Voice memo' : latest.content?.startsWith('[file]') ? '📎 File' : latest.content}
        </span>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />}
      </button>

      {/* Expanded list */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 space-y-2 max-h-64 overflow-y-auto">
              {pinnedMessages.map((msg) => (
                <div key={msg.id} className="flex items-start gap-2 bg-white dark:bg-card rounded-lg px-3 py-2 border border-amber-200/60 dark:border-amber-800/40">
                  <div className="flex-shrink-0 w-7 h-7 rounded overflow-hidden bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                    {msg.sender_photo || getUserPhoto(msg.sender_email) ? (
                      <img src={msg.sender_photo || getUserPhoto(msg.sender_email)} alt={msg.sender_name} className="w-full h-full object-cover" />
                    ) : (
                      msg.sender_name?.[0]?.toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs font-semibold text-foreground">{msg.sender_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {msg.created_date ? format(new Date(msg.created_date), 'MMM d, h:mm a') : ''}
                      </span>
                    </div>
                    <p className="text-xs text-foreground/80 truncate mt-0.5">
                      {msg.content?.startsWith('[voice_memo]') ? '🎤 Voice memo' : msg.content?.startsWith('[file]') ? '📎 Attachment' : msg.content}
                    </p>
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleUnpin(msg.id)}
                      className="flex-shrink-0 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                      title="Unpin message"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}