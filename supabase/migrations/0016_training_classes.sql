-- 0016: Training classes and broker-signed certificates.
--   Trainings can be a class (lessons, then a quiz) or a quiz; certificate details on each pass.
--   Scores are graded and saved by the server, so nobody can record a pass they didn't earn,
--   and quiz answers are no longer readable by the people taking the quiz.

alter table public.compliance_training add column if not exists kind text;
alter table public.compliance_training add column if not exists lessons jsonb;
alter table public.compliance_training add column if not exists minutes integer;
alter table public.compliance_attempt add column if not exists agent_name text;
alter table public.compliance_attempt add column if not exists certificate_no text;
alter table public.compliance_attempt add column if not exists certificate_url text;

drop policy if exists compliance_attempt_access on public.compliance_attempt;
create policy compliance_attempt_access on public.compliance_attempt for select using ((brokerage_id = public.auth_brokerage_id() and (lower(agent_email) = public.auth_email() or public.is_brokerage_admin())) or public.is_super_admin());
drop policy if exists compliance_question_access on public.compliance_question;
create policy compliance_question_access on public.compliance_question for select using ((exists (select 1 from public.compliance_training ct where ct.id = compliance_question.training_id and ct.brokerage_id = public.auth_brokerage_id()) and public.is_brokerage_admin()) or public.is_super_admin());
drop policy if exists compliance_question_admin on public.compliance_question;
create policy compliance_question_admin on public.compliance_question for all using ((exists (select 1 from public.compliance_training ct where ct.id = compliance_question.training_id and ct.brokerage_id = public.auth_brokerage_id()) and public.is_brokerage_admin()) or public.is_super_admin()) with check ((exists (select 1 from public.compliance_training ct where ct.id = compliance_question.training_id and ct.brokerage_id = public.auth_brokerage_id()) and public.is_brokerage_admin()) or public.is_super_admin());
drop policy if exists compliance_training_access on public.compliance_training;
create policy compliance_training_access on public.compliance_training for select using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
drop policy if exists compliance_training_insert on public.compliance_training;
drop policy if exists compliance_training_update on public.compliance_training;
drop policy if exists compliance_training_delete on public.compliance_training;
create policy compliance_training_insert on public.compliance_training for insert with check ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());
create policy compliance_training_update on public.compliance_training for update using ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());
create policy compliance_training_delete on public.compliance_training for delete using ((brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());
