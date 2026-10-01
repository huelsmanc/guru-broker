\set ON_ERROR_STOP 1
-- Deals: the agent on a deal can change it (any status, including Cancelled) but can't delete it;
-- a brokerage admin can delete; another brokerage's admin can't.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000d1','dadmin@x.com'),('00000000-0000-0000-0000-0000000000d2','dann@x.com'),
 ('00000000-0000-0000-0000-0000000000d3','deve@other.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000000d1','dadmin@x.com','Admin','owner','B1'),('00000000-0000-0000-0000-0000000000d2','dann@x.com','Ann','user','B1'),
 ('00000000-0000-0000-0000-0000000000d3','deve@other.com','Eve','owner','B2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.transaction (id,brokerage_id,agent_email,property_address,status) values ('dt1','B1','dann@x.com','1 Elm','active');

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d2','dann@x.com');
set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.transaction where id = 'dt1') = 1, 'agent sees her deal';
  update public.transaction set status = 'cancelled' where id = 'dt1';
  assert (select status from public.transaction where id = 'dt1') = 'cancelled', 'agent can cancel';
  update public.transaction set status = 'closed' where id = 'dt1';
  delete from public.transaction where id = 'dt1';
  get diagnostics n = row_count;
  assert n = 0, 'agent cannot delete a deal';
  insert into public.transaction (id,brokerage_id,agent_email,property_address) values ('dt2','B1','dann@x.com','2 Oak');
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d3','deve@other.com');
set role authenticated;
do $$ declare n int; begin
  delete from public.transaction where id = 'dt1';
  get diagnostics n = row_count;
  assert n = 0, 'another brokerage cannot delete';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000d1','dadmin@x.com');
set role authenticated;
do $$ declare n int; begin
  delete from public.transaction where id = 'dt1';
  get diagnostics n = row_count;
  assert n = 1, 'brokerage admin can delete';
end $$;
reset role;
delete from public.transaction where id = 'dt2';
select 'deal delete rules: all checks passed';
