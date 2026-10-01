import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { motion } from 'framer-motion';

export default function Lightbox({ open, onOpenChange, fileUrl, fileName, fileType }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scale, setScale] = useState(1);

  const isImage = fileType?.startsWith('image/');
  const isPdf = fileType === 'application/pdf';

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName || 'file';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden p-0 bg-black/95 border-black">
        <div className="relative w-full h-[80dvh] flex items-center justify-center">
          {/* Close button */}
          <button
            onClick={() => onOpenChange(false)}
            className="absolute top-4 right-4 z-50 p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Main content */}
          <div className="flex items-center justify-center w-full h-full">
            {isImage && (
              <motion.img
                src={fileUrl}
                alt={fileName}
                className="max-w-full max-h-full object-contain cursor-zoom-in"
                style={{ scale }}
                onClick={() => setScale(scale === 1 ? 1.5 : 1)}
              />
            )}

            {isPdf && (
              <div className="w-full h-full flex flex-col items-center justify-center text-white/60">
                <div className="text-6xl mb-4">📄</div>
                <p className="mb-6 text-center max-w-xs">{fileName}</p>
                <Button
                  onClick={handleDownload}
                  className="gap-2 bg-white/10 hover:bg-white/20 text-white"
                >
                  <Download className="w-4 h-4" />
                  Download PDF to view
                </Button>
              </div>
            )}

            {!isImage && !isPdf && (
              <div className="text-center text-white/60">
                <p className="text-lg mb-4">Preview not available</p>
                <p className="text-sm mb-6">{fileName}</p>
                <Button onClick={handleDownload} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download
                </Button>
              </div>
            )}
          </div>

          {/* Zoom controls for images */}
          {isImage && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 bg-white/10 backdrop-blur-sm rounded-lg p-2 z-40">
              <button
                onClick={() => setScale(Math.max(0.5, scale - 0.25))}
                className="p-2 rounded hover:bg-white/20 text-white transition-colors"
                title="Zoom out"
              >
                −
              </button>
              <span className="px-3 py-2 text-sm text-white/70 min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale(Math.min(3, scale + 0.25))}
                className="p-2 rounded hover:bg-white/20 text-white transition-colors"
                title="Zoom in"
              >
                +
              </button>
              <div className="w-px bg-white/20 mx-1" />
              <button
                onClick={handleDownload}
                className="p-2 rounded hover:bg-white/20 text-white transition-colors"
                title="Download"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}