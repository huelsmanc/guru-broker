import React from 'react';
import { ExternalLink, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LinkPreviewCard({ metadata, loading, error }) {
  if (loading) {
    return (
      <div className="mt-2 p-3 bg-muted/50 rounded-lg border border-border flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Loading preview...</span>
      </div>
    );
  }

  if (error || !metadata) {
    return null;
  }

  return (
    <a
      href={metadata.url}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 block p-3 bg-muted/50 rounded-lg border border-border hover:bg-muted/70 transition-colors group"
    >
      <div className="flex gap-3">
        {metadata.image && (
          <div className="flex-shrink-0 w-20 h-20 rounded overflow-hidden bg-muted">
            <img
              src={metadata.image}
              alt={metadata.title}
              className="w-full h-full object-cover"
              onError={(e) => {
                e.target.style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate group-hover:underline">
            {metadata.title}
          </p>
          {metadata.description && (
            <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
              {metadata.description}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            {metadata.domain}
            <ExternalLink className="w-3 h-3" />
          </p>
        </div>
      </div>
    </a>
  );
}