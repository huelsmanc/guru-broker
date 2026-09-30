import React, { useState } from 'react';
import { Download, Trash2, Star, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import FilePreview from '@/components/viewer/FilePreview';

const CATEGORY_EMOJI = {
  training: '📚',
  template: '📋',
  policy: '📜',
  guide: '📖',
  contract: '📄',
  other: '📦',
};

const CATEGORY_COLORS = {
  training: 'bg-blue-100 text-blue-700',
  template: 'bg-purple-100 text-purple-700',
  policy: 'bg-red-100 text-red-700',
  guide: 'bg-green-100 text-green-700',
  contract: 'bg-yellow-100 text-yellow-700',
  other: 'bg-gray-100 text-gray-700',
};

export default function FileCard({ file, isAdmin, onDownload, onDelete, onToggleFeatured, index }) {
  const [showPreview, setShowPreview] = useState(false);

  const getFileType = (fileName) => {
    const ext = fileName.split('.').pop()?.toUpperCase() || 'FILE';
    return ext.length > 4 ? 'FILE' : ext;
  };

  const getFileTypeFromName = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes = {
      'pdf': 'application/pdf',
      'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png', 'gif': 'image/gif', 'webp': 'image/webp',
      'mp4': 'video/mp4', 'webm': 'video/webm', 'mov': 'video/mp4',
    };
    return mimeTypes[ext] || '';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const isPreviewable = file.file_url && (getFileTypeFromName(file.file_name).startsWith('image/') || getFileTypeFromName(file.file_name) === 'application/pdf');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/30 transition-colors h-full flex flex-col group"
    >
      {/* Image Thumbnail */}
      {getFileTypeFromName(file.file_name).startsWith('image/') && (
        <div className="h-32 bg-muted overflow-hidden relative group/thumb">
          <img
            src={file.file_url}
            alt={file.file_name}
            className="w-full h-full object-cover group-hover/thumb:scale-105 transition-transform duration-300 cursor-pointer"
            onClick={() => setShowPreview(true)}
          />
          <button
            onClick={() => setShowPreview(true)}
            className="absolute inset-0 bg-black/0 group-hover/thumb:bg-black/40 flex items-center justify-center transition-colors"
          >
            <Eye className="w-6 h-6 text-white opacity-0 group-hover/thumb:opacity-100 transition-opacity" />
          </button>
        </div>
      )}

      <div className="flex items-start justify-between p-4 bg-muted/50 border-b border-border">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center font-bold text-sm text-primary">
            {getFileType(file.file_name)}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm text-foreground truncate" title={file.file_name}>
              {file.file_name}
            </h3>
            <p className="text-xs text-muted-foreground">{formatFileSize(file.file_size || 0)}</p>
          </div>
        </div>
        {file.is_featured && (
          <Star className="w-4 h-4 text-yellow-500 fill-current flex-shrink-0" />
        )}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <Badge className={`text-xs ${CATEGORY_COLORS[file.category]}`}>
            {CATEGORY_EMOJI[file.category]} {file.category}
          </Badge>
        </div>

        {file.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{file.description}</p>
        )}

        {file.tags && file.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {file.tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {file.tags.length > 3 && (
              <Badge variant="secondary" className="text-xs">+{file.tags.length - 3}</Badge>
            )}
          </div>
        )}

        <div className="text-xs text-muted-foreground mt-auto pt-3 border-t border-border mb-3">
          <p>Uploaded {format(new Date(file.created_date), 'MMM d, yyyy')}</p>
          <p>{file.downloads_count || 0} download{file.downloads_count !== 1 ? 's' : ''}</p>
        </div>

        <div className="flex gap-2">
          {isPreviewable && (
            <Button
              onClick={() => setShowPreview(true)}
              variant="outline"
              className="flex-1 rounded-lg h-9 text-sm gap-1"
            >
              <Eye className="w-4 h-4" /> Preview
            </Button>
          )}
          <Button
            onClick={onDownload}
            className={isPreviewable ? 'rounded-lg h-9 text-sm gap-1' : 'flex-1 rounded-lg h-9 text-sm gap-1'}
          >
            <Download className="w-4 h-4" /> Download
          </Button>
          {isAdmin && (
            <>
              <Button
                onClick={onToggleFeatured}
                variant={file.is_featured ? 'default' : 'outline'}
                size="icon"
                className="rounded-lg h-9 w-9"
                title={file.is_featured ? 'Unfeature' : 'Feature'}
              >
                <Star className={`w-4 h-4 ${file.is_featured ? 'fill-current' : ''}`} />
              </Button>
              <Button
                onClick={onDelete}
                variant="ghost"
                size="icon"
                className="rounded-lg h-9 w-9 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Preview Lightbox */}
      {isPreviewable && (
        <FilePreview
          open={showPreview}
          onOpenChange={setShowPreview}
          fileUrl={file.file_url}
          fileName={file.file_name}
          fileType={getFileTypeFromName(file.file_name)}
        />
      )}
    </motion.div>
  );
}