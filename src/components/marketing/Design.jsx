// Marketing design templates. Pure layout: the AI picks the words, colors and template;
// everything factual (price, address, beds, agent, logo, brokerage, license, Equal
// Housing notice) is placed here exactly as given.
import React, { useLayoutEffect, useRef, useState } from 'react';

// Shrinks its contents to fit when the copy runs long, so nothing is ever cut off.
function Fit({ style, children }) {
  const { padding, gap, alignItems, textAlign, ...outer } = style;
  const box = useRef(null); const inner = useRef(null);
  const [k, setK] = useState(1);
  const kRef = useRef(1); kRef.current = k;
  useLayoutEffect(() => {
    // Find the scale by measuring right here (a few tries, settling on one that fits), then
    // update only when it really changes. Shrinking makes lines wrap differently, so going
    // back and forth through React re-renders could flip forever (React error #185).
    const fit = () => {
      const b = box.current, el = inner.current;
      if (!b || !el) return;
      const cs = getComputedStyle(b);
      const avail = b.clientHeight - (parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
      if (!(avail > 0)) return;
      const apply = (x) => { el.style.width = `${100 / x}%`; };
      let x = 1; let best = 1;
      for (let i = 0; i < 8; i += 1) {
        apply(x);
        const need = el.scrollHeight; // laid out at this width; shown at x times its height
        if (need * x <= avail + 1) { best = x; break; }
        x = Math.max(0.55, Math.min(x - 0.02, avail / need));
        best = x;
        if (x === 0.55) break;
      }
      apply(kRef.current);
      if (Math.abs(best - kRef.current) > 0.01) setK(best);
    };
    fit();
    let alive = true;
    document.fonts?.ready?.then(() => { if (alive) fit(); });
    const imgs = [...(box.current?.querySelectorAll('img') || [])];
    imgs.forEach((i) => { if (!i.complete) i.addEventListener('load', fit, { once: true }); });
    return () => { alive = false; imgs.forEach((i) => i.removeEventListener('load', fit)); };
  });
  return (
    <div ref={box} style={{ ...outer, padding, minHeight: 0, overflow: 'hidden' }}>
      <div ref={inner} style={{ display: 'flex', flexDirection: 'column', gap, alignItems, textAlign, transform: `scale(${k})`, transformOrigin: alignItems === 'center' ? 'top center' : 'top left', width: `${100 / k}%`, marginLeft: alignItems === 'center' ? `${(1 - 1 / k) * 50}%` : 0 }}>{children}</div>
    </div>
  );
}

export const FORMATS = {
  flyer: { label: 'Print flyer (8.5×11)', w: 816, h: 1056, print: true },
  post: { label: 'Instagram / Facebook post', w: 1080, h: 1080 },
  story: { label: 'Instagram / Facebook story', w: 1080, h: 1920 },
  wide: { label: 'Facebook / LinkedIn link image', w: 1200, h: 630 },
  // Postcard fronts at trim size (96 px per inch); the print file adds the bleed.
  postcard_4x6: { label: 'Postcard front (6×4)', w: 576, h: 384, print: true },
  postcard_6x9: { label: 'Postcard front (9×6)', w: 864, h: 576, print: true },
};
export const TEMPLATES = { hero: 'Hero photo', grid: 'Photo grid', luxury: 'Luxury', bold: 'Bold', minimal: 'Minimal' };
export const KINDS = {
  just_listed: 'Just listed', open_house: 'Open house', coming_soon: 'Coming soon', price_reduced: 'Price improved',
  under_contract: 'Under contract', just_sold: 'Just sold', agent_intro: 'Agent intro', recruiting: 'Join our team', custom: 'Something else',
};

// Prices may be typed as "450,000", "$450,000" or "450k".
const money = (n) => {
  const m = String(n ?? '').trim().toLowerCase().replace(/[$,\s]/g, '').match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return '';
  const v = Number(m[1]) * (m[2] === 'm' ? 1e6 : m[2] === 'k' ? 1e3 : 1);
  return v > 0 ? `$${Math.round(v).toLocaleString('en-US')}` : '';
};
const shade = (hex, amt) => {
  const h = String(hex || '#1f2937').replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const c = (s) => Math.max(0, Math.min(255, ((n >> s) & 255) + amt));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, '0')}`;
};

function EHO({ size, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3, fontSize: size * 0.55, color, opacity: 0.85, whiteSpace: 'nowrap' }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M3 11 12 4l9 7" /><path d="M5 10v10h14V10" /><path d="M9 13h6M9 16h6" /></svg>
      Equal Housing Opportunity
    </span>
  );
}

function Photo({ src, style, fallback }) {
  if (!src) return <div style={{ ...style, background: fallback }} />;
  return <img src={src} alt="" crossOrigin="anonymous" style={{ ...style, objectFit: 'cover', display: 'block' }} />;
}

function Facts({ listing, u, color, sep }) {
  const items = [
    listing.beds != null && listing.beds !== '' && `${listing.beds} Beds`,
    listing.baths_total != null && listing.baths_total !== '' && `${Number(listing.baths_total)} Baths`,
    listing.living_area && `${Number(listing.living_area).toLocaleString('en-US')} Sq Ft`,
    listing.lot_size_acres && `${listing.lot_size_acres} Acres`,
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${u * 1}px ${u * 2.2}px`, fontSize: u * 2.6, fontWeight: 600, color, letterSpacing: u * 0.05 }}>
      {items.map((t, i) => <span key={t}>{i > 0 && <span style={{ color: sep, marginRight: u * 2.2 }}>|</span>}{t}</span>)}
    </div>
  );
}

function AgentBar({ agent, brand, u, fg, bg, compact }) {
  const s = compact ? 0.8 : 1;
  return (
    <div style={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: u * 2.2 * s, background: bg, color: fg, padding: `${u * 2.2 * s}px ${u * 3.5}px` }}>
      {agent.headshot && <img src={agent.headshot} alt="" crossOrigin="anonymous" style={{ width: u * 11 * s, height: u * 11 * s, borderRadius: '50%', objectFit: 'cover', border: `${u * 0.4}px solid ${fg}33` }} />}
      <div style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}>
        <div style={{ fontSize: u * 3.3 * s, fontWeight: 700 }}>{agent.name}</div>
        {agent.title && <div style={{ fontSize: u * 2 * s, opacity: 0.8 }}>{agent.title}</div>}
        <div style={{ fontSize: u * 2.2 * s, opacity: 0.9, marginTop: u * 0.4 }}>{[agent.phone, agent.email].filter(Boolean).join('  ·  ')}</div>
        {agent.license && <div style={{ fontSize: u * 1.6 * s, opacity: 0.7 }}>Lic. {agent.license}</div>}
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: u * 0.8 }}>
        {brand.logo ? <img src={brand.logo} alt="" crossOrigin="anonymous" style={{ maxHeight: u * 7 * s, maxWidth: u * 22, objectFit: 'contain' }} />
          : <div style={{ fontSize: u * 2.6 * s, fontWeight: 700 }}>{brand.brokerage}</div>}
        {brand.logo && <div style={{ fontSize: u * 1.6 * s, opacity: 0.85 }}>{brand.brokerage}</div>}
        <EHO size={u * 2.6 * s} color={fg} />
      </div>
    </div>
  );
}

function addressLines(listing) {
  const l1 = [listing.street_address, listing.unit && `#${listing.unit}`].filter(Boolean).join(' ');
  const l2 = [listing.city, [listing.state, listing.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [l1, l2];
}

export default function Design({ format = 'flyer', content, listing = {}, photos = [], agent = {}, brand = {}, bgImage, scale = 1 }) {
  const F = FORMATS[format] || FORMATS.flyer;
  const { w, h } = F;
  const u = Math.min(w, h * 0.85) / 100;
  const shape = h / w > 1.3 ? 'tall' : w / h >= 1.45 ? 'wide' : 'square';
  const c = content || {};
  const p = c.palette || {};
  const primary = p.primary || '#0f172a';
  const accent = p.accent || '#c9a227';
  const bg = p.background || '#ffffff';
  const text = p.text || '#111827';
  const [addr1, addr2] = addressLines(listing);
  const price = money(listing.price || listing.list_price || listing.close_price);
  const hero = photos[0] || bgImage;
  const t = c.template || 'hero';
  const serif = t === 'luxury' ? "'Playfair Display', Georgia, serif" : "'Montserrat', 'Inter', Arial, sans-serif";
  const base = { width: w, height: h, background: bg, color: text, fontFamily: "'Montserrat', 'Inter', Arial, sans-serif", position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: shape === 'wide' ? 'row' : 'column' };
  const ribbon = c.ribbon && <div style={{ display: 'inline-block', background: accent, color: '#fff', fontWeight: 800, letterSpacing: u * 0.4, fontSize: u * 2.6, padding: `${u * 1}px ${u * 2.4}px`, textTransform: 'uppercase' }}>{c.ribbon}</div>;
  const bullets = (c.bullets || []).length > 0 && (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: shape === 'tall' || shape === 'wide' ? '1fr' : '1fr 1fr', gap: `${u * 0.8}px ${u * 3}px`, fontSize: u * 2.4 }}>
      {c.bullets.map((b) => <li key={b} style={{ display: 'flex', gap: u * 1.2 }}><span style={{ color: accent, fontWeight: 900 }}>•</span>{b}</li>)}
    </ul>
  );
  const text1 = (
    <>
      {c.headline && <div style={{ fontFamily: serif, fontSize: u * (shape === 'wide' ? 5.6 : 6.4), fontWeight: t === 'luxury' ? 600 : 800, lineHeight: 1.08, color: t === 'bold' ? '#fff' : primary }}>{c.headline}</div>}
      {c.subheadline && <div style={{ fontSize: u * 2.9, opacity: 0.85, marginTop: u * 1 }}>{c.subheadline}</div>}
      {(addr1 || price) && (
        <div style={{ marginTop: u * 2 }}>
          {price && <div style={{ fontSize: u * 4.6, fontWeight: 800, color: t === 'bold' ? '#fff' : accent }}>{price}</div>}
          {addr1 && <div style={{ fontSize: u * 2.8, fontWeight: 600 }}>{addr1}</div>}
          {addr2 && <div style={{ fontSize: u * 2.4, opacity: 0.8 }}>{addr2}</div>}
        </div>
      )}
      {c.event_line && <div style={{ marginTop: u * 1.6, fontSize: u * 3, fontWeight: 700, color: t === 'bold' ? '#fff' : primary }}>{c.event_line}</div>}
    </>
  );

  const wrap = (children) => <div style={{ width: w * scale, height: h * scale }}><div style={{ ...base, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div></div>;

  if (shape === 'wide') {
    return wrap(
      <>
        <Photo src={hero} style={{ width: '50%', height: '100%' }} fallback={`linear-gradient(135deg, ${primary}, ${shade(primary, 60)})`} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: t === 'bold' ? primary : t === 'luxury' ? '#0d0d0d' : bg, color: t === 'luxury' || t === 'bold' ? '#fff' : text }}>
          <div style={{ padding: `${u * 4}px ${u * 4}px ${u * 2}px`, flex: 1 }}>
            {ribbon}
            <div style={{ marginTop: u * 2 }}>{text1}</div>
            <div style={{ marginTop: u * 2 }}><Facts listing={listing} u={u * 0.9} color={t === 'luxury' || t === 'bold' ? '#fff' : primary} sep={accent} /></div>
          </div>
          <AgentBar agent={agent} brand={brand} u={u * 0.8} fg="#fff" bg={t === 'bold' ? shade(primary, -30) : '#111827'} compact />
        </div>
      </>,
    );
  }

  if (t === 'grid') {
    const rest = photos.slice(1, 4);
    return wrap(
      <>
        <div style={{ position: 'relative', height: shape === 'tall' ? '36%' : '44%', flexShrink: 0 }}>
          <Photo src={hero} style={{ width: '100%', height: '100%' }} fallback={`linear-gradient(135deg, ${primary}, ${shade(primary, 60)})`} />
          <div style={{ position: 'absolute', left: u * 3.5, top: u * 3.5 }}>{ribbon}</div>
        </div>
        {rest.length > 0 && <div style={{ display: 'flex', gap: u * 0.6, height: shape === 'tall' ? '10%' : '13%', flexShrink: 0, background: bg }}>{rest.map((s) => <Photo key={s} src={s} style={{ flex: 1, height: '100%' }} />)}</div>}
        <Fit style={{ flex: 1, padding: `${u * 3}px ${u * 3.5}px`, gap: u * 1.6 }}>
          {text1}
          <Facts listing={listing} u={u} color={primary} sep={accent} />
          {shape === 'tall' && c.body && <div style={{ fontSize: u * 2.4, lineHeight: 1.45, opacity: 0.9 }}>{c.body}</div>}
          {bullets}
        </Fit>
        <AgentBar agent={agent} brand={brand} u={u} fg="#fff" bg={primary} />
      </>,
    );
  }

  if (t === 'luxury') {
    return wrap(
      <div style={{ ...base, position: 'absolute', inset: 0, background: '#0d0d0d', color: '#f5f1e8', flexDirection: 'column' }}>
        <div style={{ position: 'relative', height: shape === 'tall' ? '46%' : '54%', flexShrink: 0 }}>
          <Photo src={hero} style={{ width: '100%', height: '100%' }} fallback="linear-gradient(135deg,#1a1a1a,#3a3226)" />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, #0d0d0d 100%)' }} />
        </div>
        <Fit style={{ flex: 1, padding: `${u * 2}px ${u * 5}px`, textAlign: 'center', alignItems: 'center', gap: u * 1.4 }}>
          <div style={{ color: accent, letterSpacing: u * 0.8, fontSize: u * 2.2, textTransform: 'uppercase' }}>{c.ribbon}</div>
          <div style={{ width: u * 14, height: 1, background: accent }} />
          <div style={{ fontFamily: serif, fontSize: u * 6, lineHeight: 1.1 }}>{c.headline}</div>
          {price && <div style={{ fontFamily: serif, fontSize: u * 4, color: accent }}>{price}</div>}
          {addr1 && <div style={{ fontSize: u * 2.4, letterSpacing: u * 0.3, textTransform: 'uppercase', opacity: 0.85 }}>{addr1}{addr2 ? ` · ${addr2}` : ''}</div>}
          {c.event_line && <div style={{ fontSize: u * 2.8 }}>{c.event_line}</div>}
          <Facts listing={listing} u={u * 0.9} color="#f5f1e8" sep={accent} />
          {shape === 'tall' && c.body && <div style={{ fontSize: u * 2.3, lineHeight: 1.55, opacity: 0.85, maxWidth: u * 80 }}>{c.body}</div>}
        </Fit>
        <AgentBar agent={agent} brand={brand} u={u} fg="#f5f1e8" bg="#161616" />
      </div>,
    );
  }

  if (t === 'bold') {
    return wrap(
      <div style={{ ...base, position: 'absolute', inset: 0, background: primary, color: '#fff', flexDirection: 'column' }}>
        <div style={{ position: 'relative', height: shape === 'tall' ? '42%' : '48%', flexShrink: 0, clipPath: 'polygon(0 0,100% 0,100% 82%,0 100%)' }}>
          <Photo src={hero} style={{ width: '100%', height: '100%' }} fallback={`linear-gradient(135deg, ${shade(primary, 40)}, ${accent})`} />
        </div>
        <div style={{ position: 'absolute', right: u * 3.5, top: u * 3.5, transform: 'rotate(-3deg)' }}>{ribbon}</div>
        <Fit style={{ flex: 1, padding: `${u * 1}px ${u * 4}px ${u * 3}px`, gap: u * 1.6 }}>
          {text1}
          <Facts listing={listing} u={u} color="#fff" sep={accent} />
          {bullets}
          {c.cta && <div style={{ alignSelf: 'flex-start', marginTop: 'auto', background: '#fff', color: primary, fontWeight: 800, fontSize: u * 2.6, padding: `${u * 1.2}px ${u * 3}px`, borderRadius: u * 5 }}>{c.cta}</div>}
        </Fit>
        <AgentBar agent={agent} brand={brand} u={u} fg="#fff" bg={shade(primary, -35)} />
      </div>,
    );
  }

  if (t === 'minimal') {
    return wrap(
      <>
        <div style={{ padding: `${u * 4}px ${u * 4}px ${u * 2}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ letterSpacing: u * 0.6, fontSize: u * 2.2, fontWeight: 700, color: accent, textTransform: 'uppercase' }}>{c.ribbon}</div>
          {brand.logo && <img src={brand.logo} alt="" crossOrigin="anonymous" style={{ maxHeight: u * 5, maxWidth: u * 20, objectFit: 'contain' }} />}
        </div>
        <Photo src={hero} style={{ margin: `0 ${u * 4}px`, width: `calc(100% - ${u * 8}px)`, height: shape === 'tall' ? '38%' : '42%', flexShrink: 0 }} fallback={`linear-gradient(135deg, ${shade(bg, -20)}, ${shade(bg, -50)})`} />
        <Fit style={{ flex: 1, padding: `${u * 3}px ${u * 4}px`, gap: u * 1.4 }}>
          {text1}
          <Facts listing={listing} u={u} color={text} sep={shade(bg, -60)} />
          {shape === 'tall' && c.body && <div style={{ fontSize: u * 2.4, lineHeight: 1.5, opacity: 0.8 }}>{c.body}</div>}
        </Fit>
        <AgentBar agent={agent} brand={brand} u={u} fg={text} bg={shade(bg, -12)} />
      </>,
    );
  }

  // hero
  return wrap(
    <>
      <div style={{ position: 'relative', height: shape === 'tall' ? '44%' : '50%', flexShrink: 0 }}>
        <Photo src={hero} style={{ width: '100%', height: '100%' }} fallback={`linear-gradient(135deg, ${primary}, ${shade(primary, 60)})`} />
        <div style={{ position: 'absolute', left: 0, bottom: u * 3 }}>{ribbon}</div>
      </div>
      <Fit style={{ flex: 1, padding: `${u * 3}px ${u * 3.5}px`, gap: u * 1.6 }}>
        {text1}
        <Facts listing={listing} u={u} color={primary} sep={accent} />
        {shape === 'tall' && c.body && <div style={{ fontSize: u * 2.5, lineHeight: 1.45, opacity: 0.9 }}>{c.body}</div>}
        {shape !== 'tall' && bullets}
        {shape === 'tall' && bullets}
      </Fit>
      <AgentBar agent={agent} brand={brand} u={u} fg="#fff" bg={primary} />
    </>,
  );
}

/** Simple, email-client-safe HTML version (tables + inline styles). */
export function emailHtml({ content: c = {}, listing = {}, photos = [], agent = {}, brand = {} }) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
  const p = c.palette || {};
  const [a1, a2] = addressLines(listing);
  const price = money(listing.price || listing.list_price || listing.close_price);
  const facts = [listing.beds && `${listing.beds} Beds`, listing.baths_total && `${Number(listing.baths_total)} Baths`, listing.living_area && `${Number(listing.living_area).toLocaleString('en-US')} Sq Ft`].filter(Boolean).join(' &nbsp;|&nbsp; ');
  return `<!doctype html><html><body style="margin:0;background:#f3f4f6"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;font-family:Arial,Helvetica,sans-serif;color:#111827">
${photos[0] ? `<tr><td><img src="${esc(photos[0])}" width="600" style="display:block;width:100%;height:auto" alt=""></td></tr>` : ''}
<tr><td style="padding:24px 28px">
${c.ribbon ? `<div style="display:inline-block;background:${esc(p.accent || '#c9a227')};color:#fff;font-weight:bold;letter-spacing:2px;font-size:12px;padding:6px 12px">${esc(c.ribbon)}</div>` : ''}
<h1 style="font-size:26px;line-height:1.2;margin:14px 0 6px;color:${esc(p.primary || '#0f172a')}">${esc(c.headline)}</h1>
${price ? `<div style="font-size:22px;font-weight:bold;color:${esc(p.accent || '#c9a227')}">${esc(price)}</div>` : ''}
${a1 ? `<div style="font-size:15px;font-weight:bold">${esc(a1)}</div><div style="font-size:14px;color:#6b7280">${esc(a2)}</div>` : ''}
${c.event_line ? `<p style="font-size:16px;font-weight:bold">${esc(c.event_line)}</p>` : ''}
${facts ? `<p style="font-size:14px;color:#374151">${facts}</p>` : ''}
<p style="font-size:15px;line-height:1.55">${esc(c.body)}</p>
${(c.bullets || []).length ? `<ul style="font-size:14px;line-height:1.6;padding-left:18px">${c.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:${esc(p.primary || '#0f172a')};color:#fff">
<table role="presentation" width="100%"><tr>
${agent.headshot ? `<td width="64" valign="middle"><img src="${esc(agent.headshot)}" width="56" height="56" style="border-radius:50%;display:block" alt=""></td>` : ''}
<td valign="middle" style="font-size:14px;line-height:1.4"><b>${esc(agent.name)}</b><br>${esc([agent.phone, agent.email].filter(Boolean).join(' · '))}${agent.license ? `<br><span style="font-size:11px;opacity:.8">Lic. ${esc(agent.license)}</span>` : ''}</td>
<td align="right" valign="middle" style="font-size:12px">${brand.logo ? `<img src="${esc(brand.logo)}" height="36" alt="${esc(brand.brokerage)}" style="display:block;margin-left:auto">` : ''}${esc(brand.brokerage)}<br><span style="font-size:10px;opacity:.8">Equal Housing Opportunity</span></td>
</tr></table></td></tr></table></td></tr></table></body></html>`;
}
