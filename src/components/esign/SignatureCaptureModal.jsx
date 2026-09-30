import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, X, PenTool } from 'lucide-react';

// Draw-or-type signature capture. Returns a transparent PNG data URL.
// Fixes the old pad, where ink landed away from the finger on phones because the
// canvas's drawing size and on-screen size didn't match.
export default function SignatureCaptureModal({ label = 'Signature', defaultName = '', onAccept, onCancel }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [hasInk, setHasInk] = useState(false);
  const [mode, setMode] = useState('draw');
  const [typed, setTyped] = useState(label === 'Initials' ? initialsOf(defaultName) : defaultName);

  useEffect(() => {
    if (mode !== 'draw') return;
    const canvas = canvasRef.current;
    const setup = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.strokeStyle = '#1e3a8a';
      ctx.lineWidth = 2.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      setHasInk(false);
    };
    setup();
  }, [mode]);

  const point = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const down = (e) => {
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.arc(last.current.x, last.current.y, 1.1, 0, Math.PI * 2);
    ctx.fillStyle = '#1e3a8a';
    ctx.fill();
    setHasInk(true);
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const p = point(e);
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; };

  const clear = () => {
    const c = canvasRef.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setHasInk(false);
  };

  const accept = () => {
    if (mode === 'type') {
      const text = typed.trim();
      if (!text) return;
      const c = document.createElement('canvas');
      c.width = 900; c.height = 240;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1e3a8a';
      let size = 120;
      ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive`;
      while (ctx.measureText(text).width > 860 && size > 30) {
        size -= 6;
        ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", "Snell Roundhand", cursive`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, 450, 125);
      onAccept(c.toDataURL('image/png'), { method: 'typed', text });
    } else {
      onAccept(trimCanvas(canvasRef.current), { method: 'drawn' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenTool className="w-5 h-5 text-blue-600" />
            <h3 className="font-semibold text-gray-900">Add your {label.toLowerCase()}</h3>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            {['draw', 'type'].map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium ${mode === m ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {m === 'draw' ? 'Draw' : 'Type'}
              </button>
            ))}
          </div>
          {mode === 'draw' ? (
            <div>
              <canvas
                ref={canvasRef}
                className="w-full h-40 border-2 border-dashed border-gray-300 rounded-lg bg-white cursor-crosshair"
                style={{ touchAction: 'none' }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={up}
                onPointerLeave={up}
              />
              <div className="flex justify-between mt-1">
                <p className="text-xs text-gray-400">Draw with your mouse or finger</p>
                {hasInk && <button onClick={clear} className="text-xs text-red-500 hover:underline">Clear</button>}
              </div>
            </div>
          ) : (
            <div>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={label === 'Initials' ? 'Your initials' : 'Your full name'}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-3xl italic text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive' }}
              />
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={onCancel} className="flex-1">Cancel</Button>
            <Button onClick={accept} disabled={mode === 'draw' ? !hasInk : !typed.trim()} className="flex-1 bg-blue-600 hover:bg-blue-700 gap-2">
              <Check className="w-4 h-4" /> Adopt & place
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function initialsOf(name = '') {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('');
}

// Crop to the ink so the signature fills its box instead of floating small in a corner.
function trimCanvas(src) {
  const ctx = src.getContext('2d');
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return src.toDataURL('image/png');
  const pad = 8;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d').drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
