import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { X, Pen, Highlighter, StickyNote, Trash2, Download, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function DocumentAnnotator({ documentUrl, onAnnotationsChange, onClose }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#FF0000');
  const [isDrawing, setIsDrawing] = useState(false);
  const [ctx, setCtx] = useState(null);
  const [stickyNotes, setStickyNotes] = useState([]);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [annotationData, setAnnotationData] = useState(null);

  // Initialize canvas
  useEffect(() => {
    const img = new Image();
    img.src = documentUrl;
    img.onload = () => {
      if (containerRef.current && canvasRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const scale = containerWidth / img.width;
        const newHeight = img.height * scale;

        canvasRef.current.width = containerWidth;
        canvasRef.current.height = newHeight;

        const context = canvasRef.current.getContext('2d');
        context.drawImage(img, 0, 0, containerWidth, newHeight);
        setCtx(context);
        setImageLoaded(true);
      }
    };
  }, [documentUrl]);

  const startDrawing = (e) => {
    if (!ctx || tool === 'note') return;
    setIsDrawing(true);
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e) => {
    if (!isDrawing || !ctx || tool === 'note') return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'highlight') {
      ctx.strokeStyle = color;
      ctx.lineWidth = 15;
      ctx.globalAlpha = 0.3;
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    if (ctx) {
      ctx.globalAlpha = 1;
      saveAnnotationData();
    }
  };

  const addStickyNote = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newNote = {
      id: Date.now(),
      x,
      y,
      text: 'New note',
    };

    setStickyNotes([...stickyNotes, newNote]);
    saveAnnotationData();
  };

  const updateStickyNote = (id, text) => {
    setStickyNotes(stickyNotes.map(n => n.id === id ? { ...n, text } : n));
    saveAnnotationData();
  };

  const deleteStickyNote = (id) => {
    setStickyNotes(stickyNotes.filter(n => n.id !== id));
    saveAnnotationData();
  };

  const saveAnnotationData = () => {
    if (canvasRef.current) {
      setAnnotationData({
        canvasImage: canvasRef.current.toDataURL('image/png'),
        stickyNotes,
      });
      onAnnotationsChange({
        canvasImage: canvasRef.current.toDataURL('image/png'),
        stickyNotes,
      });
    }
  };

  const clearAll = () => {
    const img = new Image();
    img.src = documentUrl;
    img.onload = () => {
      if (canvasRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const scale = containerWidth / img.width;
        const newHeight = img.height * scale;

        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctx.drawImage(img, 0, 0, containerWidth, newHeight);
        setStickyNotes([]);
        saveAnnotationData();
      }
    };
  };

  const downloadAnnotated = () => {
    const link = document.createElement('a');
    link.href = canvasRef.current.toDataURL('image/png');
    link.download = `annotated-document-${Date.now()}.png`;
    link.click();
  };

  const colors = ['#FF0000', '#FFFF00', '#00FF00', '#0000FF', '#FF00FF', '#FFA500'];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-card rounded-2xl shadow-xl max-w-4xl w-full max-h-[90dvh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-semibold text-foreground">Annotate Document</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2 mb-4 pb-4 border-b border-border">
            {/* Drawing Tools */}
            <div className="flex items-center gap-2">
              <Button
                variant={tool === 'pen' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('pen')}
                className="gap-2 rounded-lg text-xs h-9"
              >
                <Pen className="w-4 h-4" /> Draw
              </Button>
              <Button
                variant={tool === 'highlight' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('highlight')}
                className="gap-2 rounded-lg text-xs h-9"
              >
                <Highlighter className="w-4 h-4" /> Highlight
              </Button>
              <Button
                variant={tool === 'note' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTool('note')}
                className="gap-2 rounded-lg text-xs h-9"
              >
                <StickyNote className="w-4 h-4" /> Note
              </Button>
            </div>

            {/* Color Picker */}
            {tool !== 'note' && (
              <div className="flex items-center gap-2 ml-4 border-l border-border pl-4">
                {colors.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={cn(
                      'w-6 h-6 rounded border-2 transition-all',
                      color === c ? 'border-foreground scale-110' : 'border-border'
                    )}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 ml-auto border-l border-border pl-4">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadAnnotated}
                className="gap-2 rounded-lg text-xs h-9"
              >
                <Download className="w-4 h-4" /> Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearAll}
                className="gap-2 rounded-lg text-xs h-9"
              >
                <RotateCcw className="w-4 h-4" /> Clear
              </Button>
            </div>
          </div>

          {/* Canvas and Notes Container */}
          <div
            ref={containerRef}
            className="relative bg-muted rounded-lg overflow-auto max-h-[calc(90vh-300px)]"
          >
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseMove={draw}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className={cn(
                'block mx-auto',
                tool === 'note' ? 'cursor-crosshair' : 'cursor-pointer'
              )}
              onClick={(e) => tool === 'note' && addStickyNote(e)}
            />

            {/* Sticky Notes Overlay */}
            {stickyNotes.map((note) => (
              <motion.div
                key={note.id}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute bg-yellow-300 rounded-lg shadow-lg p-2 w-32 cursor-move group"
                style={{
                  left: `${(note.x / canvasRef.current?.width) * 100}%`,
                  top: `${(note.y / canvasRef.current?.height) * 100}%`,
                  transform: 'translate(-50%, -50%)',
                }}
              >
                <textarea
                  value={note.text}
                  onChange={(e) => updateStickyNote(note.id, e.target.value)}
                  className="w-full h-20 bg-transparent text-xs font-medium resize-none focus:outline-none"
                  placeholder="Add note..."
                />
                <button
                  onClick={() => deleteStickyNote(note.id)}
                  className="absolute top-1 right-1 p-1 rounded opacity-0 group-hover:opacity-100 bg-red-500/20 hover:bg-red-500/40 transition-all"
                >
                  <X className="w-3 h-3 text-red-600" />
                </button>
              </motion.div>
            ))}
          </div>

          {/* Instructions */}
          <div className="mt-4 text-xs text-muted-foreground bg-muted rounded-lg p-3">
            {tool === 'pen' && 'Click and drag to draw freehand comments.'}
            {tool === 'highlight' && 'Click and drag to highlight text or areas.'}
            {tool === 'note' && 'Click on the document to place sticky notes.'}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted">
          <Button variant="outline" onClick={onClose} className="rounded-lg">
            Cancel
          </Button>
          <Button onClick={onClose} className="rounded-lg">
            Done Annotating
          </Button>
        </div>
      </div>
    </motion.div>
  );
}