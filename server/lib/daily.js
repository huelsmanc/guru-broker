// Daily.co video and voice calls. Rooms are private and short-lived; nobody can join
// without a meeting token from our server.
const API = 'https://api.daily.co/v1';
const key = () => process.env.DAILY_API_KEY;
export const dailyConfigured = () => !!key();

async function call(path, init = {}) {
  if (!key()) throw Object.assign(new Error("Calls aren't set up yet. Add DAILY_API_KEY in Vercel (see SETUP.md)."), { status: 400 });
  const res = await fetch(`${API}${path}`, { ...init, headers: { Authorization: `Bearer ${key()}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (!res.ok) throw Object.assign(new Error(`Daily: ${data.info || data.error || res.status}`), { status: 502 });
  return data;
}

export async function createRoom({ video, hours = 4 }) {
  try {
    return await roomRequest({ video, hours, storage: true });
  } catch (err) {
    // Plans without transcription reject the storage setting; calls still work without notes.
    if (/transcription/i.test(err.message)) return roomRequest({ video, hours, storage: false });
    throw err;
  }
}

function roomRequest({ video, hours, storage }) {
  return call('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      privacy: 'private',
      properties: {
        ...(storage ? { enable_transcription_storage: true } : {}),
        exp: Math.floor(Date.now() / 1000) + hours * 3600,
        eject_at_room_exp: true,
        enable_prejoin_ui: false,
        enable_screenshare: true,
        enable_chat: true,
        start_video_off: !video,
        max_participants: 50,
      },
    }),
  });
}

export async function meetingToken({ room, name, userId, owner, video }) {
  const { token } = await call('/meeting-tokens', {
    method: 'POST',
    body: JSON.stringify({ properties: { room_name: room, user_name: String(name || '').slice(0, 60), user_id: String(userId || '').slice(0, 36), is_owner: !!owner, start_video_off: !video, exp: Math.floor(Date.now() / 1000) + 4 * 3600 } }),
  });
  return token;
}

export async function deleteRoom(room) {
  try { await call(`/rooms/${encodeURIComponent(room)}`, { method: 'DELETE' }); } catch { /* already gone */ }
}

export const startTranscription = (room) => call(`/rooms/${encodeURIComponent(room)}/transcription/start`, { method: 'POST', body: JSON.stringify({ language: 'en', punctuate: true }) });
export const stopTranscription = (room) => call(`/rooms/${encodeURIComponent(room)}/transcription/stop`, { method: 'POST', body: '{}' }).catch(() => null);
/** 'ready' with text, 'pending' while Daily is still writing it, or 'none'. */
export async function transcriptText(room) {
  const list = await call(`/transcript?room_name=${encodeURIComponent(room)}&limit=10`);
  const items = list.data || [];
  if (!items.length) return { status: 'none', text: '' };
  if (items.some((t) => t.status === 't_in_progress')) return { status: 'pending', text: '' };
  let text = '';
  for (const t of items.filter((x) => x.status === 't_finished').sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
    const { link } = await call(`/transcript/${encodeURIComponent(t.transcriptId)}/access-link`);
    text += `${vttToText(await (await fetch(link)).text())}\n`;
  }
  return { status: 'ready', text: text.trim() };
}

/** WebVTT -> "Speaker: words" lines. */
export function vttToText(vtt) {
  const out = [];
  let last = null;
  for (const raw of String(vtt).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line === 'WEBVTT' || /^\d+$/.test(line) || line.includes('-->') || /^NOTE\b/.test(line)) continue;
    const m = line.match(/^<v\s+([^>]+)>(.*?)(<\/v>)?$/);
    const who = m ? m[1].trim() : (line.match(/^([^:]{1,40}):\s/) || [])[1] || null;
    const words = (m ? m[2] : who ? line.slice(who.length + 1) : line).replace(/<[^>]+>/g, '').trim();
    if (!words) continue;
    if (who && who === last && out.length) out[out.length - 1] += ` ${words}`;
    else { out.push(who ? `${who}: ${words}` : words); last = who; }
  }
  return out.join('\n');
}
