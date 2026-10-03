// Culture → Idea hub and Shout-outs: everything that changes them goes through here, so
//  - votes, reactions and comment counts never overwrite each other (two people tapping at once),
//  - only admins change an idea's status or post the brokerage's response,
//  - "anonymous" really is anonymous: the person's email is kept sealed, so teammates can't see it,
//    but the author still hears back when their idea moves,
//  - the right people get an in-app alert (author on a status change, response or comment; someone replied to).
// Reading stays on the pages (each brokerage's own rows, by row security).
import { createClientFromRequest, adminClient } from '../lib/base44.js';
import { isAdminRole, notifyPeople } from '../lib/team.js';
import { sealKey, openKey } from '../lib/fub.js';

class Problem extends Error { constructor(m, s = 400) { super(m); this.status = s; } }
const lc = (e) => String(e || '').toLowerCase().trim();
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const nameOf = (u) => [u?.display_name, u?.full_name].map((v) => String(v || '').trim()).find((v) => v && !v.includes('@')) || String(u?.email || '').split('@')[0];

export const IDEA_CATEGORIES = ['process', 'technology', 'culture', 'marketing', 'client_service', 'other'];
export const IDEA_STATUSES = ['under_review', 'planned', 'in_progress', 'implemented', 'rejected'];
const STATUS_LABEL = { under_review: 'Under review', planned: 'Planned', in_progress: 'In progress', implemented: 'Done', rejected: 'Not planned' };
const REACTIONS = ['❤️', '🎉', '🔥', '👏', '💪', '🚀', '😂', '🙌'];

/** Change one row safely when others may be changing it too: re-read and retry if it moved. */
async function change(table, id, fn) {
  const db = adminClient();
  for (let i = 0; i < 6; i += 1) {
    const { data: row, error } = await db.from(table).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Problem('Not found', 404);
    const patch = await fn(row);
    if (!patch) return row;
    let q = db.from(table).update(patch).eq('id', id);
    if (row.updated_date) q = q.eq('updated_date', row.updated_date);
    const { data: saved, error: e2 } = await q.select('*');
    if (e2) throw new Error(e2.message);
    if (saved?.length) return saved[0];
  }
  throw new Problem('Busy right now, try again.', 409);
}
const flat = (row) => (row ? { ...(row.extra || {}), ...row, extra: undefined } : row);
const authorEmail = (idea) => {
  if (idea.submitter_email) return lc(idea.submitter_email);
  try { return idea.extra?.submitter_sealed ? lc(openKey(idea.extra.submitter_sealed)) : ''; } catch { return ''; }
};

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me().catch(() => null);
    if (!me?.brokerage_id) throw new Problem('Not signed in', 401);
    const bid = me.brokerage_id;
    const admin = isAdminRole(me.role);
    const E = base44.asServiceRole.entities;
    const body = await req.json().catch(() => ({}));
    const mine = async (table, id) => {
      const { data } = await adminClient().from(table).select('*').eq('id', String(id || '')).maybeSingle();
      if (!data || data.brokerage_id !== bid) throw new Problem('Not found', 404);
      return data;
    };
    const tell = (people, title, message, link, id, type) => notifyPeople(E, { brokerageId: bid, people, title, message, link, referenceId: id, referenceType: type, email: false })
      .catch((e) => console.error('culture notify failed', e.message));

    switch (body.action) {
      // ------------------------------------------------------------------ ideas
      case 'idea_create': {
        const title = clip(body.title, 120); const description = clip(body.description, 2000);
        if (!title) throw new Problem('Give your idea a title.');
        const anon = !!body.is_anonymous;
        const { data, error } = await adminClient().from('idea').insert({
          brokerage_id: bid, title, description, category: IDEA_CATEGORIES.includes(body.category) ? body.category : 'other',
          status: 'under_review', is_anonymous: anon,
          submitter_email: anon ? null : lc(me.email), submitter_name: anon ? null : nameOf(me),
          created_by: anon ? null : lc(me.email),
          extra: { voters: anon ? [] : [lc(me.email)], comment_count: 0, /* an anonymous author's own vote would give them away */ ...(anon ? { submitter_sealed: sealKey(lc(me.email)) } : {}) },
        }).select('*').single();
        if (error) throw new Error(error.message);
        return Response.json({ idea: flat(data) });
      }

      case 'idea_vote': {
        const idea = await mine('idea', body.id);
        const you = lc(me.email);
        const saved = await change('idea', idea.id, (r) => {
          const voters = new Set((r.extra?.voters || []).map(lc));
          if (voters.has(you)) voters.delete(you); else voters.add(you);
          return { extra: { ...(r.extra || {}), voters: [...voters] } };
        });
        return Response.json({ idea: flat(saved) });
      }

      case 'idea_update': {
        const idea = await mine('idea', body.id);
        if (!admin) throw new Problem('Only admins can change an idea’s status.', 403);
        const status = body.status !== undefined ? body.status : undefined;
        if (status !== undefined && !IDEA_STATUSES.includes(status)) throw new Problem('Unknown status');
        const response = body.response !== undefined ? clip(body.response, 2000) : undefined;
        const before = flat(idea);
        const saved = await change('idea', idea.id, (r) => ({
          ...(status !== undefined ? { status } : {}),
          ...(body.admin_notes !== undefined ? { admin_notes: clip(body.admin_notes, 2000) } : {}),
          ...(response !== undefined ? { extra: { ...(r.extra || {}), response, response_by: nameOf(me), response_at: new Date().toISOString() } } : {}),
        }));
        const author = authorEmail(idea);
        const moved = status !== undefined && status !== (before.status || 'under_review');
        const answered = response !== undefined && response && response !== (before.response || '');
        if (author && author !== lc(me.email) && (moved || answered)) {
          const title = moved ? `Your idea is now ${STATUS_LABEL[status]}` : 'Your idea got a response';
          await tell([{ email: author }], title, `"${clip(idea.title, 80)}"${answered ? `: ${clip(response, 120)}` : ''}`, `/Culture?tab=ideas&idea=${idea.id}`, idea.id, 'Idea');
        }
        return Response.json({ idea: flat(saved) });
      }

      case 'idea_delete': {
        const idea = await mine('idea', body.id);
        if (!admin && authorEmail(idea) !== lc(me.email)) throw new Problem('Only admins or the person who shared it can delete an idea.', 403);
        await adminClient().from('comment').delete().eq('idea_id', idea.id);
        await adminClient().from('idea').delete().eq('id', idea.id);
        return Response.json({ deleted: true });
      }

      case 'idea_comment': {
        const idea = await mine('idea', body.id);
        const content = clip(body.content, 2000);
        if (!content) throw new Problem('Write a comment first.');
        let parent = null;
        if (body.parent_id) { parent = await mine('comment', body.parent_id); if (parent.idea_id !== idea.id) throw new Problem('Not found', 404); }
        const { data: c, error } = await adminClient().from('comment').insert({
          brokerage_id: bid, idea_id: idea.id, parent_comment_id: parent ? (parent.parent_comment_id || parent.id) : null,
          author_email: lc(me.email), author_name: nameOf(me), content, mentions: [], created_by: lc(me.email),
        }).select('*').single();
        if (error) throw new Error(error.message);
        await change('idea', idea.id, (r) => ({ extra: { ...(r.extra || {}), comment_count: (Number(r.extra?.comment_count) || 0) + 1 } })).catch(() => {});
        const told = new Set([lc(me.email)]);
        const link = `/Culture?tab=ideas&idea=${idea.id}`;
        const author = authorEmail(idea);
        if (author && !told.has(author)) { told.add(author); await tell([{ email: author }], `${nameOf(me)} commented on your idea`, clip(content, 140), link, idea.id, 'Idea'); }
        const replyTo = lc(parent?.author_email);
        if (replyTo && !told.has(replyTo)) await tell([{ email: replyTo }], `${nameOf(me)} replied to you`, clip(content, 140), link, idea.id, 'Idea');
        return Response.json({ comment: flat(c) });
      }

      case 'comment_delete': {
        const c = await mine('comment', body.id);
        if (!admin && lc(c.author_email) !== lc(me.email)) throw new Problem('You can only delete your own comments.', 403);
        const { data: kids } = await adminClient().from('comment').select('id').eq('parent_comment_id', c.id);
        const gone = 1 + (kids?.length || 0);
        await adminClient().from('comment').delete().eq('parent_comment_id', c.id);
        await adminClient().from('comment').delete().eq('id', c.id);
        if (c.idea_id) await change('idea', c.idea_id, (r) => ({ extra: { ...(r.extra || {}), comment_count: Math.max(0, (Number(r.extra?.comment_count) || 0) - gone) } })).catch(() => {});
        return Response.json({ deleted: gone });
      }

      // ------------------------------------------------------------------ shout-outs
      case 'shout_react': {
        const rec = await mine('recognition', body.id);
        if (!REACTIONS.includes(body.emoji)) throw new Problem('Pick one of the reactions.');
        const you = lc(me.email);
        const saved = await change('recognition', rec.id, (r) => {
          let list = (Array.isArray(r.reactions) ? r.reactions : []).map((x) => ({ emoji: x.emoji, users: (x.users || []).map(lc) }));
          const hit = list.find((x) => x.emoji === body.emoji);
          if (hit) hit.users = hit.users.includes(you) ? hit.users.filter((e) => e !== you) : [...hit.users, you];
          else list.push({ emoji: body.emoji, users: [you] });
          list = list.filter((x) => x.users.length);
          return { reactions: list };
        });
        return Response.json({ recognition: flat(saved) });
      }

      case 'shout_delete': {
        const rec = await mine('recognition', body.id);
        let giver = lc(rec.from_email);
        if (!giver && rec.extra?.from_sealed) { try { giver = lc(openKey(rec.extra.from_sealed)); } catch { /* unreadable */ } }
        if (!admin && giver !== lc(me.email)) throw new Problem('Only admins or the person who gave it can delete a shout-out.', 403);
        await adminClient().from('recognition').delete().eq('id', rec.id);
        return Response.json({ deleted: true });
      }

      default:
        throw new Problem('Unknown action');
    }
  } catch (e) {
    return Response.json({ error: e.message }, { status: e.status || 500 });
  }
};
