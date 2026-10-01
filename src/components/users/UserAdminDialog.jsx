import React, { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2, Save, Plus, Trash2, Landmark, RotateCcw } from 'lucide-react';
import { ROLES, PERMS, normalizeRole } from '../../../shared/permissions.generated.js';
import WorkspaceChecklists from '@/components/workspace/WorkspaceChecklists';

const TABS = [['profile', 'Profile'], ['licenses', 'Licenses'], ['commission', 'Commission & team'], ['permissions', 'Role & permissions'], ['payouts', 'Direct deposit'], ['onboarding', 'Onboarding']];
const US = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');

// Brokermint-style user editor for admins.
export default function UserAdminDialog({ person, me, onClose }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState('profile');
  const [f, setF] = useState(() => ({ ...person, licenses: person.licenses?.length ? person.licenses : [{ state: person.license_state || '', number: person.license_number || '', expiration: person.license_expiration || '' }], permissions: person.permissions || {} }));
  const [saving, setSaving] = useState(false);
  const [people, setPeople] = useState([]);
  const [plans, setPlans] = useState([]);
  const [teams, setTeams] = useState([]);
  const [bank, setBank] = useState(null);
  const [newTeam, setNewTeam] = useState('');

  useEffect(() => {
    const b = person.brokerage_id;
    base44.entities.User.filter({ brokerage_id: b }, 'full_name', 2000).then(setPeople).catch(() => {});
    base44.entities.CommissionPlan.filter({ brokerage_id: b }, 'name', 200).then(setPlans).catch(() => {});
    base44.entities.Team.filter({ brokerage_id: b }, 'name', 200).then(setTeams).catch(() => {});
  }, [person.brokerage_id]);
  useEffect(() => { if (tab === 'payouts') base44.functions.invoke('bankLink', { action: 'status', email: person.email }).then((r) => setBank(r.data)).catch((e) => setBank({ error: e.message })); }, [tab, person.email]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const role = normalizeRole(f.role);
  const others = people.filter((p) => p.email !== person.email);
  const groups = useMemo(() => {
    const g = new Map();
    for (const [k, v] of Object.entries(PERMS)) { if (!g.has(v.group)) g.set(v.group, []); g.get(v.group).push([k, v]); }
    return [...g];
  }, []);
  const effective = (k) => (Object.prototype.hasOwnProperty.call(f.permissions, k) ? !!f.permissions[k] : PERMS[k].roles.includes(role));

  const save = async () => {
    setSaving(true);
    try {
      const lic = f.licenses.filter((l) => l.state || l.number || l.expiration).map((l) => ({ ...l, expiration: l.expiration || null }));
      const first = lic[0] || {};
      const name = [f.first_name, f.last_name].filter(Boolean).join(' ') || f.full_name;
      const patch = {
        first_name: f.first_name || null, last_name: f.last_name || null, full_name: name, display_name: f.display_name || name,
        phone: f.phone || null, personal_company: f.personal_company || null, birthday: f.birthday || null, start_date: f.start_date || null,
        address: f.address || null, city: f.city || null, state: f.state || null, zip: f.zip || null, alternate_name: f.alternate_name || null,
        licenses: lic, license_state: first.state || null, license_number: first.number || null, license_expiration: first.expiration || null,
        eo_expiration: f.eo_expiration || null, mls_ids: String(f.mls_ids_text ?? (f.mls_ids || []).join(', ')).split(',').map((x) => x.trim()).filter(Boolean),
        commission_plan_id: f.commission_plan_id || null, annual_cap: f.annual_cap === '' || f.annual_cap == null ? null : Number(f.annual_cap),
        cap_start_date: f.cap_start_date || null, team_id: f.team_id || null, tc_email: f.tc_email || null, sponsor_email: f.sponsor_email || null,
        role: f.role, permissions: f.permissions,
      };
      if (patch.role === 'super_admin' && me.role !== 'super_admin') delete patch.role;
      await base44.entities.User.update(person.id, patch);
      queryClient.invalidateQueries();
      onClose();
    } catch (err) { window.alert(err.message); } finally { setSaving(false); }
  };

  const addTeam = async () => {
    const t = await base44.entities.Team.create({ brokerage_id: person.brokerage_id, name: newTeam.trim() });
    setTeams((x) => [...x, t]); setF((x) => ({ ...x, team_id: t.id })); setNewTeam('');
  };

  const Field = ({ k, label, type = 'text', span }) => (
    <div className={span}><Label>{label}</Label><Input className="mt-1" type={type} value={f[k] ?? ''} onChange={set(k)} /></div>
  );
  const Select = ({ k, label, options, empty = 'None' }) => (
    <div><Label>{label}</Label>
      <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f[k] || ''} onChange={set(k)}>
        <option value="">{empty}</option>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select></div>
  );
  const personOptions = others.map((p) => [p.email, p.display_name || p.full_name || p.email]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[96vw] max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{person.full_name || person.email}</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-1 border-b pb-2">
          {TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-md text-sm ${tab === k ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{l}</button>)}
        </div>

        {tab === 'profile' && (
          <div className="grid sm:grid-cols-3 gap-3">
            <Field k="first_name" label="First name" /><Field k="last_name" label="Last name" /><Field k="display_name" label="Display name" />
            <Field k="phone" label="Phone" /><Field k="personal_company" label="Personal company" /><Field k="alternate_name" label="Alternate name" />
            <Field k="birthday" label="Birthday" type="date" /><Field k="start_date" label="Anniversary (start) date" type="date" /><div />
            <Field k="address" label="Address" span="sm:col-span-3" />
            <Field k="city" label="City" /><Field k="state" label="State" /><Field k="zip" label="Zip" />
          </div>
        )}

        {tab === 'licenses' && (
          <div className="space-y-3">
            {f.licenses.map((l, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-3"><Label>State {i ? `(${i + 1})` : ''}</Label>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-2 py-2 text-sm" value={l.state || ''} onChange={(e) => setF((x) => ({ ...x, licenses: x.licenses.map((y, j) => (j === i ? { ...y, state: e.target.value } : y)) }))}>
                    <option value="">Not selected</option>{US.map((s) => <option key={s}>{s}</option>)}
                  </select></div>
                <div className="col-span-4"><Label>License #</Label><Input className="mt-1" value={l.number || ''} onChange={(e) => setF((x) => ({ ...x, licenses: x.licenses.map((y, j) => (j === i ? { ...y, number: e.target.value } : y)) }))} /></div>
                <div className="col-span-4"><Label>Expiration</Label><Input className="mt-1" type="date" value={l.expiration || ''} onChange={(e) => setF((x) => ({ ...x, licenses: x.licenses.map((y, j) => (j === i ? { ...y, expiration: e.target.value } : y)) }))} /></div>
                <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setF((x) => ({ ...x, licenses: x.licenses.filter((_, j) => j !== i) }))}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            {f.licenses.length < 4 && <Button variant="outline" size="sm" className="gap-1" onClick={() => setF((x) => ({ ...x, licenses: [...x.licenses, { state: '', number: '', expiration: '' }] }))}><Plus className="w-4 h-4" /> Add a state</Button>}
            <div className="grid sm:grid-cols-2 gap-3 pt-3 border-t">
              <Field k="eo_expiration" label="E&O insurance expiration" type="date" />
              <div><Label>MLS IDs (comma separated)</Label><Input className="mt-1" value={f.mls_ids_text ?? (f.mls_ids || []).join(', ')} onChange={set('mls_ids_text')} /></div>
            </div>
            <p className="text-xs text-muted-foreground">Alerts go to the agent and admins 60, 30 and 7 days before each expiration.</p>
          </div>
        )}

        {tab === 'commission' && (
          <div className="grid sm:grid-cols-2 gap-3">
            <Select k="commission_plan_id" label="Commission plan" options={plans.map((p) => [p.id, `${p.name}${p.is_default ? ' (default)' : ''}`])} empty="Brokerage default plan" />
            <div><Label>Annual cap override ($)</Label><Input className="mt-1" inputMode="decimal" placeholder="Use the plan's cap" value={f.annual_cap ?? ''} onChange={set('annual_cap')} /></div>
            <div><Label>Cap year starts (anniversary)</Label><Input className="mt-1" type="date" value={f.cap_start_date || ''} onChange={set('cap_start_date')} /><p className="text-xs text-muted-foreground mt-1">Blank = their start date.</p></div>
            <div><Label>Team</Label>
              <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={f.team_id || ''} onChange={set('team_id')}>
                <option value="">No team</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}{t.leader_email ? ` (lead: ${t.leader_email})` : ''}</option>)}
              </select>
              <div className="flex gap-1 mt-1"><Input className="h-8" placeholder="New team name" value={newTeam} onChange={(e) => setNewTeam(e.target.value)} /><Button size="sm" variant="outline" disabled={!newTeam.trim()} onClick={addTeam}>Create</Button></div>
            </div>
            <Select k="tc_email" label="Their transaction coordinator" options={personOptions} empty="N/A (use rotation)" />
            <Select k="sponsor_email" label="Recruited by (downline sponsor)" options={personOptions} empty="Nobody" />
            {f.team_id && (() => { const t = teams.find((x) => x.id === f.team_id); return t ? (
              <div className="sm:col-span-2 rounded-lg border p-3 grid sm:grid-cols-2 gap-3">
                <p className="sm:col-span-2 text-sm font-medium">Team: {t.name}</p>
                <div><Label>Team leader</Label>
                  <select className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={t.leader_email || ''} onChange={async (e) => { const u = await base44.entities.Team.update(t.id, { leader_email: e.target.value || null }); setTeams((x) => x.map((y) => (y.id === t.id ? u : y))); }}>
                    <option value="">None</option>{people.map((p) => <option key={p.id} value={p.email}>{p.display_name || p.full_name}</option>)}
                  </select></div>
                <div><Label>Team leader share (%)</Label><Input className="mt-1" inputMode="decimal" defaultValue={t.lead_pct ?? ''} onBlur={async (e) => { const u = await base44.entities.Team.update(t.id, { lead_pct: e.target.value === '' ? null : Number(e.target.value) }); setTeams((x) => x.map((y) => (y.id === t.id ? u : y))); }} /></div>
              </div>) : null; })()}
          </div>
        )}

        {tab === 'permissions' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div><Label>Role</Label>
                <select className="mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value }))}>
                  {Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select></div>
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setF((x) => ({ ...x, permissions: {} }))}><RotateCcw className="w-4 h-4" /> Reset to role defaults</Button>
            </div>
            <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
              {groups.map(([g, items]) => (
                <div key={g}>
                  <p className="text-xs font-semibold uppercase text-muted-foreground mb-1">{g}</p>
                  {items.map(([k, v]) => {
                    const custom = Object.prototype.hasOwnProperty.call(f.permissions, k);
                    return (
                      <label key={k} className="flex items-center gap-2 py-0.5 text-sm">
                        <input type="checkbox" checked={effective(k)} onChange={(e) => setF((x) => ({ ...x, permissions: { ...x.permissions, [k]: e.target.checked } }))} />
                        <span>{v.label}</span>{custom && <span className="text-[10px] text-amber-700">custom</span>}
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'payouts' && (
          <div className="space-y-3 text-sm">
            {!bank ? <Loader2 className="w-5 h-5 animate-spin" /> : bank.error ? <p className="text-red-600">{bank.error}</p> : (
              <p>Bank account: <strong>{bank.linked ? `linked ${bank.linked_at ? new Date(bank.linked_at).toLocaleDateString() : ''}` : (bank.status || 'not linked').replace(/_/g, ' ')}</strong></p>
            )}
            <Button className="gap-1.5" onClick={async () => { try { const r = await base44.functions.invoke('bankLink', { action: 'invite', email: person.email }); setBank({ status: r.data.status }); window.alert('Payload emailed them a secure link to connect their bank.'); } catch (e) { window.alert(e.message); } }}>
              <Landmark className="w-4 h-4" /> {bank?.linked ? 'Send a new bank link' : 'Email bank link'}
            </Button>
            <p className="text-xs text-muted-foreground">Payload verifies the account; bank numbers are never stored in this app.</p>
          </div>
        )}

        {tab === 'onboarding' && <WorkspaceChecklists tx={null} user={me} subjectType="onboarding" subjectEmail={person.email} subjectUserId={person.id} title="Onboarding" />}

        {tab !== 'onboarding' && tab !== 'payouts' && (
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
