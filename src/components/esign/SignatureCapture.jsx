import React, { useRef, useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Type, PenTool } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SignatureCapture({ onSignatureChange, onClose }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState('draw'); // draw or type
  const [typedText, setTypedText] = useState('');
  const [isDrawing, setIsDrawing] = useState(false);

  const startDrawing = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
  };

  const draw = (e) => {
    if (!isDrawing || mode !== 'draw') return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const ctx = canvas.getContext('2d');

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const handleSubmit = () => {
    const canvas = canvasRef.current;
    const signatureData = canvas.toDataURL('image/png');

    onSignatureChange({
      signature: signatureData,
      method: mode,
      text: mode === 'type' ? typedText : '',
    });

    onClose();
  };

  const handleTypeMode = () => {
    setMode('type');
    clearCanvas();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.font = 'italic 32px cursive';
    ctx.fillText(typedText || 'Your Signature', 50, 100);
  };

  const handleDrawMode = () => {
    setMode('draw');
    setTypedText('');
    clearCanvas();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = 200;

    const ctx = canvas.getContext('2d');
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#1f2937';
  }, []);

  useEffect(() => {
    if (mode === 'type' && typedText) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'italic 32px cursive';
      ctx.fillText(typedText, 50, 100);
      canvas.toDataURL('image/png');
    }
  }, [typedText, mode]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
    >
      <div className="bg-card rounded-2xl shadow-xl max-w-2xl w-full overflow-hidden">
        <div className="p-6 border-b border-border">
          <h2 className="text-xl font-bold text-foreground">Capture Your Signature</h2>
          <p className="text-sm text-muted-foreground mt-1">Draw or type your signature below</p>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === 'draw' ? 'default' : 'outline'}
              onClick={handleDrawMode}
              className="flex-1 gap-2 rounded-lg"
            >
              <PenTool className="w-4 h-4" /> Draw
            </Button>
            <Button
              variant={mode === 'type' ? 'default' : 'outline'}
              onClick={handleTypeMode}
              className="flex-1 gap-2 rounded-lg"
            >
              <Type className="w-4 h-4" /> Type
            </Button>
          </div>

          {mode === 'type' && (
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-3 py-2 border border-input rounded-lg"
            />
          )}

          <div className="border-2 border-border rounded-lg overflow-hidden bg-white">
            <canvas
              ref={canvasRef}
              onMouseDown={mode === 'draw' ? startDrawing : undefined}
              onMouseMove={mode === 'draw' ? draw : undefined}
              onMouseUp={stopDrawing}
              onMouseLeave={stopDrawing}
              className={`w-full h-48 block ${mode === 'draw' ? 'cursor-crosshair' : ''}`}
            />
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={clearCanvas}
              className="flex-1 gap-2 rounded-lg"
            >
              <RotateCcw className="w-4 h-4" /> Clear
            </Button>
            <Button
              onClick={handleSubmit}
              className="flex-1 rounded-lg"
            >
              Confirm Signature
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}