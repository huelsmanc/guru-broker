// Platform owner's view of every user: role, brokerage, last sign-in, and anything that looks
// wrong (a role set by the old "Broker / Admin" menu, no brokerage, a brokerage with no broker...).
import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, AlertTriangle, Loader2, Trash2, Crown, Check } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ROLES, normalizeRole } from '../../../shared/permissions.generated.js';
import RoleOptions, { SUPER, roleLabel, roleValue, ROLE_HELP } from '@/components/users/RoleOptions';

const LEADS = ['owner', 'broker'];
const nameOf = (u) => u.display_name || u.full_name || u.email;

function ago(iso) {
  if (!iso) return null;
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return 'within the hour';
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** What might be wrong with each user and brokerage. */
export function findIssues(users, brokerages) {
  const ownerOf = new Map(brokerages.filter((b) => b.account_owner_id).map((b) => [b.account_owner_id, b]));
  const issues = new Map();
  const add = (id, kind, text) => { if (!issues.has(id)) issues.set(id, []); issues.get(id).push({ kind, text }); };
  for (const u of users) {
    if (u.role === 'admin') add(u.id, 'check', 'Set by the old "Broker / Admin" menu, so this is Office administrator. Should it be Broker or Owner?');
    if (u.role && u.role !== SUPER && !ROLES[normalizeRole(u.role)]) add(u.id, 'bad', `Unknown role "${u.role}": treated as Agent.`);
    if (u.role !== SUPER && !u.brokerage_id) add(u.id, 'bad', 'Not in any brokerage, so most of the app is empty for them.');
    const owned = ownerOf.get(u.id);
    if (owned && u.role !== SUPER && !LEADS.includes(normalizeRole(u.role))) add(u.id, 'check', `Account owner of ${owned.name}, but their role is ${roleLabel(u.role)}.`);
  }
  const leaderless = brokerages.filter((b) => b.status !== 'suspended' && !users.some((u) => u.brokerage_id === b.id && !u.suspended && (LEADS.includes(normalizeRole(u.role)) || u.role === SUPER)));
  return { issues, leaderless };
}

export default function PlatformUsers() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['platform-users'],
    queryFn: async () => { const r = await base44.functions.invoke('platformUsers', { action: 'list' }); if (r.data?.error) throw new Error(r.data.error); return r.data; },
  });
  const [q, setQ] = useState('');
  const [brokerage, setBrokerage] = useState('');
  const [role, setRole] = useState('');
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [limit, setLimit] = useState(150);
  const [saving, setSaving] = useState({});
  const [saved, setSaved] = useState({});
  const users = data?.users || [];
  const brokerages = data?.brokerages || [];
  const bName = useMemo(() => new Map(brokerages.map((b) => [b.id, b.name])), [brokerages]);
  const owners = useMemo(() => new Set(brokerages.map((b) => b.account_owner_id).filter(Boolean)), [brokerages]);
  const { issues, leaderless } = useMemo(() => findIssues(users, brokerages), [users, brokerages]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return users.filter((u) => (!term || `${nameOf(u)} ${u.email}`.toLowerCase().includes(term))
      && (!brokerage || (brokerage === '_none' ? !u.brokerage_id : u.brokerage_id === brokerage))
      && (!role || roleValue(u.role) === role)
      && (!onlyIssues || issues.has(u.id)));
  }, [users, q, brokerage, role, onlyIssues, issues]);

  const patch = async (u, change, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setSaving((s) => ({ ...s, [u.id]: true })); setSaved((s) => ({ ...s, [u.id]: false }));
    try {
      await base44.entities.User.update(u.id, change);
      qc.setQueryData(['platform-users'], (d) => (d ? { ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, ...change } : x)) } : d));
      setSaved((s) => ({ ...s, [u.id]: true }));
      qc.invalidateQueries({ queryKey: ['all-users'] });
    } catch (e) { window.alert(e.message || 'Could not save'); refetch(); } finally { setSaving((s) => ({ ...s, [u.id]: false })); }
  };
  const changeRole = (u, next) => {
    if (next === roleValue(u.role)) return;
    let warn = null;
    if (next === SUPER) warn = `Make ${nameOf(u)} a platform owner (super admin)?\n\nThey'll be able to see and change every brokerage, every user, and the print and payment settings.`;
    else if (u.role === SUPER && u.id === data?.me) warn = 'Remove your own platform owner role? You will lose access to this page.';
    else if (u.role === SUPER) warn = `Remove platform owner access from ${nameOf(u)}?`;
    patch(u, { role: next }, warn);
  };
  const remove = async (u) => {
    if (u.id === data?.me) { window.alert("You can't delete your own account here."); return; }
    if (!window.confirm(`Delete ${nameOf(u)} (${u.email})?\n\nTheir login is removed for good. Deals and documents they worked on stay. To keep them out but keep the account, use Suspend instead.`)) return;
    try { await base44.entities.User.delete(u.id); refetch(); } catch (e) { window.alert(e.message || 'Could not delete'); }
  };

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />;
  if (error) return <p className="text-sm text-red-600">{error.message}</p>;
  const neverIn = users.filter((u) => !u.last_sign_in_at).length;
  const sel = 'rounded-lg border border-input bg-background px-2.5 py-2 text-sm';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[['Users', users.length, null], ['Need a look', issues.size, issues.size ? 'text-amber-600' : null], ["Haven't signed in", neverIn, null], ['Suspended', users.filter((u) => u.suspended).length, null]].map(([l, n, c]) => (
          <button key={l} onClick={() => l === 'Need a look' && setOnlyIssues((v) => !v)} className={cn('text-left bg-card rounded-2xl border p-4', l === 'Need a look' && 'hover:border-amber-400', l === 'Need a look' && onlyIssues && 'border-amber-400')}>
            <p className="text-xs text-muted-foreground">{l}</p><p className={cn('text-2xl font-bold mt-0.5', c)}>{n}</p>
          </button>
        ))}
      </div>

      {leaderless.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 text-amber-900 text-sm px-4 py-3">
          <p className="font-medium flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {leaderless.length === 1 ? 'A brokerage has' : `${leaderless.length} brokerages have`} no Owner or Broker</p>
          <p className="text-xs mt-1">Nobody there can approve deals, run payouts or manage people: {leaderless.map((b) => b.name).join(', ')}.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email" className="pl-9" />
        </div>
        <select value={brokerage} onChange={(e) => setBrokerage(e.target.value)} className={sel}>
          <option value="">All brokerages</option><option value="_none">No brokerage</option>
          {brokerages.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select value={role} onChange={(e) => setRole(e.target.value)} className={sel}><option value="">All roles</option><RoleOptions allowSuper /></select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Needs a look</label>
      </div>

      <div className="rounded-2xl border bg-card divide-y">
        {shown.slice(0, limit).map((u) => {
          const list = issues.get(u.id) || [];
          return (
            <div key={u.id} className={cn('p-3 sm:p-4 flex flex-col md:flex-row md:items-center gap-3', u.suspended && 'opacity-60')}>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm flex items-center gap-1.5 flex-wrap">{nameOf(u)}
                  {owners.has(u.id) && <span className="inline-flex items-center gap-1 text-[10px] rounded-full bg-primary/10 text-primary px-1.5 py-0.5"><Crown className="w-3 h-3" /> Account owner</span>}
                  {u.suspended && <span className="text-[10px] rounded-full bg-slate-200 text-slate-700 px-1.5 py-0.5">Suspended</span>}
                  {u.id === data?.me && <span className="text-[10px] rounded-full bg-slate-100 text-slate-600 px-1.5 py-0.5">You</span>}
                </p>
                <p className="text-xs text-muted-foreground break-words">{u.email} · {u.brokerage_id ? bName.get(u.brokerage_id) || 'Unknown brokerage' : 'No brokerage'} · {u.last_sign_in_at ? `Last in ${ago(u.last_sign_in_at)}` : u.invited_at ? `Invited ${ago(u.invited_at)}, hasn't signed in` : "Hasn't signed in"}</p>
                {list.map((x, i) => <p key={i} className={cn('text-xs mt-1 flex items-start gap-1', x.kind === 'bad' ? 'text-red-600' : 'text-amber-700')}><AlertTriangle className="w-3.5 h-3.5 mt-px flex-shrink-0" />{x.text}</p>)}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <select value={roleValue(u.role)} onChange={(e) => changeRole(u, e.target.value)} disabled={saving[u.id]} title={ROLE_HELP[roleValue(u.role)]} className={cn(sel, 'py-1.5 text-xs w-48')}><RoleOptions allowSuper /></select>
                <span className="w-4">{saving[u.id] ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : saved[u.id] ? <Check className="w-4 h-4 text-emerald-600" /> : null}</span>
                {u.id !== data?.me && <Button size="sm" variant="ghost" className="text-xs" onClick={() => patch(u, { suspended: !u.suspended }, u.suspended ? null : `Suspend ${nameOf(u)}? They won't be able to use the app until reactivated.`)}>{u.suspended ? 'Reactivate' : 'Suspend'}</Button>}
                {u.id !== data?.me && <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => remove(u)} aria-label={`Delete ${nameOf(u)}`}><Trash2 className="w-4 h-4" /></Button>}
              </div>
            </div>
          );
        })}
        {!shown.length && <p className="p-6 text-sm text-muted-foreground text-center">{onlyIssues ? 'Nothing needs a look.' : 'No users match.'}</p>}
      </div>
      {shown.length > limit && <Button variant="outline" onClick={() => setLimit((n) => n + 150)}>Show more ({shown.length - limit} left)</Button>}
      <p className="text-xs text-muted-foreground">Role changes save right away and apply the next time the person loads a page. Hover a role to see what it can do.</p>
    </div>
  );
}
