// Getting photos and videos ready for a story, on the phone, before uploading:
// photos are resized to 1440 px JPEGs; videos must be 30 seconds or less and are re-recorded at
// 720p (when the browser can record MP4) so a clip is a few MB instead of 50+.

export const MAX_SECONDS = 30;
const MAX_UPLOAD = 50 * 1024 * 1024;

export async function shrinkPhoto(file, maxSide = 1440) {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file; // the server still checks it's an image the browser can show
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
  return blob ? new File([blob], 'story.jpg', { type: 'image/jpeg' }) : file;
}

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.playsInline = true; v.muted = true;
    v.onloadedmetadata = () => resolve(v);
    v.onerror = () => reject(new Error("That video can't be opened here. Try recording it again."));
    v.src = URL.createObjectURL(file);
  });
}

/** Seconds, or throws a friendly message. */
export async function videoLength(file) {
  const v = await loadVideo(file);
  const d = v.duration;
  URL.revokeObjectURL(v.src);
  if (!Number.isFinite(d) || d <= 0) throw new Error("That video can't be opened here. Try recording it again.");
  return d;
}

const MP4 = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4'];
const canRecordMp4 = () => typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream && MP4.some((t) => MediaRecorder.isTypeSupported?.(t));

/**
 * Returns { file, seconds }. Re-records large or high-resolution clips at 720p; small clips and
 * browsers that can't record MP4 send the original (up to 50 MB).
 */
export async function prepareVideo(file, onProgress = () => {}) {
  const seconds = await videoLength(file);
  if (seconds > MAX_SECONDS + 0.5) throw new Error(`Videos can be up to ${MAX_SECONDS} seconds. Trim it in your Photos app first.`);
  const small = file.size <= 12 * 1024 * 1024;
  if (small || !canRecordMp4()) {
    if (file.size > MAX_UPLOAD) throw new Error('That video is too large. Record it at 1080p or shorter and try again.');
    return { file, seconds };
  }
  try {
    return { file: await rerecord(file, onProgress), seconds };
  } catch {
    if (file.size > MAX_UPLOAD) throw new Error('That video is too large. Record it at 1080p or shorter and try again.');
    return { file, seconds };
  }
}

export async function rerecord(file, onProgress = () => {}) {
  const v = await loadVideo(file);
  const maxSide = 1280;
  const k = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
  const w = Math.round((v.videoWidth * k) / 2) * 2, h = Math.round((v.videoHeight * k) / 2) * 2;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const stream = c.captureStream(30);
  // Sound: route the clip through Web Audio into the recording (not to the speakers).
  let audio = null;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    audio = new AC();
    v.muted = false;
    const src = audio.createMediaElementSource(v);
    const dest = audio.createMediaStreamDestination();
    src.connect(dest);
    dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    await audio.resume().catch(() => {});
  } catch { v.muted = true; }
  const type = MP4.find((t) => MediaRecorder.isTypeSupported(t));
  const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  const done = new Promise((res) => { rec.onstop = res; });
  let stop = false;
  const draw = () => {
    if (stop) return;
    ctx.drawImage(v, 0, 0, w, h);
    onProgress(Math.min(0.99, v.currentTime / (v.duration || 1)));
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(draw); else requestAnimationFrame(draw);
  };
  v.currentTime = 0;
  rec.start(1000);
  await v.play();
  draw();
  await new Promise((res, rej) => { v.onended = res; v.onerror = () => rej(new Error('video failed')); setTimeout(() => rej(new Error('took too long')), (v.duration + 20) * 1000); });
  stop = true;
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  audio?.close?.().catch(() => {});
  URL.revokeObjectURL(v.src);
  onProgress(1);
  const blob = new Blob(chunks, { type: 'video/mp4' });
  if (blob.size < 10000 || blob.size >= file.size) throw new Error('not smaller');
  return new File([blob], 'story.mp4', { type: 'video/mp4' });
}

/** The first frame of a video as a small JPEG, shown while the video loads. */
export async function posterFrame(file) {
  try {
    const v = await loadVideo(file);
    await new Promise((res, rej) => { v.onseeked = res; v.onerror = rej; v.currentTime = Math.min(0.1, (v.duration || 1) / 2); setTimeout(res, 3000); });
    const k = Math.min(1, 720 / Math.max(v.videoWidth, v.videoHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(2, Math.round(v.videoWidth * k)); c.height = Math.max(2, Math.round(v.videoHeight * k));
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    URL.revokeObjectURL(v.src);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.7));
    return blob && blob.size > 1000 ? new File([blob], 'poster.jpg', { type: 'image/jpeg' }) : null;
  } catch { return null; }
}
