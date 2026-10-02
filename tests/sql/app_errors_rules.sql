\set ON_ERROR_STOP 1
-- Error log: repeats are counted on one row (people listed once), a fixed error that returns reopens
-- and alerts again, only the platform owner can read it, and nobody signed in can write to it.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
-- (Supabase grants new functions to signed-in users by default; the migration takes this one back.)
revoke all on function public.log_app_error(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000e1','root@x.com'),('00000000-0000-0000-0000-0000000000e2','agent@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000000e1','root@x.com','Root','super_admin','B1'),('00000000-0000-0000-0000-0000000000e2','agent@x.com','Ann','owner','B1')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;

do $$ declare isnew boolean; begin
  isnew := public.log_app_error('fp1','server','printShop','boom',null,'Ann@x.com',null,null,'B1');
  assert isnew, 'first time is new';
  isnew := public.log_app_error('fp1','server','printShop','boom again',null,'ann@x.com',null,null,'B1');
  assert not isnew, 'repeat is not new';
  perform public.log_app_error('fp1','server','printShop','boom',null,'bob@x.com',null,null,null);
  assert (select count from public.app_error where fingerprint = 'fp1') = 3, 'counted';
  assert (select jsonb_array_length(users) from public.app_error where fingerprint = 'fp1') = 2, 'each person once';
  update public.app_error set notified_at = now() where fingerprint = 'fp1';
  isnew := public.log_app_error('fp1','server','printShop','boom',null,null,null,null,null);
  assert not isnew, 'already emailed about it';
  update public.app_error set resolved = true where fingerprint = 'fp1';
  isnew := public.log_app_error('fp1','server','printShop','boom',null,null,null,null,null);
  assert isnew, 'came back after being fixed';
  assert (select not resolved and notified_at is null from public.app_error where fingerprint = 'fp1'), 'reopened';
end $$;

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e2','agent@x.com');
set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.app_error) = 0, 'a brokerage owner cannot read the platform error log';
  update public.app_error set resolved = true; get diagnostics n = row_count; assert n = 0, 'or change it';
  begin
    insert into public.app_error (fingerprint, source, message) values ('x','browser','fake');
    assert false, 'signed-in users cannot insert directly';
  exception when insufficient_privilege then null; when others then if sqlerrm like '%row-level security%' then null; else raise; end if;
  end;
  begin
    perform public.log_app_error('fp9','browser','/','x',null,null,null,null,null);
    assert false, 'signed-in users cannot call the logging function';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1','root@x.com');
set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.app_error) = 1, 'platform owner reads it';
  update public.app_error set resolved = true; get diagnostics n = row_count; assert n = 1, 'and marks it fixed';
end $$;
reset role;
select 'app errors: all checks passed';
