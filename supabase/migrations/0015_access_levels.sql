-- 0015: Access levels.
--   Owners / brokers / office admins: every deal in the brokerage (unchanged).
--   State brokers: deals in the states they manage (by the property's state OR the agent's
--     license state). They can see the deal and approve its documents and checklists; they
--     can't edit the deal itself.
--   Team leaders: their team's agents' deals (the team's leader, or a team_leader on that team).
--   TC / compliance (TC role, or a TC or compliance duty): every deal, to review, approve and
--     edit. Nothing else about other agents (contacts, onboarding, payouts stay private).
--   Agents: their own deals.
-- Undo: supabase/undo/0015_access_levels_undo.sql

alter table public.profiles add column if not exists managed_states jsonb not null default '[]'::jsonb;
alter table public.transaction add column if not exists property_state text;

-- Two-letter state from an address like "12 Elm St, Austin, TX 78701" or "..., Austin, TX".
create or replace function public.state_from_address(addr text) returns text language plpgsql immutable as $$
declare s text;
begin
  if addr is null then return null; end if;
  s := upper(substring(addr from '(?i),\s*([a-z]{2})\.?[\s,]+\d{5}'));
  if s is null then s := substring(addr from '\s([A-Z]{2})\s+\d{5}(-\d{4})?\s*$'); end if;
  if s is null then s := upper(substring(addr from '(?i),\s*([a-z]{2})\.?\s*(,\s*(usa?|united states))?\s*$')); end if;
  if s = any (array['AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','PR','VI','GU']) then return s; end if;
  return null;
end $$;

create or replace function public.transaction_fill_state() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.property_address is distinct from old.property_address or new.property_state is null then
    new.property_state := coalesce(public.state_from_address(new.property_address), new.property_state);
  end if;
  return new;
end $$;
drop trigger if exists transaction_fill_state on public.transaction;
create trigger transaction_fill_state before insert or update on public.transaction for each row execute function public.transaction_fill_state();

-- Fill in existing deals without touching their "last updated" time or firing automations.
do $$ begin
  alter table public.transaction disable trigger user;
  update public.transaction set property_state = public.state_from_address(property_address)
    where property_state is null and public.state_from_address(property_address) is not null;
  alter table public.transaction enable trigger user;
end $$;

-- States the signed-in state broker manages.
create or replace function public.auth_managed_states() returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array(select upper(trim(v)) from jsonb_array_elements_text(
           case when jsonb_typeof(p.managed_states) = 'array' then p.managed_states else '[]'::jsonb end) v), '{}')
  from public.profiles p
  where p.id = auth.uid() and public.second_step_ok() and public.normalize_role(p.role) = 'state_broker'
$$;

-- Does the signed-in state broker oversee this deal? Property state OR the agent's license state.
create or replace function public.oversees_deal(agent_email text, property_state text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare m text[] := public.auth_managed_states();
begin
  if m is null or cardinality(m) = 0 then return false; end if;
  if upper(coalesce(property_state, '')) = any (m) then return true; end if;
  return exists (
    select 1 from public.profiles p
    where lower(p.email) = lower(agent_email) and p.brokerage_id = public.auth_brokerage_id()
      and (upper(trim(coalesce(p.license_state, ''))) = any (m)
           or exists (select 1 from jsonb_array_elements(case when jsonb_typeof(p.licenses) = 'array' then p.licenses else '[]'::jsonb end) l
                      where upper(trim(coalesce(l->>'state', ''))) = any (m))));
end $$;

-- TC role (or the tx.all permission), or a TC / compliance duty: reviews every deal.
create or replace function public.reviews_all_deals() returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_perm('tx.all') or coalesce((
    select p.duties ?| array['tc', 'compliance'] from public.profiles p
    where p.id = auth.uid() and public.second_step_ok() and jsonb_typeof(p.duties) = 'array'), false)
$$;

-- Team leaders: the team's leader (Teams page) or a team_leader on that team.
create or replace function public.leads_agent(agent_email text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.second_step_ok() and exists (
    select 1 from public.profiles p join public.team t on t.id = p.team_id
    where lower(p.email) = lower(agent_email)
      and t.brokerage_id = public.auth_brokerage_id()
      and (lower(t.leader_email) = public.auth_email()
           or (public.is_team_leader() and p.team_id = public.auth_team_id())))
$$;

-- Seeing deals: adds state brokers and TC/compliance duties.
drop policy if exists transaction_access on public.transaction;
create policy transaction_access on public.transaction for select using (lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email() or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email())) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.reviews_all_deals() or public.leads_agent(agent_email) or public.oversees_deal(agent_email, property_state))) or public.is_super_admin());
-- Changing deals: state brokers can't (they approve documents and checklists instead).
drop policy if exists transaction_update on public.transaction;
create policy transaction_update on public.transaction for update using (lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email() or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email())) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.reviews_all_deals() or public.leads_agent(agent_email))) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());

-- E-sign documents: deal documents follow the deal; documents not on a deal (e.g. onboarding)
-- stay with whoever made them and the admins.
drop policy if exists esign_document_access on public.esign_document;
create policy esign_document_access on public.esign_document for all using (lower(created_by_email) = public.auth_email() or lower(created_by) = public.auth_email() or (transaction_id is not null and exists (select 1 from public.transaction x where x.id = esign_document.transaction_id)) or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());

-- Only an admin can change which states someone manages.
create or replace function public.guard_profile_self_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_brokerage_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.brokerage_id is distinct from old.brokerage_id
     or new.duties is distinct from old.duties
     or new.commission_plan_id is distinct from old.commission_plan_id
     or new.team_lead_email is distinct from old.team_lead_email
     or new.sponsor_email is distinct from old.sponsor_email
     or new.cap_start_date is distinct from old.cap_start_date
     or new.start_date is distinct from old.start_date
     or new.suspended is distinct from old.suspended
     or new.permissions is distinct from old.permissions
     or new.annual_cap is distinct from old.annual_cap
     or new.team_id is distinct from old.team_id
     or new.managed_states is distinct from old.managed_states
     or new.tc_email is distinct from old.tc_email then
    raise exception 'Only an admin can change role, permissions, team, states, plan, cap, TC or sponsor fields';
  end if;
  return new;
end $$;

-- Roles and permissions: adds State broker; TCs see every deal.
create or replace function public.perm_default(role text, key text) returns boolean language sql immutable as $$
  select case key
    when 'tx.create' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.edit' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.delete' then r in ('broker','office_admin','owner')
    when 'tx.cancel' then r in ('agent','broker','office_admin','owner','state_broker','tc','team_leader')
    when 'tx.all' then r in ('broker','office_admin','owner','tc')
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
