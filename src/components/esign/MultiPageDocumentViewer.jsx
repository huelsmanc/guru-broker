import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function MultiPageDocumentViewer({ documentUrl, showAllPages = false }) {
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [imageHeight, setImageHeight] = useState(0);
  const [imageWidth, setImageWidth] = useState(0);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageWidth(img.width);
      setImageHeight(img.height);
      setLoading(false);
    };
    img.onerror = () => setLoading(false);
    img.src = documentUrl;
  }, [documentUrl]);

  const handleZoom = (delta) => {
    setZoom(prev => Math.max(50, Math.min(300, prev + delta)));
  };

  if (loading) {
    return (
      <div className="w-full h-96 bg-muted rounded-lg flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1" />

        <Button
          size="sm"
          variant="outline"
          onClick={() => handleZoom(-10)}
          className="rounded-lg"
        >
          <ZoomOut className="w-4 h-4" />
        </Button>

        <span className="text-xs font-medium w-10 text-center">{zoom}%</span>

        <Button
          size="sm"
          variant="outline"
          onClick={() => handleZoom(10)}
          className="rounded-lg"
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
      </div>

      {/* Document - scrollable for multi-page */}
      <div className="border-2 border-border rounded-lg overflow-auto bg-white flex flex-col items-center gap-4 p-4" style={{ minHeight: '600px', maxHeight: '700px' }}>
        <img
          src={documentUrl}
          alt="Document"
          className="rounded-lg shadow-sm"
          style={{ 
            maxWidth: '100%',
            width: `${zoom}%`,
            height: 'auto'
          }}
        />
      </div>
    </div>
  );
}