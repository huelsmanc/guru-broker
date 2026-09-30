import React, { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function CommentInput({ ideaId, brokerageId, brokerageUsers, parentCommentId, onSuccess }) {
  const queryClient = useQueryClient();
  const [content, setContent] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const textareaRef = useRef(null);

  const createComment = useMutation({
    mutationFn: async () => {
      const currentUser = await base44.auth.me();
      const mentionPattern = /@([a-zA-Z]+(?:\s[a-zA-Z]+)*)/g;
      const mentions = [];
      let match;
      while ((match = mentionPattern.exec(content)) !== null) {
        mentions.push(match[1]);
      }

      await base44.entities.Comment.create({
        brokerage_id: brokerageId,
        idea_id: ideaId,
        parent_comment_id: parentCommentId || null,
        author_email: currentUser.email,
        author_name: currentUser.full_name,
        content,
        mentions,
      });

      queryClient.invalidateQueries({ queryKey: ['comments', ideaId] });
      setContent('');
      setMentionSuggestions([]);
      setMentionQuery('');
      onSuccess?.();
    },
  });

  const handleTextChange = (e) => {
    const value = e.target.value;
    setContent(value);
    setCursorPos(e.target.selectionStart || 0);

    const lastAtIndex = value.lastIndexOf('@', cursorPos);
    if (lastAtIndex !== -1) {
      const textAfterAt = value.substring(lastAtIndex + 1, cursorPos);
      if (textAfterAt) {
        setMentionQuery(textAfterAt);
        const query = textAfterAt.toLowerCase();
        const filtered = brokerageUsers.filter(u =>
          u.full_name.toLowerCase().startsWith(query) || u.email.toLowerCase().startsWith(query)
        );
        setMentionSuggestions(filtered);
      } else {
        setMentionSuggestions([]);
        setMentionQuery('');
      }
    } else {
      setMentionSuggestions([]);
      setMentionQuery('');
    }
  };

  const insertMention = (userName) => {
    const lastAtIndex = content.lastIndexOf('@');
    if (lastAtIndex !== -1) {
      const beforeMention = content.substring(0, lastAtIndex);
      const afterCursor = content.substring(cursorPos);
      const newText = beforeMention + `@${userName} ` + afterCursor;
      setContent(newText);
      const newCursorPos = lastAtIndex + userName.length + 2;
      setCursorPos(newCursorPos);
      setMentionSuggestions([]);
      setMentionQuery('');

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    }
  };

  return (
    <div className="relative">
      <div className="flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleTextChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && mentionSuggestions.length === 0) {
              e.preventDefault();
              if (content.trim()) createComment.mutate();
            }
          }}
          placeholder="Add a comment... (use @ to mention colleagues)"
          rows={2}
          className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/40 resize-none placeholder:text-muted-foreground/60"
        />
        <Button
          onClick={() => createComment.mutate()}
          disabled={!content.trim() || createComment.isPending}
          size="sm"
          className="h-10 gap-1.5 rounded-lg flex-shrink-0"
        >
          <Send className="w-3.5 h-3.5" /> Send
        </Button>
      </div>

      {mentionSuggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -5 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -5 }}
          className="absolute bottom-full left-0 w-full mb-2 bg-card border border-border rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto"
        >
          <div className="p-1">
            {mentionSuggestions.map((user) => (
              <button
                key={user.id}
                onClick={() => insertMention(user.full_name)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-muted text-left text-sm"
              >
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden bg-primary/20">
                  {user.full_name?.[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{user.full_name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.email}</p>
                </div>
              </button>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  );
}