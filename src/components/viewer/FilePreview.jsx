import React, { useState } from 'react';
import { FileText, Music, Video, Archive, File } from 'lucide-react';
import Lightbox from './Lightbox';
import { cn } from '@/lib/utils';

const getFileIcon = (fileType) => {
  if (fileType?.startsWith('image/')) return null; // Use thumbnail instead
  if (fileType === 'application/pdf') return <FileText className="w-8 h-8" />;
  if (fileType?.startsWith('audio/')) return <Music className="w-8 h-8" />;
  if (fileType?.startsWith('video/')) return <Video className="w-8 h-8" />;
  if (fileType?.includes('zip') || fileType?.includes('compressed')) return <Archive className="w-8 h-8" />;
  return <File className="w-8 h-8" />;
};

const getFileTypeLabel = (fileType) => {
  if (fileType?.startsWith('image/')) return fileType.split('/')[1].toUpperCase();
  if (fileType === 'application/pdf') return 'PDF';
  if (fileType?.startsWith('audio/')) return 'Audio';
  if (fileType?.startsWith('video/')) return 'Video';
  return 'File';
};

export default function FilePreview({ fileUrl, fileName, fileType, maxWidth = '400px', showCaption = true, className = '', open, onOpenChange }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const isControlled = open !== undefined;
  const lightboxIsOpen = isControlled ? open : lightboxOpen;
  const setLightboxIsOpen = isControlled ? onOpenChange : setLightboxOpen;
  const isImage = fileType?.startsWith('image/');
  const isPdf = fileType === 'application/pdf';
  const isVideo = fileType?.startsWith('video/');

  return (
    <>
      {!isControlled && (
        <div className={cn('mt-2 cursor-pointer', className)} style={{ maxWidth }}>
          {isImage && (
            <div
              onClick={() => setLightboxIsOpen(true)}
              className="relative rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-200 group"
            >
              <img
                src={fileUrl}
                alt={fileName}
                className="w-full h-auto max-h-96 object-cover group-hover:opacity-95 transition-opacity"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
            </div>
          )}

          {isVideo && (
            <div
              onClick={() => setLightboxIsOpen(true)}
              className="relative rounded-lg overflow-hidden hover:shadow-lg transition-shadow duration-200 group bg-muted"
            >
              <video
                src={fileUrl}
                className="w-full h-auto max-h-96 object-cover group-hover:opacity-95 transition-opacity"
                controls
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />
            </div>
          )}

          {isPdf && (
            <div
              onClick={() => setLightboxIsOpen(true)}
              className="relative rounded-lg border border-border/50 hover:border-border/80 bg-muted/40 p-4 hover:shadow-lg transition-all duration-200 group cursor-pointer flex items-center gap-3"
            >
            <div className="p-3 rounded-lg bg-red-500/10 text-red-500 group-hover:bg-red-500/20 transition-colors">
              {getFileIcon(fileType)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">{getFileTypeLabel(fileType)} • Click to preview</p>
            </div>
          </div>
          )}

          {!isImage && !isVideo && !isPdf && (
          <div className="rounded-lg border border-border/50 bg-muted/40 p-4 flex items-center gap-3">
            <div className="p-3 rounded-lg bg-muted text-muted-foreground">
              {getFileIcon(fileType)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">{getFileTypeLabel(fileType)}</p>
            </div>
          </div>
          )}

          {showCaption && fileName && (
          <p className="text-xs text-muted-foreground mt-2 truncate">{fileName}</p>
          )}
          </div>
          )}

          <Lightbox
          open={lightboxIsOpen}
          onOpenChange={setLightboxIsOpen}
        fileUrl={fileUrl}
        fileName={fileName}
        fileType={fileType}
      />
    </>
  );
}