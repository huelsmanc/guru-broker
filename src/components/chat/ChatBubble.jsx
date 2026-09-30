import React, { useState } from 'react';
import { format } from 'date-fns';
import { UserCheck, Check, CheckCheck, Trash2, Edit2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export default function ChatBubble({ message, isOwnMessage, onEdit, onDelete, isOptimistic }) {
  const [showActions, setShowActions] = useState(false);
  const isAgent = message.sender_role === 'agent';
  const isAI = message.sender_role === 'ai';
  const isBroker = message.sender_role === 'broker';

  const isMediaFile = message.content?.startsWith('[file]');
  const isVoiceMemo = message.content?.startsWith('[voice_memo]');
  const isTextMessage = !isMediaFile && !isVoiceMemo;

  return (
    <div className={cn('flex gap-2 max-w-[85%] group', isOwnMessage ? 'ml-auto flex-row-reverse' : '', isOptimistic && 'opacity-75')}>
      {!isOwnMessage && (
        <div className={cn(
          'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 overflow-hidden',
          'bg-muted'
        )}>
          {message.sender_photo ? (
            <img src={message.sender_photo} alt={message.sender_name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-xs font-bold text-muted-foreground">
              {(isAI || isBroker) ? 'B' : message.sender_name?.[0]?.toUpperCase() || 'A'}
            </span>
          )}
        </div>
      )}

      <div>
        {!isOwnMessage && (
          <p className="text-[11px] text-muted-foreground mb-1 px-1">
            {(isAI || isBroker) ? 'Your Broker' : message.sender_name}
          </p>
        )}
        <div className={cn(
          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isOwnMessage
            ? 'bg-primary text-primary-foreground rounded-tr-md'
            : 'bg-card border border-border rounded-tl-md'
        )}>
          {isVoiceMemo ? (
            <audio 
              controls 
              src={message.content.replace('[voice_memo]', '')} 
              className="h-10 w-48 max-w-full"
              preload="metadata"
            />
          ) : isMediaFile ? (
            <MediaPreview content={message.content} />
          ) : (
            <p className="whitespace-pre-wrap">{message.content}</p>
          )}
        </div>
        <div className={cn(
          'flex items-center gap-1 text-[10px] text-muted-foreground mt-1 px-1',
          isOwnMessage ? 'justify-end' : ''
        )}>
          <span>{message.created_date ? format(new Date(message.created_date), 'h:mm a') : ''}</span>
          {isOwnMessage && (
            message.read
              ? <CheckCheck className="w-3 h-3 text-accent" title="Read" />
              : <Check className="w-3 h-3 text-muted-foreground/60" title="Delivered" />
          )}
        </div>
      </div>

      {isOwnMessage && isTextMessage && onEdit && onDelete && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            className="min-h-[36px] min-w-[36px] rounded-lg p-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
            onClick={() => onEdit?.(message)}
            title="Edit message"
            aria-label="Edit message"
          >
            <Edit2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            className="min-h-[36px] min-w-[36px] rounded-lg p-2 flex items-center justify-center text-destructive hover:text-destructive"
            onClick={() => onDelete?.(message.id)}
            title="Delete message"
            aria-label="Delete message"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

function MediaPreview({ content }) {
  const fileData = content.replace('[file]', '');
  const [url, type, name] = fileData.split('|');

  if (type?.startsWith('image/')) {
    return <img src={url} alt={name} className="rounded-lg max-w-xs max-h-64" />;
  }
  if (type?.startsWith('video/')) {
    return <video src={url} controls className="rounded-lg max-w-xs max-h-64" />;
  }
  return <a href={url} target="_blank" rel="noopener noreferrer" className="underline">{name}</a>;
}