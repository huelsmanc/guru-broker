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
  return call('/rooms', {
    method: 'POST',
    body: JSON.stringify({
      privacy: 'private',
      properties: {
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
