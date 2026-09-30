import React, { useState, useRef, useEffect } from 'react';
import { ZoomIn, ZoomOut, Loader2, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function DocumentScrollViewer({ documentUrl }) {
  const [zoom, setZoom] = useState(100);
  const [loading, setLoading] = useState(true);
  const [pageCount, setPageCount] = useState(1);
  const [scrollProgress, setScrollProgress] = useState(0);
  const containerRef = useRef(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setLoading(false);
      // Estimate page count based on aspect ratio (assume letter size)
      const estimatedPages = Math.ceil(img.height / img.width * 0.65);
      setPageCount(Math.max(1, estimatedPages));
    };
    img.onerror = () => setLoading(false);
    img.src = documentUrl;
  }, [documentUrl]);

  const handleZoom = (delta) => {
    setZoom(prev => Math.max(60, Math.min(200, prev + delta)));
  };

  const handleScroll = () => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const progress = scrollHeight > clientHeight ? (scrollTop / (scrollHeight - clientHeight)) * 100 : 0;
      setScrollProgress(progress);
    }
  };

  if (loading) {
    return (
      <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" />
          <p className="text-xs text-gray-500">Loading document...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-1">
          <FileText className="w-4 h-4 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">Document</span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleZoom(-10)}
            className="h-8 w-8 p-0 hover:bg-gray-200 rounded-lg"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>

          <span className="text-xs font-medium w-12 text-center text-gray-600">{zoom}%</span>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleZoom(10)}
            className="h-8 w-8 p-0 hover:bg-gray-200 rounded-lg"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${scrollProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Document scroller */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto bg-gray-100 flex justify-center py-6"
        style={{ scrollBehavior: 'smooth' }}
      >
        <div className="space-y-4">
          <img
            src={documentUrl}
            alt="Document"
            className="rounded-lg shadow-lg bg-white"
            style={{
              width: `${zoom}%`,
              height: 'auto',
            }}
          />
        </div>
      </div>
    </div>
  );
}