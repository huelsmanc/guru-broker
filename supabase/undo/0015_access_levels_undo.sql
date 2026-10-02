-- Undo 0015 (access levels): back to the earlier rules.
-- Before running: change any State broker back to Agent (Brokerage users page).
-- Leaves the new columns and helper functions in place; nothing uses them after this.

drop policy if exists transaction_access on public.transaction;
create policy transaction_access on public.transaction for select using (lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email() or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email())) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all') or public.leads_agent(agent_email))) or public.is_super_admin());
drop policy if exists transaction_update on public.transaction;
create policy transaction_update on public.transaction for update using (lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email() or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email())) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all') or public.leads_agent(agent_email))) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
drop policy if exists esign_document_access on public.esign_document;
create policy esign_document_access on public.esign_document for all using (lower(created_by_email) = public.auth_email() or lower(created_by) = public.auth_email() or (transaction_id is not null and exists (select 1 from public.transaction x where x.id = esign_document.transaction_id)) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all'))) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());

create or replace function public.leads_agent(agent_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team_leader() and public.auth_team_id() is not null and exists (
    select 1 from public.profiles p where lower(p.email) = lower(agent_email) and p.team_id = public.auth_team_id())
$$;

create or replace function public.perm_default(role text, key text) returns boolean language sql immutable as $$
  select case key
    when 'tx.create' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.edit' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.delete' then r in ('broker','office_admin','owner')
    when 'tx.cancel' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.all' then r in ('broker','office_admin','owner')
    when 'tx.checklist_manage' then r in ('broker','office_admin','owner','tc')
    when 'tx.checklist_add' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.checklist_remove' then r in ('broker','office_admin','owner','tc')
    when 'tx.close' then r in ('broker','office_admin','owner','tc')
    when 'tx.reopen' then r in ('broker','office_admin','owner')
    when 'tx.edit_emd' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.view_commissions' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.share' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'offers.access' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'offers.create' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'offers.edit' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'offers.delete' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'offers.all' then r in ('broker','office_admin','owner')
    when 'pipeline.individual' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'reports.personal' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'reports.company' then r in ('broker','office_admin','owner')
    when 'contacts.private_all' then r in ('broker','office_admin','owner')
    when 'activity.account' then r in ('broker','office_admin','owner')
    when 'activity.transaction' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'library.access' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'library.manage' then r in ('broker','office_admin','owner')
    when 'library.private_all' then r in ('broker','office_admin','owner')
    when 'docs.approve' then r in ('broker','office_admin','owner')
    when 'docs.approve2' then r in ('broker','owner')
    when 'docs.submit_tx' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'docs.submit_individual' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'settings.manage' then r in ('broker','owner')
    when 'accounting.access' then r in ('broker','office_admin','owner')
    when 'users.manage' then r in ('broker','office_admin','owner')
    else false end
  from (select public.normalize_role(role) as r) x
$$;
