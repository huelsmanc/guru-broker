// Culture → Shout-outs: thank a teammate in front of the team. The person gets an alert; everyone
// can react. A "Most appreciated" board shows who's been recognized most this month.
import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Megaphone, SmilePlus, MoreHorizontal, Trash2, Search, Loader2, X, Lock, Trophy } from 'lucide-react';
import { Avatar, ago, nameOf, lc, useTeam, useLive, act, chip } from '@/components/culture/shared';
import { isAdminRole } from '../../shared/permissions.generated.js';

export const SHOUT_CATEGORIES = [
  { id: 'teamwork', label: 'Teamwork', emoji: '🤝', tint: 'bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300', bar: 'from-sky-400 to-cyan-400' },
  { id: 'client_service', label: 'Client care', emoji: '😊', tint: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300', bar: 'from-emerald-400 to-teal-400' },
  { id: 'sales', label: 'Big win', emoji: '🎯', tint: 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300', bar: 'from-amber-400 to-orange-400' },
  { id: 'leadership', label: 'Leadership', emoji: '⭐', tint: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300', bar: 'from-violet-400 to-fuchsia-400' },
  { id: 'creativity', label: 'Creativity', emoji: '💡', tint: 'bg-pink-50 text-pink-700 dark:bg-pink-950 dark:text-pink-300', bar: 'from-pink-400 to-rose-400' },
  { id: 'persistence', label: 'Hustle', emoji: '💪', tint: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300', bar: 'from-orange-400 to-red-400' },
  { id: 'other', label: 'Thank you', emoji: '👏', tint: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300', bar: 'from-slate-300 to-slate-400' },
];
const CAT = Object.fromEntries(SHOUT_CATEGORIES.map((c) => [c.id, c]));
const REACTIONS = ['❤️', '🎉', '🔥', '👏', '💪', '🚀', '😂', '🙌'];
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); };

export default function Recognition() {
  const { user, brokerageId } = useOutletContext();
  const me = lc(user?.email);
  const { team, person } = useTeam(user);
  const [composing, setComposing] = useState(null); // null | '' | an email to preselect
  const [view, setView] = useState('all');
  const [cat, setCat] = useState('all');
  const key = ['recognitions', brokerageId];
  useLive('Recognition', key);
  const { data: all = [], isLoading } = useQuery({
    queryKey: key, enabled: !!brokerageId,
    queryFn: () => base44.entities.Recognition.filter({ brokerage_id: brokerageId }, '-created_date', 300),
  });

  const list = all.filter((r) => (cat === 'all' || r.category === cat)
    && (view === 'all' || (view === 'mine' ? lc(r.to_email) === me : lc(r.from_email) === me)));
  const board = useMemo(() => {
    const n = new Map();
    for (const r of all) if (Date.parse(r.created_date) >= monthStart()) n.set(lc(r.to_email), (n.get(lc(r.to_email)) || 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [all]);
  const forMe = all.filter((r) => lc(r.to_email) === me).length;
  const fromMe = all.filter((r) => lc(r.from_email) === me).length;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Shout-outs</h1>
          <p className="text-sm text-muted-foreground">Thank a teammate where everyone can see it.</p>
        </div>
        <button onClick={() => setComposing('')} className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold shadow-sm hover:opacity-90">
          <Megaphone className="w-4 h-4" /> Give a shout-out
        </button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-6 items-start">
        <div className="min-w-0 space-y-4">
          <button onClick={() => setComposing('')} className="w-full flex items-center gap-3 rounded-2xl border bg-card p-3 text-left hover:bg-muted/50">
            <Avatar name={nameOf(user)} photo={user?.headshot} size={40} />
            <span className="flex-1 rounded-full bg-muted px-4 py-2.5 text-sm text-muted-foreground">Who made your day better?</span>
          </button>

          {board.length > 0 && <Board board={board} person={person} me={me} onGive={setComposing} className="lg:hidden" />}

          <div className="flex items-center gap-1 rounded-full bg-muted p-1 w-fit max-w-full text-sm">
            {[['all', 'Everyone'], ['mine', `For you${forMe ? ` · ${forMe}` : ''}`], ['given', `From you${fromMe ? ` · ${fromMe}` : ''}`]].map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} className={`rounded-full px-3.5 py-1.5 whitespace-nowrap ${view === k ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none]">
            <button onClick={() => setCat('all')} className={chip(cat === 'all')}>All</button>
            {SHOUT_CATEGORIES.map((c) => <button key={c.id} onClick={() => setCat(c.id)} className={chip(cat === c.id)}><span>{c.emoji}</span>{c.label}</button>)}
          </div>

          {isLoading ? <div className="py-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            : !list.length ? (
              <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
                <p className="text-3xl mb-2">👏</p>
                <p className="font-medium">{all.length ? 'Nothing here yet' : 'No shout-outs yet'}</p>
                <p className="text-sm text-muted-foreground mt-1">{all.length ? 'Try another filter.' : 'Be the first to thank someone on the team.'}</p>
              </div>
            ) : list.map((r) => <ShoutCard key={r.id} r={r} me={me} admin={isAdminRole(user?.role)} person={person} />)}
        </div>

        <aside className="hidden lg:block space-y-4 sticky top-4">
          <Board board={board} person={person} me={me} onGive={setComposing} />
          <div className="rounded-2xl border bg-card p-4 grid grid-cols-2 gap-3 text-center">
            <div><p className="text-2xl font-bold">{forMe}</p><p className="text-xs text-muted-foreground">For you</p></div>
            <div><p className="text-2xl font-bold">{fromMe}</p><p className="text-xs text-muted-foreground">From you</p></div>
          </div>
        </aside>
      </div>

      {composing !== null && <Composer user={user} team={team} preset={composing} onClose={() => setComposing(null)} />}
    </div>
  );
}

function Board({ board, person, me, onGive, className = '' }) {
  return (
    <div className={`rounded-2xl border bg-card p-4 ${className}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold mb-3"><Trophy className="w-4 h-4 text-amber-500" /> Most appreciated this month</p>
      {!board.length ? <p className="text-sm text-muted-foreground">No shout-outs yet this month.</p> : (
        <ol className="flex lg:flex-col gap-3 overflow-x-auto [scrollbar-width:none]">
          {board.map(([email, n], i) => {
            const u = person(email);
            return (
              <li key={email} className="flex lg:flex-row flex-col items-center gap-2 lg:gap-3 shrink-0 w-[72px] lg:w-auto text-center lg:text-left">
                <div className="relative">
                  <Avatar name={nameOf(u, email)} photo={u?.headshot} size={44} />
                  <span className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ring-2 ring-card ${i === 0 ? 'bg-amber-400 text-amber-950' : 'bg-muted text-foreground'}`}>{i + 1}</span>
                </div>
                <div className="min-w-0 w-full lg:flex-1">
                  <p className="text-xs lg:text-sm font-medium truncate">{lc(email) === me ? 'You' : nameOf(u, email).split(' ')[0]}</p>
                  <p className="text-[11px] text-muted-foreground">{n} shout-out{n === 1 ? '' : 's'}</p>
                </div>
                {lc(email) !== me && <button onClick={() => onGive(email)} className="hidden lg:inline text-xs text-primary font-medium hover:underline">Thank</button>}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function ShoutCard({ r, me, admin, person }) {
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [err, setErr] = useState('');
  const c = CAT[r.category] || CAT.other;
  const to = person(r.to_email); const from = r.is_anonymous ? null : person(r.from_email);
  const toName = lc(r.to_email) === me ? 'you' : nameOf(to, r.to_name);
  const fromName = r.is_anonymous ? 'Someone' : lc(r.from_email) === me ? 'You' : nameOf(from, r.from_name);
  const reactions = (r.reactions || []).filter((x) => x.users?.length);
  const canDelete = admin || (!!me && lc(r.from_email) === me);
  const key = ['recognitions', r.brokerage_id];

  const react = async (emoji) => {
    setPicker(false); setErr('');
    // Show it right away; the server keeps everyone's taps.
    queryClient.setQueryData(key, (old) => (old || []).map((x) => {
      if (x.id !== r.id) return x;
      let list = (x.reactions || []).map((y) => ({ ...y, users: [...(y.users || [])] }));
      const hit = list.find((y) => y.emoji === emoji);
      if (hit) hit.users = hit.users.map(lc).includes(me) ? hit.users.filter((e) => lc(e) !== me) : [...hit.users, me];
      else list.push({ emoji, users: [me] });
      return { ...x, reactions: list.filter((y) => y.users.length) };
    }));
    try { await act('shout_react', { id: r.id, emoji }); } catch (e) { setErr(e.message); }
    queryClient.invalidateQueries({ queryKey: key });
  };
  const remove = async () => {
    setMenu(false);
    if (!window.confirm('Delete this shout-out?')) return;
    try { await act('shout_delete', { id: r.id }); queryClient.invalidateQueries({ queryKey: key }); } catch (e) { setErr(e.message); }
  };

  return (
    <article className="relative rounded-2xl border bg-card">
      <div className={`h-1 rounded-t-2xl bg-gradient-to-r ${c.bar}`} />
      <div className="p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="relative shrink-0 w-[60px] h-11">
            {r.is_anonymous
              ? <div className="absolute left-0 top-0 w-[30px] h-[30px] rounded-full bg-muted flex items-center justify-center"><Lock className="w-3.5 h-3.5 text-muted-foreground" /></div>
              : <Avatar name={nameOf(from, r.from_name)} photo={from?.headshot} size={30} className="absolute left-0 top-0" />}
            <Avatar name={nameOf(to, r.to_name)} photo={to?.headshot} size={36} className="absolute right-0 bottom-0 ring-[3px] ring-card" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug"><span className="font-semibold">{fromName}</span> <span className="text-muted-foreground">gave</span> <span className="font-semibold">{toName}</span> <span className="text-muted-foreground">a shout-out</span></p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.tint}`}>{c.emoji} {c.label}</span>
              <span className="text-xs text-muted-foreground">{ago(r.created_date)}</span>
            </div>
          </div>
          {canDelete && (
            <div className="relative">
              <button onClick={() => setMenu(!menu)} className="p-1.5 -m-1 rounded-lg text-muted-foreground hover:bg-muted" aria-label="More"><MoreHorizontal className="w-5 h-5" /></button>
              {menu && <>
                <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
                <div className="absolute right-0 top-8 z-20 w-40 rounded-xl border bg-popover shadow-lg p-1">
                  <button onClick={remove} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950"><Trash2 className="w-4 h-4" /> Delete</button>
                </div>
              </>}
            </div>
          )}
        </div>

        <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-wrap break-words">{r.message}</p>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          {reactions.map((x) => {
            const on = x.users.map(lc).includes(me);
            return (
              <button key={x.emoji} onClick={() => react(x.emoji)} title={x.users.map((e) => (lc(e) === me ? 'You' : nameOf(person(e), e))).join(', ')}
                className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition-colors ${on ? 'border-primary/40 bg-primary/10 text-primary font-medium' : 'hover:bg-muted'}`}>
                <span>{x.emoji}</span><span className="text-xs tabular-nums">{x.users.length}</span>
              </button>
            );
          })}
          <div className="relative">
            <button onClick={() => setPicker(!picker)} className="inline-flex items-center gap-1 rounded-full border border-dashed px-2.5 py-1 text-sm text-muted-foreground hover:bg-muted" aria-label="React">
              <SmilePlus className="w-4 h-4" />{!reactions.length && <span className="text-xs">React</span>}
            </button>
            {picker && <>
              <div className="fixed inset-0 z-10" onClick={() => setPicker(false)} />
              <div className="absolute left-0 bottom-full mb-2 z-20 w-max grid grid-cols-4 sm:flex gap-0.5 rounded-2xl sm:rounded-full border bg-popover shadow-lg p-1">
                {REACTIONS.map((e) => <button key={e} onClick={() => react(e)} className="w-10 h-10 rounded-full text-xl hover:bg-muted hover:scale-110 transition-transform">{e}</button>)}
              </div>
            </>}
          </div>
        </div>
        {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      </div>
    </article>
  );
}

function Composer({ user, team, preset, onClose }) {
  const queryClient = useQueryClient();
  const me = lc(user?.email);
  const people = team.filter((u) => lc(u.email) !== me).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
  const [to, setTo] = useState(preset || '');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('teamwork');
  const [message, setMessage] = useState('');
  const [anon, setAnon] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const picked = people.find((u) => lc(u.email) === lc(to));
  const shown = people.filter((u) => !q || `${nameOf(u)} ${u.email}`.toLowerCase().includes(q.toLowerCase()));

  const send = async () => {
    setBusy(true); setErr('');
    try {
      const { data } = await base44.functions.invoke('giveShoutout', { to_email: picked.email, message, category, is_anonymous: anon });
      if (data?.error) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['recognitions'] });
      onClose();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/40 flex items-end sm:items-center justify-center sm:p-4" onClick={onClose}>
      <div className="w-full sm:max-w-lg max-h-[92vh] bg-background rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <p className="font-semibold text-lg">Give a shout-out</p>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg hover:bg-muted" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">
          <div>
            <p className="text-sm font-medium mb-2">Who?</p>
            {picked ? (
              <div className="flex items-center gap-3 rounded-2xl border bg-muted/40 p-2.5">
                <Avatar name={nameOf(picked)} photo={picked.headshot} size={40} />
                <div className="min-w-0 flex-1"><p className="font-medium truncate">{nameOf(picked)}</p><p className="text-xs text-muted-foreground truncate capitalize">{String(picked.role || '').replace('_', ' ')}</p></div>
                <button onClick={() => setTo('')} className="text-sm text-primary font-medium px-2">Change</button>
              </div>
            ) : (
              <>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the team" className="w-full rounded-xl border bg-background pl-9 pr-3 py-2.5 text-base md:text-sm" />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-5 gap-1 max-h-56 overflow-y-auto">
                  {shown.map((u) => (
                    <button key={u.id} onClick={() => setTo(u.email)} className="flex flex-col items-center gap-1 rounded-xl p-2 hover:bg-muted min-w-0">
                      <Avatar name={nameOf(u)} photo={u.headshot} size={44} />
                      <span className="text-xs leading-tight text-center line-clamp-2 break-words w-full">{nameOf(u)}</span>
                    </button>
                  ))}
                  {!shown.length && <p className="col-span-full text-sm text-muted-foreground py-3">No one matches.</p>}
                </div>
              </>
            )}
          </div>

          <div>
            <p className="text-sm font-medium mb-2">For</p>
            <div className="flex flex-wrap gap-2">
              {SHOUT_CATEGORIES.map((c) => <button key={c.id} onClick={() => setCategory(c.id)} className={chip(category === c.id)}><span>{c.emoji}</span>{c.label}</button>)}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Message</p>
            <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={4} placeholder={picked ? `What did ${nameOf(picked).split(' ')[0]} do?` : 'What did they do?'}
              className="w-full rounded-xl border bg-background px-3 py-2.5 text-base md:text-sm resize-none" />
          </div>

          <label className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 cursor-pointer">
            <span><span className="text-sm font-medium flex items-center gap-1.5"><Lock className="w-3.5 h-3.5" /> Send anonymously</span><span className="block text-xs text-muted-foreground">No one, admins included, will see it was you.</span></span>
            <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} className="w-5 h-5 shrink-0 accent-primary" />
          </label>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="border-t px-5 py-3" style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
          <button onClick={send} disabled={!picked || !message.trim() || busy} className="w-full rounded-full bg-primary text-primary-foreground py-3 font-semibold disabled:opacity-40 inline-flex items-center justify-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />} Send shout-out
          </button>
        </div>
      </div>
    </div>
  );
}
