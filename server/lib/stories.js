// Stories: shared helpers for posting, celebrations made by the app, and clean-up.
import { adminClient } from './base44.js';
import { pathFromUrl, PRIVATE_BUCKET } from './files.js';

export const DAY = 864e5;
const lc = (e) => String(e || '').toLowerCase().trim();
const clip = (v, n) => String(v ?? '').slice(0, n);

// Celebration looks: emoji + gradient. The page draws them; the server only picks the type.
export const AUTO = {
  closed: { emoji: '🎉', title: (n) => `${n} just closed!` },
  listed: { emoji: '🏡', title: (n) => `New listing from ${n}` },
  certified: { emoji: '🎓', title: (n) => `${n} earned a certificate` },
  anniversary: { emoji: '🥂', title: (n, y) => `Happy ${y}-year anniversary, ${n}!` },
  welcome: { emoji: '👋', title: (n) => `Welcome to the team, ${n}!` },
};

/** The person's real name, or '' when all we have is an email (an invited agent who hasn't signed up yet). */
export const realName = (u) => [u?.display_name, u?.full_name].map((v) => String(v || '').trim()).find((v) => v && !v.includes('@')) || '';
const firstName = (u) => realName(u).split(/\s+/)[0] || String(u?.email || 'Someone').split('@')[0];
const street = (addr) => String(addr || '').split(',')[0].trim();

/** Is the brokerage showing celebration stories? (Settings → Brokerage; on unless turned off.) */
async function autoOn(E, brokerageId) {
  const [s] = await E.BrokerageSettings.filter({ brokerage_id: brokerageId }, '-created_date', 1).catch(() => []);
  return s?.stories_auto !== false;
}

/**
 * A celebration story from the app. Made once per `key` (a deal closing twice makes one story).
 * Returns the story, or null when skipped.
 */
export async function autoStory(E, { brokerageId, person, type, key, subtitle = '', image = '', link = '', years }) {
  if (!brokerageId || !person?.email || !AUTO[type]) return null;
  if (person.suspended || person.role === 'super_admin') return null;
  if (!(await autoOn(E, brokerageId))) return null;
  const existing = await E.Story.filter({ brokerage_id: brokerageId, auto_key: key }, '-created_date', 1).catch(() => []);
  if (existing.length) {
    // A welcome posted before the person had a name: put the name on it now.
    const old = existing[0];
    if (type === 'welcome' && realName(person) && /@/.test(`${old.title} ${old.author_name}`)) {
      return E.Story.update(old.id, { title: AUTO[type].title(firstName(person), years), author_name: realName(person) }).catch(() => null);
    }
    return null;
  }
  try {
    return await E.Story.create({
      brokerage_id: brokerageId, kind: 'auto', auto_type: type, auto_key: key,
      author_email: lc(person.email), author_name: realName(person) || person.email, author_photo: person.headshot || '',
      title: AUTO[type].title(firstName(person), years), subtitle: clip(subtitle, 200), image_url: clip(image, 1000), link: clip(link, 300),
      expires_at: new Date(Date.now() + DAY).toISOString(), pinned: false,
    });
  } catch (e) {
    if (/duplicate|unique/i.test(e.message)) return null; // made at the same moment by another run
    throw e;
  }
}

/** First photo of an MLS listing matching a deal (by MLS number, else street address). */
export async function listingPhoto(tx) {
  const db = adminClient();
  let m = null;
  const mls = tx.mls_number || tx.extra?.mls_number;
  if (mls) m = (await db.from('mls_listing').select('photos').eq('mls_number', String(mls)).limit(1)).data?.[0];
  const st = street(tx.property_address);
  if (!m && st.length > 4) m = (await db.from('mls_listing').select('photos').ilike('street_address', `${st.replace(/[%_]/g, '')}%`).limit(1)).data?.[0];
  return photoOf(m);
}
export function photoOf(m) {
  const p = Array.isArray(m?.photos) ? m.photos[0] : null;
  const url = typeof p === 'string' ? p : p?.url || p?.MediaURL || '';
  return /^https:\/\//.test(url) ? url : '';
}
export const dealLine = (tx) => [street(tx.property_address), tx.property_address?.split(',')[1]?.trim()].filter(Boolean).join(', ');

/** Removes stories that ended more than a day ago, with their views and uploaded files. */
export async function clearExpired() {
  const db = adminClient();
  const cutoff = new Date(Date.now() - DAY).toISOString();
  const { data: old } = await db.from('story').select('id, media_url, image_url').lt('expires_at', cutoff).limit(500);
  if (!old?.length) return 0;
  const ids = old.map((s) => s.id);
  const paths = old.flatMap((s) => [pathFromUrl(s.media_url), pathFromUrl(s.image_url)]).filter(Boolean);
  if (paths.length) await db.storage.from(PRIVATE_BUCKET).remove(paths).catch(() => {});
  await db.from('story_view').delete().in('story_id', ids);
  await db.from('story').delete().in('id', ids);
  return ids.length;
}

/** Stories with their private photos and videos signed for direct loading (no redirect per view). */
export async function signStories(stories, seconds = 7200) {
  const paths = [...new Set(stories.flatMap((s) => [pathFromUrl(s.media_url), pathFromUrl(s.image_url)]).filter(Boolean))];
  if (!paths.length) return stories;
  const { data } = await adminClient().storage.from(PRIVATE_BUCKET).createSignedUrls(paths, seconds);
  const signed = new Map((data || []).filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]));
  const sign = (u) => signed.get(pathFromUrl(u)) || u;
  return stories.map((s) => ({ ...s, media_url: s.media_url ? sign(s.media_url) : s.media_url, image_url: s.image_url ? sign(s.image_url) : s.image_url }));
}
