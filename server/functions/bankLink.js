// New: direct deposit setup. 'invite' asks Payload to email the agent a secure link to
// connect their bank; 'status' refreshes where that stands. Agents can do their own;
// admins can do anyone's. Bank numbers stay with Payload.
import { createClientFromRequest } from '../lib/base44.js';
import { isAdminRole, can } from '../lib/team.js';
import { requestBankLink, getActivation, payloadConfigured } from '../lib/payload.js';
import { profileByEmail } from '../lib/backoffice.js';

export async function refreshActivation(entities, row) {
  if (!row?.payload_activation_id) return row;
  const act = await getActivation(row.payload_activation_id);
  const patch = { bank_status: act.status || row.bank_status };
  if (act.payment_method_id && act.payment_method_id !== row.payload_payment_method_id) {
    patch.payload_payment_method_id = act.payment_method_id;
    patch.bank_linked_at = new Date().toISOString();
    patch.bank_status = 'linked';
  }
  return entities.AgentPrivate.update(row.id, patch);
}

export default async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    const { action = 'status', email } = await req.json();
    const target = String(email || me.email).toLowerCase();
    const isAdmin = isAdminRole(me.role);
    if (target !== me.email.toLowerCase() && !isAdmin) return Response.json({ error: 'Not allowed' }, { status: 403 });
    const entities = base44.asServiceRole.entities;
    const profile = await profileByEmail(entities, target);
    if (!profile || (profile.brokerage_id !== me.brokerage_id && me.role !== 'super_admin')) return Response.json({ error: 'User not found' }, { status: 404 });
    let [row] = await entities.AgentPrivate.filter({ user_email: target }, '-created_date', 1);

    if (action === 'invite') {
      if (!payloadConfigured()) return Response.json({ error: 'Payload is not connected yet (see SETUP.md)' }, { status: 400 });
      const [settings] = await entities.BrokerageSettings.filter({ brokerage_id: profile.brokerage_id }, '-created_date', 1);
      const act = await requestBankLink({ name: profile.full_name || profile.display_name || target, email: target, brokerageName: settings?.brokerage_name });
      const patch = { payload_activation_id: act.id, bank_status: act.status || 'requested', brokerage_id: profile.brokerage_id };
      row = row ? await entities.AgentPrivate.update(row.id, patch) : await entities.AgentPrivate.create({ user_email: target, ...patch });
      return Response.json({ status: row.bank_status });
    }
    if (row?.payload_activation_id && !row.payload_payment_method_id) row = await refreshActivation(entities, row);
    return Response.json({ status: row?.bank_status || 'not_linked', linked: !!row?.payload_payment_method_id, linked_at: row?.bank_linked_at || null });
  } catch (error) {
    console.error('bankLink:', error);
    return Response.json({ error: error.message }, { status: error.status || 500 });
  }
};
