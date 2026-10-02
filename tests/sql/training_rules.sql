\set ON_ERROR_STOP 1
-- Trainings (0016): agents read trainings but can't change them, can't read answers, can't record
-- attempts (the server grades), and see only their own attempts; admins manage their brokerage only.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000f1','towner@x.com'),('00000000-0000-0000-0000-0000000000f2','tann@x.com'),
 ('00000000-0000-0000-0000-0000000000f3','tbob@x.com'),('00000000-0000-0000-0000-0000000000f4','teve@other.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000000f1','towner@x.com','Owner','owner','TB1'),('00000000-0000-0000-0000-0000000000f2','tann@x.com','Ann','agent','TB1'),
 ('00000000-0000-0000-0000-0000000000f3','tbob@x.com','Bob','agent','TB1'),('00000000-0000-0000-0000-0000000000f4','teve@other.com','Eve','owner','TB2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.compliance_training (id,brokerage_id,title,kind) values ('tt1','TB1','Fair housing','class');
insert into public.compliance_question (id,training_id,question_text,options) values ('tq1','tt1','Q?','[{"text":"a","is_correct":true},{"text":"b","is_correct":false}]');
insert into public.compliance_attempt (id,brokerage_id,training_id,agent_email,score,passed) values ('ta1','TB1','tt1','tann@x.com',100,true),('ta2','TB1','tt1','tbob@x.com',40,false);

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f2','tann@x.com');
set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.compliance_training where id = 'tt1') = 1, 'agent sees the training';
  assert (select count(*) from public.compliance_question where id = 'tq1') = 0, 'agent cannot read answers';
  assert (select string_agg(id, ',') from public.compliance_attempt where id like 'ta%') = 'ta1', 'agent sees only own attempts';
  begin
    insert into public.compliance_attempt (brokerage_id,training_id,agent_email,score,passed) values ('TB1','tt1','tann@x.com',100,true);
    assert false, 'agent recorded an attempt';
  exception when insufficient_privilege then null; end;
  update public.compliance_attempt set passed = true where id = 'ta2';
  get diagnostics n = row_count; assert n = 0, 'agent cannot change attempts';
  update public.compliance_training set title = 'x' where id = 'tt1';
  get diagnostics n = row_count; assert n = 0, 'agent cannot edit a training';
  begin
    insert into public.compliance_training (brokerage_id,title) values ('TB1','mine');
    assert false, 'agent created a training';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f1','towner@x.com');
set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.compliance_question where id = 'tq1') = 1, 'admin reads questions';
  assert (select count(*) from public.compliance_attempt where id like 'ta%') = 2, 'admin sees all attempts';
  update public.compliance_training set title = 'Fair housing 101' where id = 'tt1';
  get diagnostics n = row_count; assert n = 1, 'admin edits training';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000f4','teve@other.com');
set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.compliance_question where id = 'tq1') = 0, 'other brokerage admin cannot read questions';
  update public.compliance_question set question_text = 'hacked' where id = 'tq1';
  get diagnostics n = row_count; assert n = 0, 'other brokerage admin cannot change questions';
  assert (select count(*) from public.compliance_attempt where id like 'ta%') = 0, 'other brokerage sees no attempts';
end $$;
reset role;
delete from public.compliance_attempt where id like 'ta%';
delete from public.compliance_question where id = 'tq1';
delete from public.compliance_training where id = 'tt1';
select 'training rules: all checks passed';
