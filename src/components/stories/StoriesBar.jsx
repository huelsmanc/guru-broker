// The row of story circles at the top of the Dashboard. First the brokerage (pinned announcements
// and celebrations), then "Your story", then everyone else, unwatched first.
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Plus } from 'lucide-react';
import { isAdminRole } from '../../../shared/permissions.generated.js';
import { useBranding } from '@/lib/branding';
import { Avatar } from './storyLook';
import StoryViewer from './StoryViewer';
import StoryComposer from './StoryComposer';

const lc = (e) => String(e || '').toLowerCase();

export default function StoriesBar({ user }) {
  const queryClient = useQueryClient();
  const brand = useBranding(user?.brokerage_id);
  const admin = isAdminRole(user?.role) || user?.role === 'super_admin';
  const me = lc(user?.email);
  const [open, setOpen] = useState(null);
  const [composing, setComposing] = useState(false);

  const { data: stories = [] } = useQuery({
    queryKey: ['stories', user?.brokerage_id],
    enabled: !!user?.brokerage_id,
    refetchInterval: 60_000,
    queryFn: () => base44.entities.Story.filter({ brokerage_id: user.brokerage_id }, '-created_date', 300),
  });
  const { data: seenList = [] } = useQuery({
    queryKey: ['story-seen', me],
    enabled: !!me,
    queryFn: () => base44.entities.StoryView.filter({ viewer_email: me }, '-created_date', 1000),
  });
  const [seenNow, setSeenNow] = useState(() => new Set());
  const seen = useMemo(() => new Set([...seenList.map((v) => v.story_id), ...seenNow]), [seenList, seenNow]);

  const groups = useMemo(() => {
    const live = stories.filter((s) => Date.parse(s.expires_at) > Date.now());
    const asc = (a, b) => String(a.created_date).localeCompare(String(b.created_date));
    const out = [];
    const house = live.filter((s) => s.pinned || s.kind === 'auto').sort((a, b) => (b.pinned - a.pinned) || asc(a, b));
    if (house.length) out.push({ key: 'brokerage', name: brand?.name || 'Brokerage', photo: brand?.logo_url || '', stories: house });
    const byAuthor = new Map();
    for (const s of live) {
      if (s.pinned || s.kind === 'auto') continue;
      const k = lc(s.author_email);
      if (!byAuthor.has(k)) byAuthor.set(k, { key: k, name: s.author_name || k, photo: s.author_photo || '', stories: [] });
      byAuthor.get(k).stories.push(s);
    }
    const mine = byAuthor.get(me);
    if (mine) { mine.name = 'Your story'; mine.photo = user?.headshot || mine.photo; mine.stories.sort(asc); out.push(mine); byAuthor.delete(me); }
    const others = [...byAuthor.values()].map((g) => ({ ...g, stories: g.stories.sort(asc) }));
    const unseen = (g) => g.stories.some((s) => !seen.has(s.id));
    const latest = (g) => g.stories[g.stories.length - 1].created_date;
    others.sort((a, b) => (unseen(b) - unseen(a)) || String(latest(b)).localeCompare(String(latest(a))));
    return [...out, ...others].map((g) => ({ ...g, seen, unseen: unseen(g) }));
  }, [stories, seen, brand, me, user?.headshot]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['stories'] });
  if (!user?.brokerage_id) return null;
  const hasMine = groups.some((g) => g.key === me);

  const Circle = ({ g, i }) => (
    <button onClick={() => setOpen({ groups, i })} className="flex flex-col items-center gap-1 w-[72px] shrink-0">
      <span className={`rounded-full p-[2.5px] ${g.unseen ? 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600' : 'bg-muted-foreground/25'}`}>
        <span className="block rounded-full bg-background p-[2px]"><Avatar name={g.name} photo={g.photo} size={58} /></span>
      </span>
      <span className={`text-[11px] max-w-full truncate ${g.unseen ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>{g.key === 'brokerage' ? 'Team' : g.key === me ? 'Your story' : String(g.name).split(' ')[0]}</span>
    </button>
  );

  return (
    <>
      <div className="-mx-1 mb-6 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!hasMine && (
          <button onClick={() => setComposing(true)} className="flex flex-col items-center gap-1 w-[72px] shrink-0">
            <span className="relative block rounded-full p-[4.5px]">
              <Avatar name={user?.display_name || user?.full_name} photo={user?.headshot} size={58} />
              <span className="absolute bottom-0.5 right-0.5 w-6 h-6 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></span>
            </span>
            <span className="text-[11px] text-muted-foreground">Add story</span>
          </button>
        )}
        {groups.map((g, i) => (
          <div key={g.key} className="relative shrink-0">
            <Circle g={g} i={i} />
            {g.key === me && (
              <button onClick={() => setComposing(true)} aria-label="Add to your story"
                className="absolute top-[46px] right-[4px] w-6 h-6 rounded-full bg-primary text-primary-foreground border-2 border-background flex items-center justify-center"><Plus className="w-3.5 h-3.5" /></button>
            )}
          </div>
        ))}
      </div>
      {open && (
        // The order is fixed while watching, so it doesn't reshuffle as stories get seen.
        <StoryViewer groups={open.groups} startGroup={open.i} me={user} admin={admin}
          onClose={() => { setOpen(null); queryClient.invalidateQueries({ queryKey: ['story-seen'] }); }}
          onSeen={(id) => setSeenNow((s) => new Set(s).add(id))}
          onRemoved={refresh} />
      )}
      {composing && <StoryComposer admin={admin} onClose={() => setComposing(false)} onPosted={refresh} />}
    </>
  );
}
