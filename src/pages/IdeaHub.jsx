// Culture → Idea hub: anyone shares an idea, the team upvotes it, leadership moves it along
// (Under review → Planned → In progress → Done) and answers it. Comments and replies live on each idea.
import React, { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Lightbulb, ChevronUp, MessageCircle, Search, X, Loader2, Lock, Trash2, Reply, ArrowLeft, Megaphone, Plus } from 'lucide-react';
import { Avatar, ago, nameOf, lc, useTeam, useLive, act, chip } from '@/components/culture/shared';
import { isAdminRole } from '../../shared/permissions.generated.js';

export const IDEA_STATUS = {
  under_review: { label: 'Under review', dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300' },
  planned: { label: 'Planned', dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500', pill: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  implemented: { label: 'Done', dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
  rejected: { label: 'Not planned', dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
};
export const IDEA_CATEGORIES = [
  { id: 'process', label: 'Process', emoji: '⚙️' },
  { id: 'technology', label: 'Tech', emoji: '💻' },
  { id: 'culture', label: 'Culture', emoji: '🤝' },
  { id: 'marketing', label: 'Marketing', emoji: '📣' },
  { id: 'client_service', label: 'Clients', emoji: '😊' },
  { id: 'other', label: 'Other', emoji: '💡' },
];
const CAT = Object.fromEntries(IDEA_CATEGORIES.map((c) => [c.id, c]));
const statusOf = (i) => (IDEA_STATUS[i.status] ? i.status : 'under_review');
const votesOf = (i) => (Array.isArray(i.voters) ? i.voters : []);

export default function IdeaHub() {
  const { user, brokerageId } = useOutletContext();
  const me = lc(user?.email);
  const admin = isAdminRole(user?.role);
  const { person } = useTeam(user);
  const [params, setParams] = useSearchParams();
  const openId = params.get('idea');
  const setOpen = (id) => { const p = new URLSearchParams(params); if (id) p.set('idea', id); else p.delete('idea'); setParams(p, { replace: true }); };
  const [status, setStatus] = useState('open');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState('top');
  const [q, setQ] = useState('');
  const [sharing, setSharing] = useState(false);
  const key = ['ideas', brokerageId];
  useLive('Idea', key);
  const { data: ideas = [], isLoading } = useQuery({
    queryKey: key, enabled: !!brokerageId,
    queryFn: () => base44.entities.Idea.filter({ brokerage_id: brokerageId }, '-created_date', 500),
  });

  const count = (s) => ideas.filter((i) => (s === 'open' ? !['implemented', 'rejected'].includes(statusOf(i)) : statusOf(i) === s)).length;
  const list = ideas
    .filter((i) => (status === 'all' ? true : status === 'open' ? !['implemented', 'rejected'].includes(statusOf(i)) : statusOf(i) === status))
    .filter((i) => cat === 'all' || i.category === cat)
    .filter((i) => !q.trim() || `${i.title} ${i.description}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (sort === 'top' ? votesOf(b).length - votesOf(a).length : 0) || String(b.created_date).localeCompare(String(a.created_date)));

  const queryClient = useQueryClient();
  const vote = async (idea) => {
    // Show it right away; the server keeps everyone's votes.
    queryClient.setQueryData(key, (old) => (old || []).map((x) => (x.id !== idea.id ? x : { ...x, voters: votesOf(x).map(lc).includes(me) ? votesOf(x).filter((e) => lc(e) !== me) : [...votesOf(x), me] })));
    try { await act('idea_vote', { id: idea.id }); } catch (e) { window.alert(e.message); }
    queryClient.invalidateQueries({ queryKey: key });
  };
  const opened = ideas.find((i) => i.id === openId);

  const TABS = [['open', 'Open'], ['planned', 'Planned'], ['in_progress', 'In progress'], ['implemented', 'Done'], ['all', 'All']];

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Idea hub</h1>
          <p className="text-sm text-muted-foreground">Share what would make us better. Upvote what you want to see.</p>
        </div>
        <button onClick={() => setSharing(true)} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-sm hover:opacity-90">
          <Plus className="w-4 h-4" /> Share an idea
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        {TABS.map(([k, l]) => {
          const n = k === 'all' ? ideas.length : count(k);
          return (
            <button key={k} onClick={() => setStatus(k)} className={`shrink-0 px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap ${status === k ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
              {l}{n ? <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-[11px] tabular-nums">{n}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search ideas" className="w-full rounded-full border bg-card pl-9 pr-3 py-2 text-base md:text-sm" />
        </div>
        <div className="flex items-center gap-0.5 rounded-full bg-muted p-1 text-sm">
          {[['top', 'Top'], ['new', 'New']].map(([k, l]) => <button key={k} onClick={() => setSort(k)} className={`rounded-full px-3 py-1 ${sort === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>{l}</button>)}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
        <button onClick={() => setCat('all')} className={chip(cat === 'all')}>All topics</button>
        {IDEA_CATEGORIES.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={chip(cat === c.id)}><span>{c.emoji}</span>{c.label}</button>)}
      </div>

      {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        : !list.length ? (
          <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
            <Lightbulb className="w-8 h-8 mx-auto mb-2 text-amber-400" />
            <p className="font-medium">{ideas.length ? 'No ideas here' : 'No ideas yet'}</p>
            <p className="text-sm text-muted-foreground mt-1">{ideas.length ? 'Try another tab or filter.' : 'Got a way to make things better? Share the first one.'}</p>
          </div>
        ) : (
          <div className="rounded-2xl border bg-card divide-y">
            {list.map((i) => <IdeaRow key={i.id} idea={i} me={me} person={person} onVote={() => vote(i)} onOpen={() => setOpen(i.id)} />)}
          </div>
        )}

      {opened && <IdeaSheet idea={opened} me={me} admin={admin} person={person} onVote={() => vote(opened)} onClose={() => setOpen(null)} />}
      {sharing && <ShareIdea onClose={() => setSharing(false)} onShared={(id) => { setSharing(false); setOpen(id); }} />}
    </div>
  );
}

function VoteButton({ idea, me, onVote, big = false }) {
  const n = votesOf(idea).length;
  const on = votesOf(idea).map(lc).includes(me);
  return (
    <button onClick={(e) => { e.stopPropagation(); onVote(); }} aria-label={on ? 'Remove your vote' : 'Upvote'}
      className={`shrink-0 self-start flex ${big ? 'flex-row gap-2 px-4 py-2 rounded-full' : 'flex-col w-12 py-1.5 rounded-xl'} items-center justify-center border transition-colors ${on ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:border-primary/50 hover:bg-primary/5'}`}>
      <ChevronUp className={big ? 'w-4 h-4' : 'w-5 h-5'} strokeWidth={2.5} />
      <span className="text-sm font-semibold tabular-nums leading-none">{big ? `${n} vote${n === 1 ? '' : 's'}` : n}</span>
    </button>
  );
}

function IdeaRow({ idea, me, person, onVote, onOpen }) {
  const s = IDEA_STATUS[statusOf(idea)];
  const c = CAT[idea.category] || CAT.other;
  const by = idea.is_anonymous ? 'Anonymous' : lc(idea.submitter_email) === me ? 'You' : nameOf(person(idea.submitter_email), idea.submitter_name);
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()} className="flex gap-3 sm:gap-4 p-4 cursor-pointer hover:bg-muted/40 first:rounded-t-2xl last:rounded-b-2xl">
      <VoteButton idea={idea} me={me} onVote={onVote} />
      <div className="min-w-0 flex-1">
        <p className="font-semibold leading-snug">{idea.title}</p>
        {idea.description && <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 break-words">{idea.description}</p>}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 text-xs text-muted-foreground">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${s.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />{s.label}</span>
          <span className="whitespace-nowrap">{c.emoji} {c.label}</span>
          <span className="whitespace-nowrap">{by} · {ago(idea.created_date)}</span>
          {idea.comment_count > 0 && <span className="inline-flex items-center gap-1 ml-auto"><MessageCircle className="w-3.5 h-3.5" />{idea.comment_count}</span>}
          {idea.response && <span className="inline-flex items-center gap-1 text-primary font-medium"><Megaphone className="w-3.5 h-3.5" /> Answered</span>}
        </div>
      </div>
    </div>
  );
}

function IdeaSheet({ idea, me, admin, person, onVote, onClose }) {
  const queryClient = useQueryClient();
  const s = statusOf(idea);
  const c = CAT[idea.category] || CAT.other;
  const by = idea.is_anonymous ? 'Anonymous' : nameOf(person(idea.submitter_email), idea.submitter_name);
  const mine = !idea.is_anonymous && lc(idea.submitter_email) === me;
  const ckey = ['idea-comments', idea.id];
  useLive('Comment', ckey);
  const { data: comments = [] } = useQuery({ queryKey: ckey, queryFn: () => base44.entities.Comment.filter({ idea_id: idea.id }, 'created_date', 300) });
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [response, setResponse] = useState(idea.response || '');
  const [notes, setNotes] = useState(idea.admin_notes || '');
  useEffect(() => { setResponse(idea.response || ''); setNotes(idea.admin_notes || ''); }, [idea.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['ideas'] }); queryClient.invalidateQueries({ queryKey: ckey }); };
  const run = async (label, fn) => { setBusy(label); setErr(''); try { await fn(); refresh(); } catch (e) { setErr(e.message); } finally { setBusy(''); } };

  const post = () => run('comment', async () => { await act('idea_comment', { id: idea.id, content: text, parent_id: replyTo?.id }); setText(''); setReplyTo(null); });
  const setStatus = (status) => run('status', () => act('idea_update', { id: idea.id, status }));
  const saveAdmin = () => run('admin', () => act('idea_update', { id: idea.id, response, admin_notes: notes }));
  const removeIdea = () => { if (window.confirm('Delete this idea and its comments?')) run('delete', async () => { await act('idea_delete', { id: idea.id }); onClose(); }); };
  const removeComment = (cm) => { if (window.confirm('Delete this comment?')) run('x', () => act('comment_delete', { id: cm.id })); };

  const top = comments.filter((x) => !x.parent_comment_id);
  const replies = (id) => comments.filter((x) => x.parent_comment_id === id);
  const Comment = ({ cm, child }) => {
    const u = person(cm.author_email);
    return (
      <div className={`flex gap-2.5 ${child ? 'mt-3' : ''}`}>
        <Avatar name={nameOf(u, cm.author_name)} photo={u?.headshot} size={child ? 26 : 32} />
        <div className="min-w-0 flex-1">
          <div className="rounded-2xl bg-muted px-3 py-2">
            <p className="text-sm font-semibold">{lc(cm.author_email) === me ? 'You' : nameOf(u, cm.author_name)}</p>
            <p className="text-sm whitespace-pre-wrap break-words">{cm.content}</p>
          </div>
          <div className="flex items-center gap-3 px-2 mt-1 text-xs text-muted-foreground">
            <span>{ago(cm.created_date)}</span>
            <button onClick={() => setReplyTo(child ? { id: cm.parent_comment_id, name: nameOf(u, cm.author_name) } : { id: cm.id, name: nameOf(u, cm.author_name) })} className="font-medium hover:text-foreground">Reply</button>
            {(admin || lc(cm.author_email) === me) && <button onClick={() => removeComment(cm)} className="hover:text-red-600">Delete</button>}
          </div>
          {!child && replies(cm.id).map((r) => <Comment key={r.id} cm={r} child />)}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex justify-end" onClick={onClose}>
      <div className="h-full w-full sm:max-w-lg bg-background shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="flex items-center gap-2 border-b px-3 py-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted sm:hidden" aria-label="Back"><ArrowLeft className="w-5 h-5" /></button>
          <p className="font-semibold flex-1 truncate">Idea</p>
          {(admin || mine) && <button onClick={removeIdea} disabled={!!busy} className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-muted" aria-label="Delete idea"><Trash2 className="w-[18px] h-[18px]" /></button>}
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted hidden sm:block" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${IDEA_STATUS[s].pill}`}><span className={`w-1.5 h-1.5 rounded-full ${IDEA_STATUS[s].dot}`} />{IDEA_STATUS[s].label}</span>
              <span className="text-muted-foreground">{c.emoji} {c.label}</span>
            </div>
            <h2 className="text-xl font-bold leading-snug break-words">{idea.title}</h2>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              {idea.is_anonymous ? <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center"><Lock className="w-3 h-3" /></div> : <Avatar name={by} photo={person(idea.submitter_email)?.headshot} size={24} />}
              <span>{mine ? 'You' : by} · {ago(idea.created_date)}</span>
            </div>
            {idea.description && <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{idea.description}</p>}
            <div className="flex items-center gap-3">
              <VoteButton idea={idea} me={me} onVote={onVote} big />
              {votesOf(idea).length > 0 && (
                <div className="flex -space-x-2">
                  {votesOf(idea).slice(0, 6).map((e) => { const u = person(e); return <Avatar key={e} name={nameOf(u, e)} photo={u?.headshot} size={26} className="ring-2 ring-background" />; })}
                </div>
              )}
            </div>

            {idea.response && (
              <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-primary uppercase tracking-wide"><Megaphone className="w-3.5 h-3.5" /> Response{idea.response_by ? ` from ${idea.response_by}` : ''}</p>
                <p className="text-sm mt-1.5 whitespace-pre-wrap break-words">{idea.response}</p>
              </div>
            )}

            {admin && (
              <div className="rounded-2xl border p-4 space-y-3 bg-muted/30">
                <p className="text-sm font-semibold">Manage <span className="font-normal text-muted-foreground">(admins)</span></p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(IDEA_STATUS).map(([k, v]) => (
                    <button key={k} onClick={() => setStatus(k)} disabled={!!busy || k === s} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${k === s ? 'bg-foreground text-background border-foreground' : 'hover:bg-muted'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />{v.label}
                    </button>
                  ))}
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Response to the team</p>
                  <textarea value={response} onChange={(e) => setResponse(e.target.value)} rows={3} placeholder="Everyone sees this, and the person who shared it gets an alert." className="w-full rounded-xl border bg-background px-3 py-2 text-base md:text-sm resize-none" />
                </div>
                <div>
                  <p className="text-xs font-medium mb-1">Private notes</p>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Only admins see these." className="w-full rounded-xl border bg-background px-3 py-2 text-base md:text-sm resize-none" />
                </div>
                <button onClick={saveAdmin} disabled={!!busy || (response === (idea.response || '') && notes === (idea.admin_notes || ''))} className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-40 inline-flex items-center gap-2">
                  {busy === 'admin' && <Loader2 className="w-4 h-4 animate-spin" />} Save
                </button>
              </div>
            )}
          </div>

          <div className="border-t p-5">
            <p className="text-sm font-semibold mb-3">Comments{comments.length ? ` · ${comments.length}` : ''}</p>
            {!top.length ? <p className="text-sm text-muted-foreground">No comments yet. Start the conversation.</p>
              : <div className="space-y-4">{top.map((cm) => <Comment key={cm.id} cm={cm} />)}</div>}
          </div>
        </div>

        <div className="border-t p-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          {err && <p className="text-xs text-red-600 mb-2 px-1">{err}</p>}
          {replyTo && <p className="text-xs text-muted-foreground mb-1.5 px-1 flex items-center gap-1"><Reply className="w-3 h-3" /> Replying to {replyTo.name} <button onClick={() => setReplyTo(null)} className="ml-1 text-foreground"><X className="w-3 h-3" /></button></p>}
          <div className="flex items-end gap-2">
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} placeholder="Add a comment"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && text.trim()) { e.preventDefault(); post(); } }}
              className="flex-1 max-h-32 rounded-2xl border bg-background px-3.5 py-2.5 text-base md:text-sm resize-none" />
            <button onClick={post} disabled={!text.trim() || !!busy} className="rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-40">
              {busy === 'comment' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ShareIdea({ onClose, onShared }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const share = async () => {
    setBusy(true); setErr('');
    try {
      const { idea } = await act('idea_create', { title, description, category, is_anonymous: anon });
      await queryClient.invalidateQueries({ queryKey: ['ideas'] });
      onShared(idea.id);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="font-semibold text-lg">Share an idea</p>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg hover:bg-muted" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-4">
          <input value={title} onChange={(e) => setTitle(e.target.value.slice(0, 120))} placeholder="Your idea in one line" className="w-full rounded-xl border bg-background px-3 py-3 text-base font-medium" />
          <textarea value={description} onChange={(e) => setDescription(e.target.value.slice(0, 2000))} rows={5} placeholder="What's the problem, and how would this help? (optional)" className="w-full rounded-xl border bg-background px-3 py-2.5 text-base md:text-sm resize-none" />
          <div>
            <p className="text-sm font-medium mb-2">Topic</p>
            <div className="flex flex-wrap gap-2">{IDEA_CATEGORIES.map((c) => <button key={c.id} onClick={() => setCategory(c.id)} className={chip(category === c.id)}><span>{c.emoji}</span>{c.label}</button>)}</div>
          </div>
          <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 cursor-pointer">
            <span><span className="text-sm font-medium flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Share anonymously</span><span className="block text-xs text-muted-foreground">Your name is hidden from everyone. You'll still get updates.</span></span>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="w-5 h-5 shrink-0 accent-primary" />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="border-t px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button onClick={share} disabled={!title.trim() || busy} className="w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lightbulb className="w-4 h-4" />} Share idea
          </button>
        </div>
      </div>
    </div>
  );
}
