// How each kind of story looks on screen (used by the viewer and the composer's preview).
import React from 'react';

export const BACKGROUNDS = {
  brand: 'linear-gradient(150deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.65) 100%)',
  sunset: 'linear-gradient(150deg, #f97316 0%, #db2777 100%)',
  ocean: 'linear-gradient(150deg, #0ea5e9 0%, #4338ca 100%)',
  forest: 'linear-gradient(150deg, #22c55e 0%, #065f46 100%)',
  night: 'linear-gradient(150deg, #334155 0%, #0f172a 100%)',
  gold: 'linear-gradient(150deg, #fbbf24 0%, #b45309 100%)',
};
export const AUTO_LOOK = {
  closed: { emoji: '🎉', bg: 'linear-gradient(160deg, #16a34a 0%, #065f46 100%)', label: 'Closed' },
  listed: { emoji: '🏡', bg: 'linear-gradient(160deg, #0ea5e9 0%, #1e3a8a 100%)', label: 'Just listed' },
  certified: { emoji: '🎓', bg: 'linear-gradient(160deg, #a855f7 0%, #4c1d95 100%)', label: 'Certified' },
  anniversary: { emoji: '🥂', bg: 'linear-gradient(160deg, #f59e0b 0%, #9a3412 100%)', label: 'Anniversary' },
  welcome: { emoji: '👋', bg: 'linear-gradient(160deg, #ec4899 0%, #7c3aed 100%)', label: 'Welcome' },
};

export const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';

export function Avatar({ name, photo, size = 32, className = '' }) {
  return photo
    ? <img src={photo} alt="" className={`rounded-full object-cover ${className}`} style={{ width: size, height: size }} />
    : <div className={`rounded-full bg-primary/15 text-primary font-semibold flex items-center justify-center ${className}`} style={{ width: size, height: size, fontSize: size * 0.38 }}>{initials(name)}</div>;
}

/** Text and celebration stories: full-bleed card. Photos and videos are drawn by the viewer. */
export function StoryCard({ story }) {
  if (story.kind === 'auto') {
    const look = AUTO_LOOK[story.auto_type] || AUTO_LOOK.closed;
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-8" style={{ background: look.bg }}>
        {story.image_url && <img src={story.image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-45" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/20 to-black/60" />
        <div className="relative">
          <div className="text-7xl mb-5 drop-shadow">{look.emoji}</div>
          <div className="inline-block rounded-full bg-white/20 backdrop-blur px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3">{look.label}</div>
          <h2 className="text-3xl font-extrabold leading-tight drop-shadow">{story.title}</h2>
          {story.subtitle && <p className="mt-3 text-lg text-white/90 drop-shadow">{story.subtitle}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex items-center justify-center px-8" style={{ background: BACKGROUNDS[story.bg_color] || BACKGROUNDS.brand }}>
      <p className="text-white text-center font-bold leading-snug whitespace-pre-wrap break-words drop-shadow"
        style={{ fontSize: String(story.caption || '').length > 120 ? 22 : String(story.caption || '').length > 60 ? 28 : 34 }}>{story.caption}</p>
    </div>
  );
}
