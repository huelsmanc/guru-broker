// One list of roles for every role menu, so nobody picks "Broker / Admin" and gets Office admin.
import React from 'react';
import { ROLES, normalizeRole } from '../../../shared/permissions.generated.js';

export const SUPER = 'super_admin';
export const SUPER_LABEL = 'Platform owner (super admin)';

/** Readable name for any stored role, including the old Base44 names ("admin", "user"). */
export const roleLabel = (r) => (r === SUPER ? SUPER_LABEL : ROLES[normalizeRole(r)] || r || ROLES.agent);
/** The value a role menu should show for a stored role. */
export const roleValue = (r) => (r === SUPER ? SUPER : ROLES[normalizeRole(r)] ? normalizeRole(r) : 'agent');
/** True when the stored value is an old name or not a role at all. */
export const isOldRoleName = (r) => r !== SUPER && !!r && !ROLES[r];

export const ROLE_HELP = {
  owner: 'Runs the brokerage: everything, including billing and settings.',
  broker: 'Manages the brokerage: deals, people, approvals, payouts.',
  office_admin: 'Office staff: deals, documents and people, as permissions allow.',
  state_broker: 'Oversees states: sees deals in their states and approves their documents and checklists.',
  team_leader: 'Leads a team: sees and works their team\'s deals.',
  tc: 'Transaction coordinator / compliance: reviews, approves and edits every deal; nothing else about other agents.',
  agent: 'Their own deals, contacts and marketing.',
  [SUPER]: 'You: the whole platform, every brokerage, print and payment settings.',
};

export default function RoleOptions({ allowSuper = false }) {
  return (
    <>
      {Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      {allowSuper && <option value={SUPER}>{SUPER_LABEL}</option>}
    </>
  );
}
