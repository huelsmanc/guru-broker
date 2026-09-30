import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DocumentViewer({ documentUrl, onClose }) {
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const containerRef = useRef(null);

  const handleZoom = (delta) => {
    setZoom(prev => Math.max(50, Math.min(300, prev + delta)));
  };

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = documentUrl;
    a.download = 'document';
    a.click();
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {/* Header */}
      <div className="bg-background border-b border-border flex items-center justify-between px-4 py-3 flex-shrink-0">
        <h2 className="text-lg font-semibold text-foreground">Document Viewer</h2>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleZoom(-10)}
            className="rounded-lg"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium w-12 text-center text-foreground">{zoom}%</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleZoom(10)}
            className="rounded-lg"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            className="rounded-lg gap-1.5"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            className="rounded-lg"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Document */}
      <div className="flex-1 overflow-auto bg-gray-900 flex items-start justify-center p-4">
        {documentUrl?.toLowerCase().includes('.pdf') || documentUrl?.includes('application/pdf') || documentUrl?.includes('%2F') ? (
          <iframe
            src={documentUrl}
            title="Document"
            className="bg-white shadow-2xl"
            style={{ width: `${zoom}%`, minWidth: '600px', height: '85vh', border: 'none' }}
          />
        ) : (
          <div ref={containerRef} style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}>
            <img
              src={documentUrl}
              alt="Document"
              className="bg-white shadow-2xl"
              style={{ maxWidth: '900px', height: 'auto' }}
            />
          </div>
        )}
      </div>
    </div>
  );
}