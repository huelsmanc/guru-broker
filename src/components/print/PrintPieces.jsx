// Print layouts drawn at trim size (96 px per inch): postcard backs and business cards.
import React from 'react';
import { PRODUCTS } from '../../../shared/print.js';

const PX = 96;
const font = "'Montserrat', 'Inter', Arial, sans-serif";

function EHO({ size = 10, color = '#111827' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: size * 0.75, color, opacity: 0.8, whiteSpace: 'nowrap' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M9 13h6M9 16h6" /></svg>
      Equal Housing Opportunity
    </span>
  );
}

/**
 * Postcard back: message and agent on the left; the address/postage box on the right is left
 * blank (the mail house prints the address there).
 */
export function PostcardBack({ product = 'postcard_4x6', message, headline, agent = {}, brand = {}, color = '#0f172a', showGuides = false }) {
  const p = PRODUCTS[product];
  const [tw, th] = p.trim;
  const W = tw * PX; const H = th * PX;
  const ink = p.inkFree;
  const box = { w: ink.w * PX, h: ink.h * PX, right: ink.right * PX, bottom: ink.bottom * PX };
  const safe = 0.22 * PX;
  const leftW = W - box.w - box.right - safe - 0.18 * PX;
  const big = product === 'postcard_6x9' ? 1.3 : 1;
  return (
    <div style={{ width: W, height: H, background: '#fff', position: 'relative', overflow: 'hidden', fontFamily: font, color: '#111827' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 0.09 * PX, background: color }} />
      <div style={{ position: 'absolute', left: safe, top: safe, width: leftW, bottom: safe, display: 'flex', flexDirection: 'column', gap: 6 * big }}>
        {headline && <div style={{ fontSize: 15 * big, fontWeight: 800, color, lineHeight: 1.1 }}>{headline}</div>}
        {message && <div style={{ fontSize: 9.5 * big, lineHeight: 1.35, whiteSpace: 'pre-wrap', overflow: 'hidden', flex: 1 }}>{message}</div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 * big, marginTop: 'auto' }}>
          {agent.headshot && <img src={agent.headshot} alt="" crossOrigin="anonymous" style={{ width: 40 * big, height: 40 * big, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
          <div style={{ minWidth: 0, lineHeight: 1.25 }}>
            <div style={{ fontSize: 10.5 * big, fontWeight: 700 }}>{agent.name}</div>
            {agent.title && <div style={{ fontSize: 7.5 * big, opacity: 0.75 }}>{agent.title}</div>}
            <div style={{ fontSize: 8 * big }}>{agent.phone}</div>
            <div style={{ fontSize: 7.5 * big, wordBreak: 'break-all' }}>{agent.email}</div>
            {agent.license && <div style={{ fontSize: 6.5 * big, opacity: 0.6 }}>Lic. {agent.license}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderTop: '1px solid #e5e7eb', paddingTop: 4 }}>
          {brand.logo ? <img src={brand.logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 20 * big, maxWidth: leftW * 0.5, objectFit: 'contain' }} /> : <span style={{ fontSize: 8 * big, fontWeight: 700 }}>{brand.brokerage}</span>}
          <EHO size={9 * big} />
        </div>
      </div>
      {/* Above the address box: room for the brokerage name. */}
      <div style={{ position: 'absolute', right: box.right, top: safe, width: box.w, height: H - box.h - box.bottom - safe - 6, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', fontSize: 7.5 * big, color: '#6b7280', textAlign: 'right' }}>
        {brand.brokerage && brand.logo ? brand.brokerage : ''}
      </div>
      <div style={{ position: 'absolute', right: box.right, bottom: box.bottom, width: box.w, height: box.h, background: '#fff', outline: showGuides ? '1px dashed #f59e0b' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {showGuides && <span style={{ fontSize: 9, color: '#b45309', fontFamily: font, textAlign: 'center' }}>Address and postage<br />(printed by the mail house)</span>}
      </div>
    </div>
  );
}

export const CARD_STYLES = { classic: 'Classic', bold: 'Bold color', photo: 'With photo' };

/** Business card, front and back (3.5×2 in). */
export function BusinessCard({ side = 'front', style = 'classic', agent = {}, brand = {}, color = '#0f172a' }) {
  const W = 3.5 * PX; const H = 2 * PX;
  const pad = 0.2 * PX;
  const base = { width: W, height: H, position: 'relative', overflow: 'hidden', fontFamily: font, boxSizing: 'border-box' };
  if (side === 'back') {
    return (
      <div style={{ ...base, background: style === 'bold' ? '#fff' : color, color: style === 'bold' ? '#111827' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, padding: pad }}>
        {brand.logo ? <img src={brand.logo} alt="" crossOrigin="anonymous" style={{ maxHeight: H * 0.42, maxWidth: W * 0.6, objectFit: 'contain', ...(style === 'bold' ? {} : { background: '#fff', padding: 6, borderRadius: 6 }) }} />
          : <div style={{ fontSize: 16, fontWeight: 800 }}>{brand.brokerage}</div>}
        {brand.logo && brand.brokerage && <div style={{ fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', opacity: 0.85 }}>{brand.brokerage}</div>}
        <div style={{ position: 'absolute', bottom: pad * 0.7 }}><EHO size={8} color={style === 'bold' ? '#111827' : '#fff'} /></div>
      </div>
    );
  }
  const lines = (
    <div style={{ lineHeight: 1.3, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: style === 'bold' ? '#fff' : color }}>{agent.name}</div>
      {agent.title && <div style={{ fontSize: 7.5, textTransform: 'uppercase', letterSpacing: 1, opacity: 0.8, marginBottom: 5 }}>{agent.title}</div>}
      {agent.phone && <div style={{ fontSize: 8.5 }}>{agent.phone}</div>}
      {agent.email && <div style={{ fontSize: 8, wordBreak: 'break-all' }}>{agent.email}</div>}
      {agent.website && <div style={{ fontSize: 8 }}>{agent.website}</div>}
      {agent.license && <div style={{ fontSize: 6.5, opacity: 0.65, marginTop: 3 }}>Lic. {agent.license}</div>}
    </div>
  );
  if (style === 'photo') {
    return (
      <div style={{ ...base, background: '#fff', color: '#111827', display: 'flex' }}>
        <div style={{ width: W * 0.38, height: '100%', background: color, flexShrink: 0 }}>
          {agent.headshot && <img src={agent.headshot} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
        </div>
        <div style={{ flex: 1, padding: `${pad}px ${pad}px ${pad}px ${pad * 0.9}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: 0 }}>
          {lines}
          {brand.logo && <img src={brand.logo} alt="" crossOrigin="anonymous" style={{ maxHeight: 18, maxWidth: 80, objectFit: 'contain', marginTop: 6, alignSelf: 'flex-start' }} />}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...base, background: style === 'bold' ? color : '#fff', color: style === 'bold' ? '#fff' : '#111827', padding: pad, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        {lines}
        {agent.headshot && style === 'classic' && <img src={agent.headshot} alt="" crossOrigin="anonymous" style={{ width: 52, height: 52, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />}
      </div>
      <div style={{ height: 3, background: style === 'bold' ? '#ffffff55' : color, width: 40 }} />
    </div>
  );
}

/**
 * The agent's own artwork, filling the piece edge to edge. On a postcard back the address and
 * postage box is painted white so the mail house can print there.
 */
export function UploadedArt({ product, src, keepAddressClear, showGuides }) {
  const p = PRODUCTS[product];
  const [tw, th] = p.trim;
  const W = tw * PX; const H = th * PX;
  const ink = p.inkFree;
  return (
    <div style={{ width: W, height: H, position: 'relative', overflow: 'hidden', background: '#fff' }}>
      <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {keepAddressClear && ink && (
        <div style={{ position: 'absolute', right: ink.right * PX, bottom: ink.bottom * PX, width: ink.w * PX, height: ink.h * PX, background: '#fff', outline: showGuides ? '1px dashed #f59e0b' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {showGuides && <span style={{ fontSize: 9, color: '#b45309', fontFamily: font, textAlign: 'center' }}>Address and postage<br />(printed by the mail house)</span>}
        </div>
      )}
    </div>
  );
}
