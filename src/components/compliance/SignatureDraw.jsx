// Draw a signature with a finger, stylus or mouse. Hands back a see-through PNG trimmed to the ink,
// so it sits cleanly on the certificate's signature line.
import React, { useEffect, useRef, useState } from 'react';

export default function SignatureDraw({ onChange, height = 150 }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    const c = ref.current;
    const dpr = window.devicePixelRatio || 1;
    const w = c.parentElement.getBoundingClientRect().width;
    c.width = Math.round(w * dpr); c.height = Math.round(height * dpr);
    c.style.width = `${w}px`; c.style.height = `${height}px`;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2.6; ctx.strokeStyle = '#13235c';
  }, [height]);

  const at = (e) => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e) => { e.preventDefault(); ref.current.setPointerCapture?.(e.pointerId); drawing.current = true; last.current = at(e); };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext('2d');
    const [x, y] = at(e); const [lx, ly] = last.current;
    ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
    last.current = [x, y];
    if (empty) setEmpty(false);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange?.(trimmed(ref.current));
  };
  const clear = () => {
    const c = ref.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    setEmpty(true); onChange?.('');
  };

  return (
    <div>
      <div className="relative rounded-lg border-2 border-dashed border-border bg-white">
        <canvas ref={ref} className="block w-full cursor-crosshair" style={{ touchAction: 'none' }}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} />
        {empty && <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">Sign here</p>}
        <div className="pointer-events-none absolute left-6 right-6 bottom-8 border-b border-slate-300" />
      </div>
      <button type="button" onClick={clear} className="mt-1 text-xs text-muted-foreground hover:text-foreground px-1 py-1.5">Clear</button>
    </div>
  );
}

function trimmed(c) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const d = ctx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
    if (d[(y * w + x) * 4 + 3] > 10) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return '';
  const pad = 6;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
  out.getContext('2d').drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}
