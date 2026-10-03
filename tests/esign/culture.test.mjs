// Idea hub and shout-outs: votes and reactions toggle and never overwrite each other; only admins
// change status or respond (and the author hears about it, even when anonymous); anonymous ideas
// don't show who shared them; comments count, notify and delete with their replies.
import assert from 'node:assert/strict';
Object.assign(process.env, { SUPABASE_URL: 'http://sb', SUPABASE_SERVICE_ROLE_KEY: 'service', SUPABASE_ANON_KEY: 'anon', HOOK_SECRET: 'hs', APP_URL: 'https://gurubroker.app' });
globalThis.fetch = async (url) => { throw new Error('unexpected ' + url); };
globalThis.__users = { cody: { id: 'u0', email: 'cody@x.com' }, ann: { id: 'u1', email: 'ann@x.com' }, bob: { id: 'u2', email: 'bob@x.com' }, zed: { id: 'u9', email: 'zed@y.com' } };
globalThis.__db = {
  profiles: [
    { id: 'u0', email: 'cody@x.com', full_name: 'Cody Huelsman', role: 'owner', brokerage_id: 'B1', extra: {} },
    { id: 'u1', email: 'ann@x.com', full_name: 'Ann Agent', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u2', email: 'bob@x.com', full_name: 'Bob Builder', role: 'agent', brokerage_id: 'B1', extra: {} },
    { id: 'u9', email: 'zed@y.com', full_name: 'Zed Other', role: 'owner', brokerage_id: 'B2', extra: {} },
  ],
  idea: [], comment: [], notification: [],
  recognition: [{ id: 'r1', brokerage_id: 'B1', from_email: 'ann@x.com', from_name: 'Ann Agent', to_email: 'bob@x.com', to_name: 'Bob Builder', message: 'Great open house', category: 'teamwork', reactions: [], updated_date: '2026-10-01T00:00:00Z', extra: {} }],
};
const { POST } = await import('./fn.mjs');
const call = (tok, body) => POST(new Request('https://gurubroker.app/api/fn/culture', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tok}` }, body: JSON.stringify(body) })).then(async (r) => ({ status: r.status, body: await r.json() }));
const told = (email, re) => __db.notification.some((n) => n.user_email === email && re.test(n.title));

// Sharing: the author's vote counts; anonymous ones keep no visible email.
let r = await call('ann', { action: 'idea_create', title: 'Open house kit', description: 'Signs and flyers ready to go', category: 'marketing' });
assert.equal(r.status, 200, JSON.stringify(r.body));
const idea = r.body.idea;
assert.deepEqual(idea.voters, ['ann@x.com']); assert.equal(idea.submitter_name, 'Ann Agent'); assert.equal(idea.status, 'under_review');
r = await call('bob', { action: 'idea_create', title: 'Quieter office Fridays', is_anonymous: true });
const anon = __db.idea.find((x) => x.id === r.body.idea.id);
assert.ok(!JSON.stringify(anon).includes('bob@'), 'no one can see who shared it');
assert.equal((await call('ann', { action: 'idea_create', title: '  ' })).status, 400);

// Voting toggles; two votes at once both count.
r = await call('bob', { action: 'idea_vote', id: idea.id });
assert.deepEqual(r.body.idea.voters.sort(), ['ann@x.com', 'bob@x.com']);
r = await call('bob', { action: 'idea_vote', id: idea.id });
assert.deepEqual(r.body.idea.voters, ['ann@x.com']);
await Promise.all([call('bob', { action: 'idea_vote', id: idea.id }), call('cody', { action: 'idea_vote', id: idea.id })]);
assert.equal(__db.idea.find((x) => x.id === idea.id).extra.voters.length, 3, 'simultaneous votes both kept');
assert.equal((await call('zed', { action: 'idea_vote', id: idea.id })).status, 404, 'other brokerages cannot touch it');

// Status and response: admins only; the author is told, anonymous authors too.
assert.equal((await call('bob', { action: 'idea_update', id: idea.id, status: 'implemented' })).status, 403);
r = await call('cody', { action: 'idea_update', id: idea.id, status: 'planned', response: 'Love it, ordering signs this week.' });
assert.equal(r.status, 200, JSON.stringify(r.body));
assert.equal(r.body.idea.status, 'planned'); assert.equal(r.body.idea.response_by, 'Cody Huelsman');
assert.ok(told('ann@x.com', /now Planned/));
await call('cody', { action: 'idea_update', id: anon.id, status: 'in_progress' });
assert.ok(told('bob@x.com', /now In progress/), 'anonymous author still hears back');
assert.equal((await call('cody', { action: 'idea_update', id: idea.id, status: 'bogus' })).status, 400);

// Comments: counted, author and the person replied to are told; deleting takes replies with it.
r = await call('bob', { action: 'idea_comment', id: idea.id, content: 'Yes please!' });
const c1 = r.body.comment;
assert.ok(told('ann@x.com', /Bob Builder commented/));
r = await call('ann', { action: 'idea_comment', id: idea.id, parent_id: c1.id, content: 'Thanks Bob' });
assert.equal(r.body.comment.parent_comment_id, c1.id);
assert.ok(told('bob@x.com', /Ann Agent replied/));
assert.equal(__db.idea.find((x) => x.id === idea.id).extra.comment_count, 2);
assert.equal((await call('ann', { action: 'comment_delete', id: c1.id })).status, 403, 'not her comment');
r = await call('bob', { action: 'comment_delete', id: c1.id });
assert.equal(r.body.deleted, 2);
assert.equal(__db.comment.length, 0); assert.equal(__db.idea.find((x) => x.id === idea.id).extra.comment_count, 0);

// Delete idea: author or admin.
assert.equal((await call('bob', { action: 'idea_delete', id: idea.id })).status, 403);
assert.equal((await call('bob', { action: 'idea_delete', id: anon.id })).status, 200, 'anonymous author can delete their own');
assert.equal((await call('cody', { action: 'idea_delete', id: idea.id })).status, 200);
assert.equal(__db.idea.length, 0);

// Shout-out reactions toggle and don't clobber each other; delete by giver or admin.
await Promise.all([call('ann', { action: 'shout_react', id: 'r1', emoji: '🎉' }), call('bob', { action: 'shout_react', id: 'r1', emoji: '🎉' }), call('cody', { action: 'shout_react', id: 'r1', emoji: '❤️' })]);
let rec = __db.recognition[0];
assert.equal(rec.reactions.find((x) => x.emoji === '🎉').users.length, 2); assert.equal(rec.reactions.length, 2);
await call('cody', { action: 'shout_react', id: 'r1', emoji: '❤️' });
assert.equal(__db.recognition[0].reactions.length, 1, 'unreact removes it');
assert.equal((await call('ann', { action: 'shout_react', id: 'r1', emoji: '<script>' })).status, 400);
assert.equal((await call('bob', { action: 'shout_delete', id: 'r1' })).status, 403, 'receiver cannot delete');
assert.equal((await call('ann', { action: 'shout_delete', id: 'r1' })).status, 200);
console.log('ideas and shout-outs: all checks passed');
