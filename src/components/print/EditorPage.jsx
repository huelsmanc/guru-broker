// Draws one side of an editor document at trim size (96 px per inch). Used for the editor's
// canvas, thumbnails, proofs and the print file itself, so what the agent sees is what prints.
import React from 'react';
import { PRODUCTS } from '../../../shared/print.js';
import { PX, pageSize } from '@/lib/editorDoc';

export const SAFE = 0.125 * PX; // keep words this far inside the cut

export function EHOMark({ size = 9, color = '#111827' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.4, fontSize: size, color, fontFamily: "'Montserrat', Arial, sans-serif", lineHeight: 1.1, maxWidth: '100%' }}>
      <svg width={size * 1.4} height={size * 1.4} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" style={{ flexShrink: 0 }}><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M9 13h6M9 16h6" /></svg>
      <span>Equal Housing Opportunity</span>
    </span>
  );
}

export function elementStyle(e) {
  return { position: 'absolute', left: e.x, top: e.y, width: e.w, height: e.h, opacity: e.opacity ?? 1, boxSizing: 'border-box' };
}

export function TextBody({ e, children }) {
  return (
    <div style={{
      width: '100%', height: '100%', fontFamily: `'${e.font || 'Montserrat'}', Arial, sans-serif`, fontSize: e.size, fontWeight: e.weight,
      fontStyle: e.italic ? 'italic' : 'normal', color: e.color, textAlign: e.align, lineHeight: e.lineHeight, letterSpacing: e.letterSpacing || 0,
      textTransform: e.uppercase ? 'uppercase' : 'none', whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
    }}>{children ?? e.text}</div>
  );
}

export function Element({ e, placeholders }) {
  const st = elementStyle(e);
  if (e.type === 'text') return <div style={st}><TextBody e={e} /></div>;
  if (e.type === 'shape') {
    const radius = e.shape === 'ellipse' ? '50%' : e.radius || 0;
    return <div style={{ ...st, background: e.fill || 'transparent', borderRadius: radius, border: e.stroke && e.strokeWidth ? `${e.strokeWidth}px solid ${e.stroke}` : 'none' }} />;
  }
  if (e.type === 'eho') return <div style={{ ...st, display: 'flex', alignItems: 'center', justifyContent: { left: 'flex-start', right: 'flex-end' }[e.align] || 'center' }}><EHOMark size={e.size} color={e.color} /></div>;
  if (e.type === 'image') {
    if (!e.src) {
      if (!placeholders) return null;
      return <div style={{ ...st, borderRadius: e.radius || 0, background: 'repeating-linear-gradient(45deg,#e5e7eb,#e5e7eb 6px,#f3f4f6 6px,#f3f4f6 12px)', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.max(8, Math.min(14, e.h / 6)), fontFamily: 'Inter, Arial, sans-serif', textAlign: 'center', overflow: 'hidden' }}>{e.placeholder || 'Photo'}</div>;
    }
    return (
      <div style={{ ...st, borderRadius: e.radius || 0, overflow: 'hidden' }}>
        <img src={e.src} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: e.fit || 'cover', display: 'block' }} />
      </div>
    );
  }
  return null;
}

/** The mail house prints the address and postage here, so it is always kept white. */
export function AddressBox({ product, showGuides }) {
  const ink = PRODUCTS[product]?.inkFree;
  if (!ink) return null;
  return (
    <div style={{ position: 'absolute', right: ink.right * PX, bottom: ink.bottom * PX, width: ink.w * PX, height: ink.h * PX, background: '#fff', outline: showGuides ? '1px dashed #f59e0b' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      {showGuides && <span style={{ fontSize: 9, color: '#b45309', fontFamily: 'Inter, Arial, sans-serif', textAlign: 'center' }}>Address and postage<br />(printed by the mail house)</span>}
    </div>
  );
}

/**
 * One side, at full trim size. `showGuides` adds the safe line and the address-box label;
 * `placeholders` shows empty photo frames; `hide` skips an element (the one being typed into).
 */
export default function EditorPage({ product, side, page, showGuides = false, placeholders = false, hide, children }) {
  const { W, H } = pageSize(product);
  const mailedBack = side === 'back' && PRODUCTS[product]?.mailed;
  return (
    <div style={{ width: W, height: H, position: 'relative', overflow: 'hidden', background: page?.bg || '#fff' }}>
      {(page?.elements || []).map((e) => (e.id === hide ? null : <Element key={e.id} e={e} placeholders={placeholders} />))}
      {mailedBack && <AddressBox product={product} showGuides={showGuides} />}
      {showGuides && <div style={{ position: 'absolute', left: SAFE, top: SAFE, right: SAFE, bottom: SAFE, outline: '1px dashed rgba(59,130,246,0.55)', pointerEvents: 'none' }} />}
      {children}
    </div>
  );
}

/** A small scaled preview. */
export function EditorThumb({ product, side = 'front', page, height = 120, className, placeholders = true }) {
  const { W, H } = pageSize(product);
  const k = height / H;
  return (
    <div className={className} style={{ width: W * k, height, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: W, height: H }}>
        <EditorPage product={product} side={side} page={page} placeholders={placeholders} />
      </div>
    </div>
  );
}
