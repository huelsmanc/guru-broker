// Shared bits for the Culture tabs (Shout-outs and Idea hub).
import React, { useEffect } from 'react';
import { Avatar as BaseAvatar } from '@/components/stories/storyLook';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
/** A round photo or initials, on a solid backing so stacked avatars don't show through each other. */
export function Avatar({ className = '', size = 32, ...rest }) {
  return <span className={`inline-block shrink-0 rounded-full bg-background ${className}`} style={{ width: size, height: size }}><BaseAvatar size={size} {...rest} /></span>;
}

export const lc = (e) => String(e || '').toLowerCase().trim();

/** A person's real name (never their email). */
export const nameOf = (u, fallback = '') => [u?.display_name, u?.full_name].map((v) => String(v || '').trim()).find((v) => v && !v.includes('@'))
  || (fallback && !String(fallback).includes('@') ? fallback : '') || String(u?.email || fallback || 'Someone').split('@')[0];

export function ago(d) {
  const t = Date.parse(d); if (!t) return '';
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(new Date(t).getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}) });
}

/** Everyone on the team, by email. */
export function useTeam(user) {
  const { data = [] } = useQuery({
    queryKey: ['culture-team', user?.brokerage_id],
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => ((await base44.functions.invoke('getBrokerageUsers', {})).data?.users || []).filter((u) => !u.suspended && u.role !== 'super_admin'),
  });
  const byEmail = new Map(data.map((u) => [lc(u.email), u]));
  return { team: data, person: (email) => byEmail.get(lc(email)) };
}

/** Refresh a list when its rows change for anyone. */
export function useLive(entity, key) {
  const queryClient = useQueryClient();
  useEffect(() => base44.entities[entity].subscribe(() => queryClient.invalidateQueries({ queryKey: key })), [entity, JSON.stringify(key)]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** Call the culture actions; throws the server's message. */
export async function act(action, args) {
  const { data } = await base44.functions.invoke('culture', { action, ...args });
  if (data?.error) throw new Error(data.error);
  return data;
}

/** Pill/chip classes used on both tabs. */
export const chip = (on) => `shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${on ? 'bg-foreground text-background border-foreground' : 'bg-card hover:bg-muted text-foreground'}`;
