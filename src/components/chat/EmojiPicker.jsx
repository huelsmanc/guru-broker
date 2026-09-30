import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';

const DEFAULT_EMOJIS = ['👍', '❤️', '😂', '😢', '🔥'];

export default function EmojiPicker({ onSelect, className }) {
  const [showCustom, setShowCustom] = useState(false);
  
  useEffect(() => {
    setShowCustom(false);
  }, []);
  const [customEmoji, setCustomEmoji] = useState('');
  const [emojis] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('customEmojis')) || DEFAULT_EMOJIS;
    } catch {
      return DEFAULT_EMOJIS;
    }
  });

  const handleCustomSubmit = () => {
    if (customEmoji.trim()) {
      const updated = [customEmoji, ...emojis].slice(0, 20);
      localStorage.setItem('customEmojis', JSON.stringify(updated));
      onSelect(customEmoji);
      setCustomEmoji('');
      setShowCustom(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: -10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ duration: 0.15 }}
      className={cn(
        'bg-card border border-border rounded-lg shadow-lg z-50 p-1',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {!showCustom ? (
        <div className="flex items-center gap-1 flex-nowrap overflow-x-auto">
          {emojis.map((emoji) => (
            <button
              key={emoji}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(emoji);
              }}
              className="p-1.5 hover:bg-muted rounded transition-colors text-xl leading-none cursor-pointer"
              title={emoji}
            >
              {emoji}
            </button>
          ))}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowCustom(true);
            }}
            className="p-1.5 hover:bg-muted rounded transition-colors text-sm leading-none cursor-pointer"
            title="Add custom emoji"
          >
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-1">
          <Input
            value={customEmoji}
            onChange={(e) => setCustomEmoji(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCustomSubmit();
              if (e.key === 'Escape') setShowCustom(false);
            }}
            placeholder="Enter emoji..."
            maxLength={2}
            className="h-8 text-sm w-20 rounded"
            autoFocus
          />
          <button
            onClick={handleCustomSubmit}
            className="px-2 py-1 text-xs font-semibold text-primary hover:bg-primary/10 rounded transition-colors"
          >
            Add
          </button>
          <button
            onClick={() => setShowCustom(false)}
            className="px-2 py-1 text-xs text-muted-foreground hover:bg-muted rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      )}
    </motion.div>
  );
}