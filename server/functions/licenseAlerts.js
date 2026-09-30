// Scheduled daily: warns agents and admins about license and E&O expirations
// at 60, 30, 7 days, and on the day. Each alert goes out once.
import { createClientFromRequest } from '../lib/base44.js';
import { admins, notifyPeople } from '../lib/team.js';

const STEPS = [60, 30, 7, 0];

export default async (req) => {
  const entities = createClientFromRequest(req).asServiceRole.entities;
  const people = await entities.User.list('-created_date', 5000);
  const today = new Date(new Date().toISOString().slice(0, 10));
  let sent = 0;
  for (const u of people) {
    if (u.suspended || !u.brokerage_id) continue;
    for (const [field, label] of [['license_expiration', 'Real estate license'], ['eo_expiration', 'E&O insurance']]) {
      if (!u[field]) continue;
      const days = Math.round((new Date(u[field]) - today) / 864e5);
      const step = STEPS.find((s) => days === s || (s === 0 && days < 0 && days > -3));
      if (step === undefined) continue;
      const key = `${field}:${u[field]}:${step}`;
      const done = u.alerts_sent || [];
      if (done.includes(key)) continue;
      const when = days < 0 ? `expired on ${u[field]}` : days === 0 ? 'expires today' : `expires in ${days} days (${u[field]})`;
      const adminList = await admins(entities, u.brokerage_id);
      await notifyPeople(entities, {
        brokerageId: u.brokerage_id,
        people: [u, ...adminList],
        title: `${label} ${days <= 0 ? 'expired' : 'expiring'}: ${u.full_name || u.email}`,
        message: `${u.full_name || u.email}'s ${label.toLowerCase()} ${when}.`,
        link: '/Profile', referenceId: u.id, referenceType: 'License',
      });
      await entities.User.update(u.id, { alerts_sent: [...done, key].slice(-40) });
      sent++;
    }
  }
  return Response.json({ status: 'ok', sent });
};
