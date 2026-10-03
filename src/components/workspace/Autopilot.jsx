// The deal's autopilot: who gets reminded about what, and when. Reminders are sent by the server
// (server/lib/autopilot.js) from the same plan shown here (shared/autopilot.js).
import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bot, Mail, Bell, ChevronDown, UserPlus } from 'lucide-react';
import { planFor, autopilotOf, missingParties } from '../../../shared/autopilot.js';
import { todayStr, daysBetween } from '../../../shared/dealTimeline.js';

const dayWord = (d, today) => {
  const n = daysBetween(today, d);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};
const STEP = { d3: 'heads-up', d1: 'reminder', late: 'nudge if not done', p3: 'heads-up', p1: 'reminder' };
const first = (n) => String(n || '').split(' ')[0];

export default function Autopilot({ tx, contacts = [], canEdit, user, onManagePeople, refresh }) {
  const { data: settings } = useQuery({
    queryKey: ['brokerage-settings-autopilot', tx.brokerage_id], staleTime: 10 * 60_000,
    queryFn: async () => (await base44.entities.BrokerageSettings.filter({ brokerage_id: tx.brokerage_id }, '-created_date', 1))[0] || {},
  });
  const defaults = { parties: settings?.autopilot_parties !== false };
  const cfg = autopilotOf(tx, defaults);
  const today = todayStr();
  const plan = useMemo(() => planFor(tx, contacts, { today, brokerageDefaults: defaults }), [tx, contacts, today, defaults.parties]); // eslint-disable-line react-hooks/exhaustive-deps
  const missing = cfg.on && cfg.parties ? missingParties(tx, contacts) : [];
  const log = [...(tx.autopilot_log || [])].reverse();
  const [busy, setBusy] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const me = String(user?.email || '').toLowerCase();

  const save = async (patch) => {
    setBusy(true);
    try { await base44.entities.Transaction.update(tx.id, { autopilot: { ...(tx.autopilot || {}), ...patch } }); refresh?.(); }
    catch (e) { window.alert(e.message); } finally { setBusy(false); }
  };
  const shown = showAll ? plan : plan.slice(0, 4);
  const names = (to) => to.map((p) => (p.email === me ? 'you' : first(p.name))).join(', ');

  return (
    <div className="rounded-2xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.on ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}><Bot className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Autopilot {cfg.on ? <span className="text-xs font-medium text-emerald-700 ml-1">On</span> : <span className="text-xs font-medium text-muted-foreground ml-1">Off</span>}</p>
          <p className="text-xs text-muted-foreground">{cfg.on ? 'Reminds the team and the other parties before every date, and puts what’s due on everyone’s 7am list.' : 'No reminders go out for this deal.'}</p>
        </div>
        {canEdit && (
          <button role="switch" aria-checked={cfg.on} aria-label="Autopilot" disabled={busy} onClick={() => save({ on: !cfg.on })}
            className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${cfg.on ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
            <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${cfg.on ? 'left-[22px]' : 'left-0.5'}`} />
          </button>
        )}
      </div>

      {cfg.on && (
        <>
          {canEdit && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={cfg.parties} disabled={busy} onChange={(e) => save({ parties: e.target.checked })} />
              Email clients, lender, title and the other agent too
            </label>
          )}

          <div className="mt-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Coming up</p>
            {!plan.length ? <p className="text-sm text-muted-foreground">Nothing scheduled. Add dates to the timeline and reminders line up here.</p> : (
              <ul className="space-y-2">
                {shown.map((p) => (
                  <li key={p.key} className="flex gap-2.5 text-sm">
                    {p.audience === 'team' ? <Bell className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" /> : <Mail className="w-4 h-4 mt-0.5 shrink-0 text-violet-600" />}
                    <div className="min-w-0">
                      <p><span className="font-medium">{dayWord(p.send_on, today)}</span> · {p.label} {STEP[p.step]}</p>
                      <p className="text-xs text-muted-foreground truncate">{p.audience === 'team' ? 'Team: ' : 'Email to '}{names(p.to)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {plan.length > 4 && <button onClick={() => setShowAll(!showAll)} className="mt-2 text-xs text-primary hover:underline">{showAll ? 'Show less' : `Show all ${plan.length}`}</button>}
          </div>

          {missing.length > 0 && (
            <button onClick={onManagePeople} className="mt-3 w-full flex items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted/50">
              <UserPlus className="w-4 h-4 shrink-0" /> Add the {missing.join(', ')} email in People so they get reminders too.
            </button>
          )}

          {log.length > 0 && (
            <div className="mt-3 border-t pt-2">
              <button onClick={() => setShowLog(!showLog)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showLog ? '' : '-rotate-90'}`} /> Sent ({log.length})
              </button>
              {showLog && (
                <ul className="mt-1.5 space-y-1">
                  {log.slice(0, 12).map((l, i) => (
                    <li key={i} className="text-xs text-muted-foreground">
                      {new Date(l.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {l.label} {STEP[l.step]} → {(l.to || []).join(', ')}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
