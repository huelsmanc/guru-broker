-- Deals: everyone on a deal can still see it and change it (status, cancel, etc.), but only
-- brokerage admins can delete one. Run after 0001-0011. Safe to run again.
drop policy if exists transaction_access on public.transaction;
create policy transaction_access on public.transaction for select using (lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email() or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email())) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all') or public.leads_agent(agent_email))) or public.is_super_admin());
drop policy if exists transaction_insert on public.transaction;
drop policy if exists transaction_update on public.transaction;
drop policy if exists transaction_delete on public.transaction;
create policy transaction_insert on public.transaction for insert with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
create policy transaction_update on public.transaction for update using (lower(agent_email) = public.auth_email() or lower(tc_email) = public.auth_email() or coalesce(co_agents, '[]'::jsonb) @> jsonb_build_array(jsonb_build_object('email', public.auth_email())) or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('tx.all') or public.leads_agent(agent_email))) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
create policy transaction_delete on public.transaction for delete using ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());
