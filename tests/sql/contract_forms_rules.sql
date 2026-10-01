\set ON_ERROR_STOP 1
-- Contract forms: platform forms are readable by everyone, only the super admin changes them;
-- brokerage forms are readable inside the brokerage and managed by its admins.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000002a','fadmin@x.com'),('00000000-0000-0000-0000-00000000002b','fann@x.com'),
 ('00000000-0000-0000-0000-00000000002d','feve@other.com'),('00000000-0000-0000-0000-00000000002e','fsuper@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-00000000002a','fadmin@x.com','Admin','admin','B1'),('00000000-0000-0000-0000-00000000002b','fann@x.com','Ann','user','B1'),
 ('00000000-0000-0000-0000-00000000002d','feve@other.com','Eve','admin','B2'),('00000000-0000-0000-0000-00000000002e','fsuper@x.com','Super','super_admin',null)
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.contract_form (id,brokerage_id,state,form_type,name) values
 ('cf1','platform','CT','purchase_agreement','CT Standard Form'),('cf2','B1','CT','disclosure','B1 lead paint'),('cf3','B2','NY','purchase_agreement','B2 NY form');

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email)::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000002b','fann@x.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.contract_form) = 2, 'agent sees platform + own brokerage forms';
  begin insert into public.contract_form (brokerage_id,name) values ('B1','agent form'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  update public.contract_form set name = 'x' where id = 'cf1';
end $$;
reset role;
do $$ begin assert (select name from public.contract_form where id = 'cf1') = 'CT Standard Form', 'agent cannot edit platform form'; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000002a','fadmin@x.com');
set role authenticated;
do $$ begin
  insert into public.contract_form (brokerage_id,name) values ('B1','admin form');
  begin insert into public.contract_form (brokerage_id,name) values ('platform','sneaky'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  update public.contract_form set name = 'x' where id = 'cf1';
  update public.contract_form set name = 'x' where id = 'cf3';
end $$;
reset role;
do $$ begin
  assert (select name from public.contract_form where id = 'cf1') = 'CT Standard Form', 'brokerage admin cannot edit platform form';
  assert (select name from public.contract_form where id = 'cf3') = 'B2 NY form', 'or another brokerage''s';
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000002e','fsuper@x.com');
set role authenticated;
do $$ begin
  insert into public.contract_form (brokerage_id,name,state) values ('platform','NY Residential','NY');
  update public.contract_form set form_version = 'rev 9.24' where id = 'cf1';
end $$;
reset role;
do $$ begin assert (select form_version from public.contract_form where id = 'cf1') = 'rev 9.24', 'super admin manages platform forms'; end $$;
select 'contract forms rules: all checks passed';
