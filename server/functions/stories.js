// New: Stories, like Instagram and Facebook, inside the brokerage.
//   post      a photo, a video (30 seconds at most) or a text story; admins can pin an
//             announcement to the front for up to 7 days
//   remove    the author or an admin takes a story down (and its file)
// The app also posts celebrations by itself:
//   a deal closes (automation) · an agent joins (automation) · a new MLS listing (hourly scan)
//   · a certificate (training route) · a work anniversary (daily, which also clears old stories)
import { createClientFromRequest, isServiceRequest, adminClient } from '../lib/base44.js';
import { isAdminRole } from '../lib/team.js';
import { pathFromUrl, parsePath, PRIVATE_BUCKET } from '../lib/files.js';
import { autoStory, listingPhoto, photoOf, dealLine, clearExpired, signStories, DAY } from '../lib/stories.js';

class Problem extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
const lc = (e) => String(e || '').toLowerCase().trim();
const clip = (v, n) => String(v ?? '').slice(0, n);
const BGS = ['sunset', 'ocean', 'forest', 'night', 'brand', 'gold'];
const MAX_PER_DAY = 20;

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const E = base44.asServiceRole.entities;

    // ------------------------------------------------------------ made by the app
    if (body.event || body.scan || body.daily) {
      if (!isServiceRequest(req)) return Response.json({ error: 'Not available' }, { status: 403 });

      if (body.event) {
        const { type, entity_name: entity, data: row, old_data: old } = body.event;
        if (entity === 'Transaction' && type === 'update' && row?.status === 'closed' && old?.status !== 'closed') {
          const [agent] = await E.User.filter({ email: lc(row.agent_email) }, '-created_date', 1);
          if (!agent || agent.brokerage_id !== row.brokerage_id) return Response.json({ skipped: 'no agent' });
          const s = await autoStory(E, { brokerageId: row.brokerage_id, person: agent, type: 'closed', key: `closed:${row.id}`, subtitle: dealLine(row), image: await listingPhoto(row).catch(() => '') });
          return Response.json({ made: !!s });
        }
        if (entity === 'User' && row?.brokerage_id && (type === 'create' || !old?.brokerage_id) && !isAdminRole(row.role)) {
          const s = await autoStory(E, { brokerageId: row.brokerage_id, person: row, type: 'welcome', key: `welcome:${row.id}` });
          return Response.json({ made: !!s });
        }
        return Response.json({ skipped: true });
      }

      if (body.scan) {
        const since = new Date(Date.now() - 2 * DAY).toISOString().slice(0, 10);
        const { data: fresh } = await adminClient().from('mls_listing').select('id, street_address, city, list_agent_email, photos, status, list_date')
          .eq('status', 'Active').gte('list_date', since).not('list_agent_email', 'is', null).limit(300);
        let made = 0;
        for (const m of fresh || []) {
          if (made >= 25) break;
          const [agent] = await E.User.filter({ email: lc(m.list_agent_email) }, '-created_date', 1);
          if (!agent?.brokerage_id) continue;
          const s = await autoStory(E, { brokerageId: agent.brokerage_id, person: agent, type: 'listed', key: `listed:mls:${m.id}`, subtitle: [m.street_address, m.city].filter(Boolean).join(', '), image: photoOf(m) });
          if (s) made += 1;
        }
        return Response.json({ made });
      }

      // Daily: work anniversaries (by the brokerage's start date) and clearing out old stories.
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // YYYY-MM-DD
      const [y, md] = [Number(today.slice(0, 4)), today.slice(5)];
      const { data: people } = await adminClient().from('profiles').select('*').not('start_date', 'is', null).not('brokerage_id', 'is', null).limit(5000);
      let anniversaries = 0;
      for (const p of people || []) {
        const sd = String(p.start_date || '');
        const years = y - Number(sd.slice(0, 4));
        if (sd.slice(5, 10) !== md || years < 1 || p.suspended) continue;
        const s = await autoStory(E, { brokerageId: p.brokerage_id, person: p, type: 'anniversary', key: `anniv:${p.id}:${y}`, years });
        if (s) anniversaries += 1;
      }
      return Response.json({ anniversaries, cleared: await clearExpired() });
    }

    // ------------------------------------------------------------ people
    const me = await base44.auth.me();
    const admin = isAdminRole(me.role) || me.role === 'super_admin';
    if (!me.brokerage_id) throw new Problem('Join a brokerage first.', 403);

    // The story row: live stories with photos and videos ready to load straight away.
    if (body.action === 'feed') {
      const live = await base44.entities.Story.filter({ brokerage_id: me.brokerage_id, expires_at: { $gt: new Date().toISOString() } }, '-created_date', 300);
      return Response.json({ stories: await signStories(live) });
    }

    if (body.action === 'post') {
      const kind = ['photo', 'video', 'text'].includes(body.kind) ? body.kind : null;
      if (!kind) throw new Problem('Pick a photo, a video or text.');
      const caption = clip(body.caption, kind === 'text' ? 250 : 300).trim();
      let media_url = '', media_type = '', poster = '';
      if (kind === 'text') {
        if (!caption) throw new Problem('Write something for your story.');
      } else {
        const info = parsePath(pathFromUrl(body.media_url));
        if (!info || info.kind !== 'misc' || info.brokerageId !== me.brokerage_id) throw new Problem('Upload the photo or video again.');
        media_url = String(body.media_url);
        media_type = clip(body.media_type, 60);
        // A video's first frame, shown while it loads.
        const pinfo = parsePath(pathFromUrl(body.poster_url));
        if (kind === 'video' && pinfo?.kind === 'misc' && pinfo.brokerageId === me.brokerage_id) poster = String(body.poster_url);
        if (kind === 'video' && !(Number(body.duration_seconds) > 0 && Number(body.duration_seconds) <= 31)) throw new Problem('Videos can be up to 30 seconds.');
      }
      const since = new Date(Date.now() - DAY).toISOString();
      const mine = await E.Story.filter({ brokerage_id: me.brokerage_id, author_email: lc(me.email), created_date: { $gte: since } }, '-created_date', MAX_PER_DAY + 1).catch(() => []);
      if (mine.length >= MAX_PER_DAY) throw new Problem(`That's ${MAX_PER_DAY} stories today. Try again tomorrow.`, 429);
      const pinDays = admin ? [1, 3, 7].find((d) => d === Number(body.pin_days)) : null;
      const story = await E.Story.create({
        brokerage_id: me.brokerage_id, kind, media_url, media_type, caption, image_url: poster,
        bg_color: kind === 'text' ? (BGS.includes(body.bg_color) ? body.bg_color : 'brand') : '',
        duration_seconds: kind === 'video' ? Math.round(Number(body.duration_seconds)) : null,
        author_email: lc(me.email), author_name: me.display_name || me.full_name || me.email, author_photo: me.headshot || '',
        pinned: !!pinDays, expires_at: new Date(Date.now() + (pinDays || 1) * DAY).toISOString(),
      });
      return Response.json({ story });
    }

    if (body.action === 'remove') {
      const s = await E.Story.get(String(body.story_id || '')).catch(() => null);
      if (!s || (s.brokerage_id !== me.brokerage_id && me.role !== 'super_admin')) throw new Problem('Story not found', 404);
      if (lc(s.author_email) !== lc(me.email) && !admin) throw new Problem('Only the person who posted it or an admin can remove it.', 403);
      const paths = [pathFromUrl(s.media_url), pathFromUrl(s.image_url)].filter(Boolean);
      if (paths.length) await adminClient().storage.from(PRIVATE_BUCKET).remove(paths).catch(() => {});
      await adminClient().from('story_view').delete().eq('story_id', s.id);
      await E.Story.delete(s.id);
      return Response.json({ ok: true });
    }

    throw new Problem('Unknown action');
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('stories:', error);
    return Response.json({ error: error.message || 'Something went wrong' }, { status });
  }
};
