// Post a story: a photo, a video (30 seconds at most) or text on a color. Admins can pin an
// announcement to the front for 1, 3 or 7 days.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { base44 } from '@/api/base44Client';
import { X, Image as ImageIcon, Type, Loader2, Pin } from 'lucide-react';
import { BACKGROUNDS } from './storyLook';
import { shrinkPhoto, prepareVideo, videoLength, posterFrame, MAX_SECONDS } from './media';

export default function StoryComposer({ admin, onClose, onPosted }) {
  const [mode, setMode] = useState(null); // null | 'media' | 'text'
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [isVideo, setIsVideo] = useState(false);
  const [caption, setCaption] = useState('');
  const [bg, setBg] = useState('brand');
  const [pin, setPin] = useState(0);
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const pick = useRef(null);

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);
  useEffect(() => { const o = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = o; }; }, []);

  const choose = async (f) => {
    if (!f) return;
    setErr('');
    const video = f.type.startsWith('video/');
    if (!video && !f.type.startsWith('image/')) { setErr('Pick a photo or a video.'); return; }
    if (video) {
      try {
        const secs = await videoLength(f);
        if (secs > MAX_SECONDS + 0.5) { setErr(`That video is ${Math.round(secs)} seconds. Stories can be up to ${MAX_SECONDS}; trim it in your Photos app first.`); return; }
      } catch (e) { setErr(e.message); return; }
    }
    setFile(f); setIsVideo(video); setMode('media'); setPreview(URL.createObjectURL(f));
  };

  const post = async () => {
    setErr('');
    try {
      let payload = { action: 'post', caption, pin_days: pin || undefined };
      if (mode === 'text') {
        if (!caption.trim()) { setErr('Write something first.'); return; }
        payload = { ...payload, kind: 'text', bg_color: bg };
      } else {
        let upload = file; let seconds;
        if (isVideo) {
          setStatus('Preparing video…');
          const r = await prepareVideo(file, (p) => setStatus(`Preparing video… ${Math.round(p * 100)}%`));
          upload = r.file; seconds = r.seconds;
        } else {
          setStatus('Preparing photo…');
          upload = await shrinkPhoto(file);
        }
        setStatus('Uploading…');
        const poster = isVideo ? await posterFrame(file) : null;
        const [{ file_url }, posterUp] = await Promise.all([
          base44.integrations.Core.UploadFile({ file: upload, scope: { kind: 'misc' } }),
          poster ? base44.integrations.Core.UploadFile({ file: poster, scope: { kind: 'misc' } }).catch(() => null) : null,
        ]);
        payload = { ...payload, kind: isVideo ? 'video' : 'photo', media_url: file_url, media_type: upload.type, duration_seconds: seconds, poster_url: posterUp?.file_url };
      }
      setStatus('Posting…');
      await base44.functions.invoke('stories', payload);
      onPosted?.();
      onClose();
    } catch (e) { setErr(e.message || 'Something went wrong. Try again.'); setStatus(''); }
  };

  const busy = !!status;
  return createPortal(
    <div className="fixed inset-0 z-[2000] bg-black flex items-center justify-center" style={{ height: '100dvh' }}>
      <div className="relative w-full h-full sm:h-[92dvh] sm:max-w-[420px] sm:rounded-2xl overflow-hidden bg-neutral-900 text-white flex flex-col">
        <div className="flex items-center justify-between px-3 z-10" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
          <button onClick={() => (mode ? (setMode(null), setFile(null), setPreview(''), setErr('')) : onClose())} className="p-2" aria-label="Back" disabled={busy}><X className="w-6 h-6" /></button>
          <p className="font-semibold">New story</p>
          <span className="w-10" />
        </div>

        {!mode && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8">
            <button onClick={() => pick.current?.click()} className="w-full max-w-xs flex items-center gap-3 rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-4 text-left">
              <ImageIcon className="w-6 h-6" /><span><span className="block font-semibold">Photo or video</span><span className="text-sm text-white/70">Videos up to {MAX_SECONDS} seconds</span></span>
            </button>
            <button onClick={() => setMode('text')} className="w-full max-w-xs flex items-center gap-3 rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-4 text-left">
              <Type className="w-6 h-6" /><span><span className="block font-semibold">Text</span><span className="text-sm text-white/70">Words on a color</span></span>
            </button>
            <input ref={pick} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => choose(e.target.files?.[0])} />
            {err && <p className="text-sm text-red-300 text-center">{err}</p>}
          </div>
        )}

        {mode && (
          <div className="relative flex-1 min-h-0 mt-2 mx-3 rounded-xl overflow-hidden">
            {mode === 'media' && (isVideo
              ? <video src={preview} className="absolute inset-0 w-full h-full object-contain bg-black" autoPlay loop muted playsInline />
              : <img src={preview} alt="" className="absolute inset-0 w-full h-full object-contain bg-black" />)}
            {mode === 'text' && (
              <div className="absolute inset-0 flex items-center justify-center px-6" style={{ background: BACKGROUNDS[bg] }}>
                <textarea autoFocus rows={5} value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 250))} placeholder="Type your story"
                  className="w-full bg-transparent text-white placeholder:text-white/70 text-center text-[28px] leading-snug font-bold resize-none outline-none drop-shadow" />
              </div>
            )}
          </div>
        )}

        {mode && (
          <div className="px-3 pt-3 space-y-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
            {mode === 'text' ? (
              <div className="flex justify-center gap-2">
                {Object.entries(BACKGROUNDS).map(([k, v]) => (
                  <button key={k} onClick={() => setBg(k)} aria-label={k} className={`w-8 h-8 rounded-full border-2 ${bg === k ? 'border-white' : 'border-transparent'}`} style={{ background: v }} />
                ))}
              </div>
            ) : (
              <input value={caption} onChange={(e) => setCaption(e.target.value.slice(0, 300))} placeholder="Add a caption (optional)"
                className="w-full rounded-full border border-white/30 bg-white/10 px-4 py-2.5 text-base outline-none placeholder:text-white/60" />
            )}
            {admin && (
              <div className="flex items-center gap-2 text-sm flex-wrap">
                <Pin className="w-4 h-4 text-white/70" />
                <span className="text-white/80">Announcement, pinned to the front:</span>
                {[[0, 'Off'], [1, '1 day'], [3, '3 days'], [7, '7 days']].map(([d, l]) => (
                  <button key={d} onClick={() => setPin(d)} className={`rounded-full px-2.5 py-1 ${pin === d ? 'bg-white text-black' : 'bg-white/10'}`}>{l}</button>
                ))}
              </div>
            )}
            {err && <p className="text-sm text-red-300">{err}</p>}
            <button onClick={post} disabled={busy} className="w-full rounded-full bg-white text-black font-semibold py-3 flex items-center justify-center gap-2 disabled:opacity-80">
              {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> {status}</> : 'Share to story'}
            </button>
            {isVideo && busy && status.startsWith('Preparing') && <p className="text-xs text-white/60 text-center">Keep this screen open while the video gets smaller.</p>}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
