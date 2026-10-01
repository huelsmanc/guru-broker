\set ON_ERROR_STOP 1
-- 2-step sign-in: an admin who hasn't confirmed the second step sees nothing; once the sign-in is
-- confirmed (authenticator = aal2, or an emailed code recorded for this session) they see everything.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000005fa','tadmin@t.com'),('00000000-0000-0000-0000-0000000005fb','tann@t.com'),
 ('00000000-0000-0000-0000-0000000005fc','tbob@u.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000005fa','tadmin@t.com','Admin','admin','T1'),
 ('00000000-0000-0000-0000-0000000005fb','tann@t.com','Ann','user','T1'),
 ('00000000-0000-0000-0000-0000000005fc','tbob@u.com','Bob','user','T2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id, full_name = excluded.full_name;
insert into public.contact (id,brokerage_id,owner_email,name) values
 ('t1','T1','tann@t.com','Ann buyer'),('t2','T2','tbob@u.com','Bob buyer');

create or replace function pg_temp.as_user(uid text, email text, sid text, aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'session_id', sid, 'aal', aal)::text, false);
end $$;

-- Admin, password only: nothing.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005fa','tadmin@t.com','S1','aal1');
set role authenticated;
do $$ begin
  assert public.second_step_needed('00000000-0000-0000-0000-0000000005fa'), 'admins need a second step';
  assert not public.second_step_ok(), 'not confirmed yet';
  assert (select count(*) from public.contact) = 0, 'unconfirmed admin sees no contacts';
  assert (select count(*) from public.profiles where id <> auth.uid()) = 0, 'or other people';
  assert public.auth_email() = '', 'and has no email identity';
  assert not public.has_perm('accounting.access'), 'or permissions';
  begin update public.profiles set full_name = 'hacked' where id = auth.uid(); exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin assert (select full_name from public.profiles where id = '00000000-0000-0000-0000-0000000005fa') = 'Admin', 'cannot edit own profile before confirming'; end $$;

-- The server confirms this sign-in after the emailed code.
insert into public.second_step_session (user_id, session_id, method, expires_at)
  values ('00000000-0000-0000-0000-0000000005fa','S1','email', now() + interval '1 day');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 1, 'confirmed admin sees the brokerage contacts'; end $$;
reset role;

-- A different sign-in (another device) is not confirmed by S1.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005fa','tadmin@t.com','S2','aal1');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 0, 'another session still needs its own second step'; end $$;
reset role;

-- Expired confirmations don't count.
update public.second_step_session set expires_at = now() - interval '1 minute' where session_id = 'S1';
select pg_temp.as_user('00000000-0000-0000-0000-0000000005fa','tadmin@t.com','S1','aal1');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 0, 'expired confirmation'; end $$;
reset role;

-- Authenticator app: aal2 sign-in sees everything.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005fa','tadmin@t.com','S3','aal2');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 1, 'aal2 admin sees data'; end $$;
reset role;

-- Agents aren't required by default.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005fb','tann@t.com','S4','aal1');
set role authenticated;
do $$ begin
  assert not public.second_step_needed('00000000-0000-0000-0000-0000000005fb'), 'agents not required by default';
  assert (select count(*) from public.contact) = 1, 'agent sees own contact';
end $$;
reset role;

-- Agent who turned it on for themselves.
update public.profiles set extra = coalesce(extra, '{}'::jsonb) || '{"mfa_enabled": true}' where id = '00000000-0000-0000-0000-0000000005fb';
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 0, 'opted-in agent needs the second step'; end $$;
reset role;
update public.profiles set extra = extra - 'mfa_enabled' where id = '00000000-0000-0000-0000-0000000005fb';

-- Brokerage requires it for everyone.
insert into public.brokerage_settings (brokerage_id, extra) values ('T1', '{"require_2fa_all": true}');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 0, 'brokerage rule applies to agents'; end $$;
reset role;

-- Other brokerage unaffected.
select pg_temp.as_user('00000000-0000-0000-0000-0000000005fc','tbob@u.com','S5','aal1');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 1, 'other brokerage not affected by T1 rule'; end $$;
-- People can't read or plant confirmations themselves.
do $$ begin
  assert (select count(*) from public.second_step_session) = 0, 'confirmations are server only';
  begin
    insert into public.second_step_session (user_id, session_id, expires_at) values (auth.uid(), 'S5', now() + interval '1 day');
    raise exception 'should fail';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'two-step rules: all checks passed';
