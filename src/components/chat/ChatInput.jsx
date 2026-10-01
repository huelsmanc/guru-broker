import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Send, X } from 'lucide-react';
import VoiceMemoButton from './VoiceMemoButton';

export default function ChatInput({ onSend, disabled, fileScope }) {
  const [text, setText] = useState('');
  const [voiceMemoUrl, setVoiceMemoUrl] = useState('');

  const handleSend = () => {
    if (!text.trim() && !voiceMemoUrl) return;
    if (voiceMemoUrl) {
      onSend(`[voice_memo]${voiceMemoUrl}`);
      setVoiceMemoUrl('');
    } else {
      onSend(text.trim());
    }
    setText('');
  };

  const handleStageVoiceMemo = (content) => {
    const url = content.replace('[voice_memo]', '');
    setVoiceMemoUrl(url);
  };

  const clearVoiceMemo = () => {
    setVoiceMemoUrl('');
    setText('');
  };

  return (
    <div className="flex flex-col gap-3 p-4 border-t border-border bg-card">
      {voiceMemoUrl && (
        <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
          <audio controls src={voiceMemoUrl} className="flex-1 h-8" preload="metadata" />
          <button
            onClick={clearVoiceMemo}
            className="p-1.5 rounded-lg hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
            title="Remove voice memo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type your message..."
          disabled={disabled || !!voiceMemoUrl}
          rows={1}
          className="flex-1 resize-none bg-muted rounded-xl px-4 py-3 text-base sm:text-sm outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-muted-foreground/50 min-h-[44px] max-h-[120px] disabled:opacity-50"
        />
        <VoiceMemoButton onSend={onSend} onStage={handleStageVoiceMemo} disabled={disabled || !!voiceMemoUrl} scope={fileScope} />
        <Button
          onClick={handleSend}
          disabled={disabled || (!text.trim() && !voiceMemoUrl)}
          className="h-11 w-11 rounded-xl bg-primary hover:bg-primary/90 p-0"
        >
          <Send className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}