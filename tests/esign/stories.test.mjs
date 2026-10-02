// Stories: posting photos, videos (30 s max) and text; only admins pin; only the author or an admin
// removes (with the file); celebrations from closings, new agents, MLS listings, certificates and
// anniversaries are made once each, and not at all when the brokerage turns them off; old stories
// are cleared with their files.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => { throw new Error('unexpected ' + url); };
globalThis.__users = { owner: { id: 'u0', email: 'owner@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, bob: { id: 'u2', email: 'bob@x.com' } };
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'owner@x.com', full_name: 'Olivia Owner', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', display_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', start_date: `${Number(today.slice(0, 4)) - 3}${today.slice(4)}`, extra: {} },
    { id: 'u2', email: 'bob@x.com', full_name: 'Bob Builder', role: 'agent', brokerage_id: 'B1', extra: {} },
  ],
  brokerage_settings: [{ id: 's1', brokerage_id: 'B1', extra: {} }],
  story: [], story_view: [],
  mls_listing: [{ id: 'm1', status: 'Active', list_date: today, street_address: '9 Oak Ln', city: 'Chester', list_agent_email: 'bob@x.com', photos: [{ url: 'https://photos.example/1.jpg' }] }],
};
globalThis.__storage = { 'private-files/scoped/B1/misc/a-photo.jpg': new Uint8Array([1]), 'private-files/scoped/B1/misc/b-clip.mp4': new Uint8Array([1]) };
const { POST } = await import('./fn.mjs');
const call = (tok, body, headers = {}) => POST(new Request('https://gurubroker.app/api/fn/stories', { method: 'POST', headers: { 'content-type': 'application/json', ...(tok ? { authorization: `Bearer ${tok}` } : {}), ...headers }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const svc = (body) => call(null, body, { 'x-gbh-service': 'hs' });
const f = (name, b = 'B1') => `/api/file?p=${encodeURIComponent(`scoped/${b}/misc/${name}`)}`;

// Posting.
let r = await call('ann', { action: 'post', kind: 'text', caption: '' });
assert.equal(r.status, 400);
r = await call('ann', { action: 'post', kind: 'text', caption: 'Open house Sunday 1-3!', bg_color: 'ocean', pin_days: 7 });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.story.pinned, false, 'agents cannot pin');
assert.ok(Date.parse(r.body.story.expires_at) - Date.now() < 864e5 + 5000, '24 hours');
r = await call('ann', { action: 'post', kind: 'photo', media_url: f('a-photo.jpg'), media_type: 'image/jpeg', caption: 'Keys!' });
assert.equal(r.status, 200);
const photoId = r.body.story.id;
r = await call('ann', { action: 'post', kind: 'photo', media_url: `/api/file?p=${encodeURIComponent('scoped/B1/tx/t1/x.pdf')}` });
assert.equal(r.status, 400, 'only story uploads');
r = await call('ann', { action: 'post', kind: 'photo', media_url: f('a-photo.jpg', 'B2') });
assert.equal(r.status, 400, 'not another brokerage');
r = await call('ann', { action: 'post', kind: 'video', media_url: f('b-clip.mp4'), media_type: 'video/mp4', duration_seconds: 45 });
assert.equal(r.status, 400); assert.match(r.body.error, /30 seconds/);
r = await call('ann', { action: 'post', kind: 'video', media_url: f('b-clip.mp4'), media_type: 'video/mp4', duration_seconds: 29.6 });
assert.equal(r.status, 200); assert.equal(r.body.story.duration_seconds, 30);
r = await call('owner', { action: 'post', kind: 'text', caption: 'Team meeting moved to 10am', pin_days: 3 });
assert.equal(r.body.story.pinned, true);
assert.ok(Date.parse(r.body.story.expires_at) - Date.now() > 2.9 * 864e5, 'pinned for 3 days');

// Removing: not someone else's; the author can, and the file goes too.
r = await call('bob', { action: 'remove', story_id: photoId });
assert.equal(r.status, 403);
r = await call('ann', { action: 'remove', story_id: photoId });
assert.equal(r.status, 200);
assert.equal(globalThis.__storage['private-files/scoped/B1/misc/a-photo.jpg'], undefined, 'file removed');
assert.ok(!__db.story.some((s) => s.id === photoId));

// Only the system makes celebrations.
r = await call('ann', { event: { type: 'update', entity_name: 'Transaction', data: { id: 't1', brokerage_id: 'B1', status: 'closed', agent_email: 'ann@x.com' }, old_data: { status: 'pending' } } });
assert.equal(r.status, 403);
const closed = { event: { type: 'update', entity_name: 'Transaction', data: { id: 't1', brokerage_id: 'B1', status: 'closed', agent_email: 'Ann@x.com', property_address: '12 Elm St, Chester, CT 06412' }, old_data: { status: 'pending' } } };
r = await svc(closed);
assert.equal(r.body.made, true, JSON.stringify(r.body));
const c = __db.story.find((s) => s.auto_key === 'closed:t1');
assert.equal(c.title, 'Ann just closed!'); assert.equal(c.subtitle, '12 Elm St, Chester'); assert.equal(c.author_email, 'ann@x.com');
r = await svc(closed);
assert.equal(r.body.made, false, 'once per deal');
// A status change that isn't a closing does nothing.
r = await svc({ event: { type: 'update', entity_name: 'Transaction', data: { id: 't2', brokerage_id: 'B1', status: 'pending', agent_email: 'ann@x.com' }, old_data: { status: 'active' } } });
assert.equal(r.body.skipped, true);

// New agent joins: welcome; admins aren't announced.
r = await svc({ event: { type: 'update', entity_name: 'User', data: { id: 'u5', email: 'new@x.com', full_name: 'Nina New', role: 'agent', brokerage_id: 'B1' }, old_data: { brokerage_id: null } } });
assert.equal(r.body.made, true);
assert.ok(__db.story.some((s) => s.title === 'Welcome to the team, Nina!'));
r = await svc({ event: { type: 'create', entity_name: 'User', data: { id: 'u6', email: 'boss2@x.com', role: 'broker', brokerage_id: 'B1' } } });
assert.equal(r.body.skipped, true);

// Hourly: an agent's new MLS listing, once.
r = await svc({ scan: true });
assert.equal(r.body.made, 1);
const l = __db.story.find((s) => s.auto_key === 'listed:mls:m1');
assert.equal(l.title, 'New listing from Bob'); assert.equal(l.image_url, 'https://photos.example/1.jpg');
assert.equal((await svc({ scan: true })).body.made, 0);

// Daily: Ann's 3-year anniversary; old stories cleared with their files.
const old = __db.story.find((s) => s.media_url === f('b-clip.mp4'));
old.expires_at = new Date(Date.now() - 2 * 864e5).toISOString();
__db.story_view.push({ id: 'v1', story_id: old.id, viewer_email: 'bob@x.com' });
r = await svc({ daily: true });
assert.equal(r.body.anniversaries, 1); assert.equal(r.body.cleared, 1);
assert.ok(__db.story.some((s) => s.title === 'Happy 3-year anniversary, Ann!'));
assert.equal(globalThis.__storage['private-files/scoped/B1/misc/b-clip.mp4'], undefined);
assert.equal(__db.story_view.length, 0);

// Brokerage turned celebrations off: none made.
__db.brokerage_settings[0].extra.stories_auto = false;
r = await svc({ event: { type: 'update', entity_name: 'Transaction', data: { id: 't9', brokerage_id: 'B1', status: 'closed', agent_email: 'bob@x.com' }, old_data: { status: 'pending' } } });
assert.equal(r.body.made, false);
console.log('stories: all checks passed');
