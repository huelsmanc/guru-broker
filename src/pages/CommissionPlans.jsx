import React, { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Plus, Trash2, Copy, Star, Save } from 'lucide-react';
import { calculateDeal } from '../../shared/commission.js';
import { isAdminRole } from '../../shared/permissions.generated.js';
import { Section, Row, Empty, money } from '@/components/workspace/ui';

const numify = (v) => (Array.isArray(v) ? v.map(numify) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ['name', 'id', 'type', 'when', 'basis'].includes(k) ? x : numify(x)])) : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v);
const uid = () => Math.random().toString(36).slice(2, 9);
const PRESETS = {
  cap: { label: 'Split with annual cap', config: { split: { agent_pct: 80 }, cap: { amount: 18000, after_cap_agent_pct: 100 }, fees: [{ id: uid(), name: 'Transaction fee', type: 'flat', amount: 395, when: 'always' }] } },
  sliding: { label: 'Sliding scale', config: { tiers: { basis: 'gci', levels: [{ from: 0, agent_pct: 60 }, { from: 50000, agent_pct: 70 }, { from: 100000, agent_pct: 80 }, { from: 200000, agent_pct: 90 }] } } },
  flat: { label: 'Flat fee per deal', config: { split: { agent_pct: 100 }, fees: [{ id: uid(), name: 'Flat fee', type: 'flat', amount: 499, when: 'always', counts_toward_cap: true }] } },
  team: { label: 'Team split', config: { split: { agent_pct: 70 }, cap: { amount: 16000, after_cap_agent_pct: 100 }, team: { lead_pct: 30, basis: 'after_split' } } },
  blank: { label: 'Start from scratch', config: { split: { agent_pct: 70 } } },
};
const sel = 'mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

export default function CommissionPlans() {
  const { user, brokerageId } = useOutletContext();
  const queryClient = useQueryClient();
  const key = ['plans', brokerageId];
  const { data: plans = [], isLoading } = useQuery({ queryKey: key, queryFn: () => base44.entities.CommissionPlan.filter({ brokerage_id: brokerageId }, 'name', 200), enabled: !!brokerageId });
  const { data: people = [] } = useQuery({ queryKey: ['brokerage-users', brokerageId], queryFn: () => base44.entities.User.filter({ brokerage_id: brokerageId }, 'full_name', 2000), enabled: !!brokerageId });
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);

  if (!isAdminRole(user?.role)) return <div className="p-8 text-sm">Admins only.</div>;
  const usage = (id) => people.filter((p) => p.commission_plan_id === id).length;

  const save = async () => {
    setSaving(true);
    try {
      const data = { brokerage_id: brokerageId, name: edit.name, description: edit.description || '', config: numify(edit.config), is_default: !!edit.is_default, active: edit.active !== false };
      if (data.is_default) for (const p of plans) if (p.is_default && p.id !== edit.id) await base44.entities.CommissionPlan.update(p.id, { is_default: false });
      const saved = edit.id ? await base44.entities.CommissionPlan.update(edit.id, data) : await base44.entities.CommissionPlan.create(data);
      setEdit({ ...edit, ...saved });
      queryClient.invalidateQueries({ queryKey: key });
    } catch (err) { window.alert(err.message); } finally { setSaving(false); }
  };
  const remove = async (p) => {
    if (usage(p.id)) return window.alert(`${usage(p.id)} agent(s) are on this plan. Move them first.`);
    if (!window.confirm(`Delete "${p.name}"? Past deals keep their numbers.`)) return;
    await base44.entities.CommissionPlan.delete(p.id);
    setEdit(null);
    queryClient.invalidateQueries({ queryKey: key });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto grid lg:grid-cols-[280px_1fr] gap-6">
      <aside>
        <h1 className="text-2xl font-bold mb-4">Commission plans</h1>
        {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
          <ul className="space-y-1 mb-4">
            {plans.map((p) => (
              <li key={p.id}><button onClick={() => setEdit(structuredClone(p))} className={`w-full text-left rounded-lg px-3 py-2 text-sm border ${edit?.id === p.id ? 'bg-primary/10 border-primary' : 'bg-card hover:bg-muted'}`}>
                <span className="font-medium flex items-center gap-1.5">{p.is_default && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />}{p.name}</span>
                <span className="text-xs text-muted-foreground">{usage(p.id)} agent{usage(p.id) === 1 ? '' : 's'}{p.active === false ? ' · inactive' : ''}</span>
              </button></li>
            ))}
          </ul>
        )}
        <p className="text-xs font-medium text-muted-foreground mb-2">New plan from a starting point</p>
        <div className="space-y-1">{Object.entries(PRESETS).map(([k, v]) => (
          <button key={k} className="w-full text-left text-sm rounded-lg px-3 py-2 hover:bg-muted flex items-center gap-2" onClick={() => setEdit({ name: v.label, config: structuredClone(v.config), active: true })}><Plus className="w-4 h-4" />{v.label}</button>
        ))}</div>
      </aside>

      <main>
        {!edit ? <Empty>Pick a plan to edit, or start a new one. Assign plans to agents under Manage Users.</Empty> : (
          <PlanEditor plan={edit} setPlan={setEdit} onSave={save} saving={saving} onDelete={() => remove(edit)} onCopy={() => setEdit({ ...structuredClone(edit), id: undefined, name: `${edit.name} (copy)`, is_default: false })} />
        )}
      </main>
    </div>
  );
}

function PlanEditor({ plan, setPlan, onSave, saving, onDelete, onCopy }) {
  const c = plan.config || {};
  const setC = (fn) => setPlan((p) => ({ ...p, config: fn(structuredClone(p.config || {})) }));
  const block = (k, v) => setC((x) => { if (v === undefined) delete x[k]; else x[k] = v; return x; });

  return (
    <div className="grid xl:grid-cols-[1fr_340px] gap-6">
      <div>
        <div className="flex flex-wrap items-end gap-3 mb-6">
          <div className="flex-1 min-w-[220px]"><Label>Plan name</Label><Input className="mt-1" value={plan.name || ''} onChange={(e) => setPlan({ ...plan, name: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={!!plan.is_default} onChange={(e) => setPlan({ ...plan, is_default: e.target.checked })} /> Default for agents with no plan</label>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" checked={plan.active !== false} onChange={(e) => setPlan({ ...plan, active: e.target.checked })} /> Active</label>
        </div>

        <Block title="Base split" on={!!c.split} onToggle={(on) => block('split', on ? { agent_pct: 70 } : undefined)} hint="Agent's share of their side of the commission.">
          <Num label="Agent %" value={c.split?.agent_pct} onChange={(v) => setC((x) => ({ ...x, split: { ...x.split, agent_pct: v } }))} />
        </Block>

        <Block title="Sliding scale" on={!!c.tiers} onToggle={(on) => block('tiers', on ? { basis: 'gci', levels: [{ from: 0, agent_pct: 60 }, { from: 100000, agent_pct: 80 }] } : undefined)} hint="Agent % steps up as their cap-year production grows. Replaces the base split. A deal that crosses a step is split across both rates.">
          {c.tiers && <>
            <div className="max-w-xs mb-3"><Label>Measured by</Label><select className={sel} value={c.tiers.basis} onChange={(e) => setC((x) => ({ ...x, tiers: { ...x.tiers, basis: e.target.value } }))}><option value="gci">GCI this cap year</option><option value="volume">Sales volume</option><option value="units">Units closed</option></select></div>
            {c.tiers.levels.map((l, i) => (
              <div key={i} className="flex items-end gap-2 mb-2">
                <Num label={i === 0 ? 'From' : ''} value={l.from} onChange={(v) => setC((x) => { x.tiers.levels[i].from = v; return x; })} />
                <Num label={i === 0 ? 'Agent %' : ''} value={l.agent_pct} onChange={(v) => setC((x) => { x.tiers.levels[i].agent_pct = v; return x; })} />
                <Button size="icon" variant="ghost" onClick={() => setC((x) => { x.tiers.levels.splice(i, 1); return x; })}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setC((x) => { const last = x.tiers.levels.at(-1); x.tiers.levels.push({ from: (Number(last?.from) || 0) + 50000, agent_pct: Math.min(100, (Number(last?.agent_pct) || 70) + 5) }); return x; })}><Plus className="w-4 h-4 mr-1" /> Add step</Button>
          </>}
        </Block>

        <Block title="Annual cap" on={!!c.cap} onToggle={(on) => block('cap', on ? { amount: 18000, after_cap_agent_pct: 100 } : undefined)} hint="Once the brokerage has earned this much company dollar in the agent's cap year (starting on their anniversary), the after-cap split applies. Per-agent overrides live on the user.">
          {c.cap && <div className="flex flex-wrap gap-3">
            <Num label="Cap amount ($)" value={c.cap.amount} onChange={(v) => setC((x) => ({ ...x, cap: { ...x.cap, amount: v } }))} />
            <Num label="Agent % after cap" value={c.cap.after_cap_agent_pct} onChange={(v) => setC((x) => ({ ...x, cap: { ...x.cap, after_cap_agent_pct: v } }))} />
          </div>}
        </Block>

        <Block title="Fees" on={!!c.fees} onToggle={(on) => block('fees', on ? [{ id: uid(), name: 'Transaction fee', type: 'flat', amount: 395, when: 'always' }] : undefined)} hint="Taken from the agent's side. Use a flat fee with a 100% split for flat-fee plans.">
          {(c.fees || []).map((f, i) => (
            <div key={f.id || i} className="rounded-lg border p-3 mb-2 grid sm:grid-cols-3 gap-2">
              <div className="sm:col-span-2"><Label>Name</Label><Input className="mt-1" value={f.name} onChange={(e) => setC((x) => { x.fees[i].name = e.target.value; return x; })} /></div>
              <div className="flex items-end justify-end"><Button size="icon" variant="ghost" onClick={() => setC((x) => { x.fees.splice(i, 1); return x; })}><Trash2 className="w-4 h-4" /></Button></div>
              <div><Label>Type</Label><select className={sel} value={f.type} onChange={(e) => setC((x) => { x.fees[i].type = e.target.value; return x; })}><option value="flat">Flat $</option><option value="pct_gross">% of their gross</option><option value="pct_agent">% of agent's split</option></select></div>
              <Num label="Amount" value={f.amount} onChange={(v) => setC((x) => { x.fees[i].amount = v; return x; })} />
              <div><Label>Charged</Label><select className={sel} value={f.when || 'always'} onChange={(e) => setC((x) => { x.fees[i].when = e.target.value; return x; })}><option value="always">Always</option><option value="pre_cap">Only before cap</option><option value="post_cap">Only after cap</option></select></div>
              <Num label="Annual max ($, optional)" value={f.annual_cap ?? ''} onChange={(v) => setC((x) => { x.fees[i].annual_cap = v; return x; })} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={!!f.counts_toward_cap} onChange={(e) => setC((x) => { x.fees[i].counts_toward_cap = e.target.checked; return x; })} /> Counts toward the cap</label>
            </div>
          ))}
          {c.fees && <Button size="sm" variant="outline" onClick={() => setC((x) => { x.fees.push({ id: uid(), name: 'Fee', type: 'flat', amount: 0, when: 'always' }); return x; })}><Plus className="w-4 h-4 mr-1" /> Add fee</Button>}
        </Block>

        <Block title="Team" on={!!c.team} onToggle={(on) => block('team', on ? { lead_pct: 30, basis: 'after_split' } : undefined)} hint="The team leader's share. A team's own lead % (set on the team) overrides this.">
          {c.team && <div className="flex flex-wrap gap-3">
            <Num label="Leader %" value={c.team.lead_pct} onChange={(v) => setC((x) => ({ ...x, team: { ...x.team, lead_pct: v } }))} />
            <div><Label>Taken from</Label><select className={sel} value={c.team.basis} onChange={(e) => setC((x) => ({ ...x, team: { ...x.team, basis: e.target.value } }))}><option value="after_split">Agent's side after the brokerage split</option><option value="before_split">Agent's gross, before the split</option></select></div>
          </div>}
        </Block>

        <Block title="Downline (revenue share)" on={!!c.downline} onToggle={(on) => block('downline', on ? { basis: 'company_dollar', per_agent_annual_cap: '', levels: [{ pct: 5 }, { pct: 3 }, { pct: 2 }] } : undefined)} hint="Paid by the brokerage to the agent's recruiter (level 1), their recruiter (level 2) and so on, from the 'Recruited by' field on each user.">
          {c.downline && <>
            <div className="flex flex-wrap gap-3 mb-3">
              <div><Label>Percent of</Label><select className={sel} value={c.downline.basis} onChange={(e) => setC((x) => ({ ...x, downline: { ...x.downline, basis: e.target.value } }))}><option value="company_dollar">Company dollar</option><option value="gross">Agent's gross</option></select></div>
              <Num label="Max per agent per cap year ($)" value={c.downline.per_agent_annual_cap ?? ''} onChange={(v) => setC((x) => ({ ...x, downline: { ...x.downline, per_agent_annual_cap: v } }))} />
            </div>
            {c.downline.levels.map((l, i) => (
              <div key={i} className="flex items-end gap-2 mb-2">
                <span className="text-sm w-16 pb-2">Level {i + 1}</span>
                <Num label={i === 0 ? '%' : ''} value={l.pct} onChange={(v) => setC((x) => { x.downline.levels[i].pct = v; return x; })} />
                <Button size="icon" variant="ghost" onClick={() => setC((x) => { x.downline.levels.splice(i, 1); return x; })}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ))}
            {c.downline.levels.length < 7 && <Button size="sm" variant="outline" onClick={() => setC((x) => { x.downline.levels.push({ pct: 1 }); return x; })}><Plus className="w-4 h-4 mr-1" /> Add level</Button>}
          </>}
        </Block>

        <div className="flex flex-wrap gap-2 mt-6">
          <Button onClick={onSave} disabled={saving || !plan.name?.trim()} className="gap-1.5">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save plan</Button>
          {plan.id && <Button variant="outline" onClick={onCopy} className="gap-1.5"><Copy className="w-4 h-4" /> Duplicate</Button>}
          {plan.id && <Button variant="ghost" onClick={onDelete} className="gap-1.5 text-red-600"><Trash2 className="w-4 h-4" /> Delete</Button>}
        </div>
      </div>
      <Preview config={c} />
    </div>
  );
}

function Preview({ config }) {
  const [gross, setGross] = useState(15000);
  const [paid, setPaid] = useState(0);
  const [gciYtd, setGciYtd] = useState(0);
  const [onTeam, setOnTeam] = useState(false);
  const [sponsors, setSponsors] = useState(0);
  const out = useMemo(() => {
    try {
      return calculateDeal({
        gross_commission: Number(gross) || 0, sale_price: (Number(gross) || 0) * 40,
        agents: [{ email: 'agent', name: 'Agent', split_pct: 100, plan: { config }, ytd: { gci: Number(gciYtd) || 0, company_dollar: Number(paid) || 0, volume: 0, units: 0, fees: {}, revshare: 0 }, team_lead_email: onTeam ? 'leader' : null, sponsors: Array.from({ length: Number(sponsors) || 0 }, (_, i) => `sponsor${i + 1}`) }],
      });
    } catch (e) { return { error: e.message }; }
  }, [config, gross, paid, gciYtd, onTeam, sponsors]);
  const a = out.agents?.[0];
  return (
    <aside className="xl:sticky xl:top-4 self-start rounded-2xl border bg-card p-5">
      <h3 className="font-semibold mb-3">Try it</h3>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <Num label="Agent's gross ($)" value={gross} onChange={setGross} />
        <Num label="GCI so far this year" value={gciYtd} onChange={setGciYtd} />
        <Num label="Paid toward cap" value={paid} onChange={setPaid} />
        <Num label="Recruiter levels" value={sponsors} onChange={setSponsors} />
        <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={onTeam} onChange={(e) => setOnTeam(e.target.checked)} /> Agent is on a team</label>
      </div>
      {out.error ? <p className="text-sm text-red-600">{out.error}</p> : a && (
        <>
          {a.lines.map((l, i) => <Row key={i} label={l.label} value={money(l.amount)} strong={l.total} />)}
          <div className="border-t mt-3 pt-3">
            <Row label="Brokerage keeps" value={money(a.brokerage_net)} strong />
            {a.revshare.map((r) => <Row key={r.level} label={`Revenue share L${r.level} (${r.pct}%)`} value={money(r.amount)} />)}
            {a.cap && <p className="text-xs text-muted-foreground mt-2">{a.capped_after ? 'Agent is capped after this deal.' : `${money(a.cap.remaining)} left to cap after this deal.`}</p>}
          </div>
        </>
      )}
    </aside>
  );
}

function Block({ title, hint, on, onToggle, children }) {
  return (
    <div className="rounded-xl border bg-card p-4 mb-3">
      <label className="flex items-center gap-2 font-medium"><input type="checkbox" checked={on} onChange={(e) => onToggle(e.target.checked)} /> {title}</label>
      {hint && <p className="text-xs text-muted-foreground mt-1 ml-6">{hint}</p>}
      {on && <div className="mt-3 ml-6">{children}</div>}
    </div>
  );
}

function Num({ label, value, onChange }) {
  return <div className="min-w-[110px]">{label !== '' && <Label className="text-xs">{label}</Label>}<Input className="mt-1" inputMode="decimal" value={value ?? ''} onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, ''))} /></div>;
}
