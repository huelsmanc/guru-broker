// Full-screen story player: tap right/left for next/previous, hold to pause, swipe down or X to
// close. Viewers react or reply (it arrives as a direct message); the author and admins see who
// watched and can remove a story.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { base44, supabase } from '@/api/base44Client';
import { X, Send, Eye, Trash2, Volume2, VolumeX, Pin, Loader2 } from 'lucide-react';
import { Avatar, StoryCard } from './storyLook';

const REACTIONS = ['❤️', '🔥', '👏', '🎉', '😂'];
const ago = (d) => { const m = Math.max(1, Math.round((Date.now() - Date.parse(d)) / 60000)); return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`; };
const lc = (e) => String(e || '').toLowerCase();

async function sendDm(me, toEmail, text) {
  const [to] = await base44.entities.User.filter({ email: lc(toEmail) }, '-created_date', 1);
  if (!to) throw new Error('That person is no longer here.');
  await base44.entities.DirectMessage.create({
    brokerage_id: me.brokerage_id, sender_email: lc(me.email), sender_id: me.id, sender_name: me.display_name || me.full_name || me.email, sender_photo: me.headshot || '',
    receiver_email: lc(to.email), receiver_id: to.id, receiver_name: to.display_name || to.full_name || to.email, receiver_photo: to.headshot || '',
    content: text, reactions: [], read: false,
  });
}

export default function StoryViewer({ groups, startGroup, me, admin, onClose, onSeen, onRemoved }) {
  const [gi, setGi] = useState(startGroup);
  const group = groups[gi];
  const firstUnseen = (g) => Math.max(0, g.stories.findIndex((s) => !g.seen?.has(s.id)));
  const [si, setSi] = useState(() => firstUnseen(groups[startGroup]));
  const story = group?.stories[si];
  const [progress, setProgress] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState('');
  const [toast, setToast] = useState('');
  const [viewers, setViewers] = useState(null);
  const [busy, setBusy] = useState(false);
  const videoRef = useRef(null);
  const startY = useRef(null);
  const held = useRef(false);
  const holdTimer = useRef(null);
  const elapsed = useRef(0); // share of the current story already shown (0-1)
  const mine = story && lc(story.author_email) === lc(me.email);
  const canManage = mine || admin;
  const typing = reply.length > 0;
  const stopped = paused || typing || !!viewers;

  const next = useCallback(() => {
    if (si < group.stories.length - 1) { setSi(si + 1); return; }
    if (gi < groups.length - 1) { setGi(gi + 1); setSi(firstUnseen(groups[gi + 1])); return; }
    onClose();
  }, [si, gi, group, groups, onClose]); // eslint-disable-line react-hooks/exhaustive-deps
  const prev = () => {
    if (si > 0) { setSi(si - 1); return; }
    if (gi > 0) { setGi(gi - 1); setSi(0); }
  };

  // Record the view once per story.
  useEffect(() => {
    if (!story) return;
    elapsed.current = 0; setProgress(0); setViewers(null);
    if (group.seen?.has(story.id)) return;
    supabase.from('story_view').upsert({ brokerage_id: me.brokerage_id, story_id: story.id, viewer_email: lc(me.email), viewer_name: me.display_name || me.full_name || me.email }, { onConflict: 'story_id,viewer_email', ignoreDuplicates: true })
      .then(() => onSeen?.(story.id));
  }, [story?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Timer for photos and text (6 s); videos follow their own playback.
  useEffect(() => {
    if (!story || story.kind === 'video' || stopped) return undefined;
    const total = 6000; const t0 = Date.now() - elapsed.current * total;
    const id = setInterval(() => {
      const p = (Date.now() - t0) / total;
      elapsed.current = p;
      if (p >= 1) { clearInterval(id); next(); } else setProgress(p);
    }, 50);
    return () => clearInterval(id);
  }, [story?.id, stopped]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const v = videoRef.current; if (!v) return;
    if (stopped) v.pause(); else v.play().catch(() => { setMuted(true); v.muted = true; v.play().catch(() => {}); });
  }, [stopped, story?.id]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; };
  }, [next]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!story) return null;
  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 1800); };

  const react = async (emoji) => {
    try {
      await supabase.from('story_view').upsert({ brokerage_id: me.brokerage_id, story_id: story.id, viewer_email: lc(me.email), viewer_name: me.display_name || me.full_name || me.email, reaction: emoji }, { onConflict: 'story_id,viewer_email' });
      await sendDm(me, story.author_email, `${emoji} Reacted to your story${story.title ? `: ${story.title}` : story.caption ? `: "${String(story.caption).slice(0, 80)}"` : ''}`);
      flash(`Sent ${emoji}`);
    } catch (e) { flash(e.message); }
  };
  const sendReply = async () => {
    const text = reply.trim(); if (!text) return;
    setBusy(true);
    try {
      await sendDm(me, story.author_email, `Replied to your story${story.title ? ` (${story.title})` : ''}: ${text}`);
      setReply(''); flash('Sent as a message');
    } catch (e) { flash(e.message); } finally { setBusy(false); }
  };
  const openViewers = async () => {
    setViewers('loading');
    const { data } = await supabase.from('story_view').select('viewer_email, viewer_name, reaction, created_date').eq('story_id', story.id).order('created_date', { ascending: false });
    setViewers((data || []).filter((v) => lc(v.viewer_email) !== lc(story.author_email)));
  };
  const remove = async () => {
    if (!window.confirm('Remove this story for everyone?')) return;
    setBusy(true);
    try { await base44.functions.invoke('stories', { action: 'remove', story_id: story.id }); onRemoved?.(story.id); onClose(); } catch (e) { flash(e.message); } finally { setBusy(false); }
  };

  const tap = (e) => {
    if (held.current) { held.current = false; return; }
    const x = e.clientX / window.innerWidth;
    if (x < 0.3) prev(); else next();
  };

  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center select-none" style={{ height: '100dvh' }}
      onTouchStart={(e) => { startY.current = e.touches[0].clientY; }}
      onTouchEnd={(e) => { if (startY.current != null && e.changedTouches[0].clientY - startY.current > 90) onClose(); startY.current = null; }}>
      <div className="relative w-full h-full sm:h-[92dvh] sm:max-w-[420px] sm:rounded-2xl overflow-hidden bg-neutral-900">
        {/* Media */}
        {story.kind === 'photo' && <img src={story.media_url} alt="" className="absolute inset-0 w-full h-full object-contain" />}
        {story.kind === 'video' && (
          <video key={story.id} ref={videoRef} src={story.media_url} playsInline autoPlay muted={muted} className="absolute inset-0 w-full h-full object-contain"
            onTimeUpdate={(e) => setProgress(e.currentTarget.currentTime / (e.currentTarget.duration || story.duration_seconds || 30))}
            onEnded={next} onError={() => flash("This video couldn't play")} />
        )}
        {(story.kind === 'text' || story.kind === 'auto') && <StoryCard story={story} />}
        {story.caption && (story.kind === 'photo' || story.kind === 'video') && (
          <div className="absolute inset-x-0 bottom-24 px-5"><p className="mx-auto w-fit max-w-full rounded-xl bg-black/55 px-3 py-2 text-center text-white text-[15px] whitespace-pre-wrap break-words">{story.caption}</p></div>
        )}

        {/* Tap areas: left third back, the rest forward; hold to pause */}
        <div className="absolute inset-0 top-16 bottom-24" onClick={tap}
          onPointerDown={() => { holdTimer.current = setTimeout(() => { held.current = true; setPaused(true); }, 220); }}
          onPointerUp={() => { clearTimeout(holdTimer.current); setPaused(false); }}
          onPointerLeave={() => { clearTimeout(holdTimer.current); setPaused(false); }} />

        {/* Top: progress, author, close */}
        <div className="absolute inset-x-0 top-0 px-3 pb-3 bg-gradient-to-b from-black/60 to-transparent" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <div className="flex gap-1">
            {group.stories.map((s, i) => (
              <div key={s.id} className="h-[3px] flex-1 rounded-full bg-white/30 overflow-hidden">
                <div className="h-full bg-white" style={{ width: `${i < si ? 100 : i === si ? Math.min(100, progress * 100) : 0}%` }} />
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-2.5 text-white">
            <Avatar name={group.name} photo={group.photo} size={34} className="ring-2 ring-white/40" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-sm font-semibold truncate">{group.key === 'brokerage' ? (story.pinned ? story.author_name : group.name) : group.name}</p>
              <p className="text-xs text-white/70 flex items-center gap-1">{story.pinned && <><Pin className="w-3 h-3" /> Announcement · </>}{ago(story.created_date)}</p>
            </div>
            {story.kind === 'video' && <button onClick={() => setMuted(!muted)} className="p-2" aria-label={muted ? 'Sound on' : 'Sound off'}>{muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}</button>}
            <button onClick={onClose} className="p-2 -mr-1" aria-label="Close"><X className="w-6 h-6" /></button>
          </div>
        </div>

        {/* Bottom: reply and reactions, or who watched */}
        <div className="absolute inset-x-0 bottom-0 px-3 pt-6 bg-gradient-to-t from-black/70 to-transparent" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {mine ? null : (
            <div className="flex items-center gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendReply()}
                placeholder={`Reply to ${String(story.author_name || '').split(' ')[0] || 'them'}…`}
                className="flex-1 min-w-0 rounded-full border border-white/40 bg-black/30 px-4 py-2.5 text-base text-white placeholder:text-white/60 outline-none focus:border-white" />
              {typing
                ? <button onClick={sendReply} disabled={busy} className="p-2.5 text-white" aria-label="Send">{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}</button>
                : REACTIONS.slice(0, 3).map((r) => <button key={r} onClick={() => react(r)} className="text-2xl px-0.5 active:scale-125 transition-transform" aria-label={`React ${r}`}>{r}</button>)}
            </div>
          )}
          {canManage && (
            <div className="flex items-center justify-between text-white mt-2">
              <button onClick={openViewers} className="flex items-center gap-1.5 text-sm py-2"><Eye className="w-4 h-4" /> Seen by</button>
              <button onClick={remove} disabled={busy} className="flex items-center gap-1.5 text-sm py-2 text-red-300"><Trash2 className="w-4 h-4" /> Remove</button>
            </div>
          )}
        </div>

        {toast && <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/75 px-4 py-2 text-sm text-white">{toast}</div>}

        {/* Who watched */}
        {viewers && (
          <div className="absolute inset-x-0 bottom-0 max-h-[60%] rounded-t-2xl bg-background text-foreground flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <p className="font-semibold">{viewers === 'loading' ? 'Seen by' : `Seen by ${viewers.length}`}</p>
              <button onClick={() => setViewers(null)} aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="overflow-y-auto">
              {viewers === 'loading' ? <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin" /></div>
                : !viewers.length ? <p className="p-6 text-sm text-muted-foreground text-center">No one yet.</p>
                : viewers.map((v) => (
                  <div key={v.viewer_email} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={v.viewer_name || v.viewer_email} size={32} />
                    <p className="flex-1 text-sm truncate">{v.viewer_name || v.viewer_email}</p>
                    {v.reaction && <span className="text-lg">{v.reaction}</span>}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
