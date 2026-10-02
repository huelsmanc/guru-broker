\set ON_ERROR_STOP 1
-- Adding to a deal's lists (0017): adds without losing what's there, only on deals you can change,
-- and only the four lists it's meant for.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000e1','pann@x.com'),('00000000-0000-0000-0000-0000000000e2','pbob@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000000e1','pann@x.com','Ann','agent','PB1'),('00000000-0000-0000-0000-0000000000e2','pbob@x.com','Bob','agent','PB1')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.transaction (id,brokerage_id,agent_email,property_address,documents) values ('pd1','PB1','pann@x.com','1 Elm','[{"name":"a.pdf"}]'),('pd2','PB1','pbob@x.com','2 Oak',null);
create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;
select pg_temp.as_user('00000000-0000-0000-0000-0000000000e1','pann@x.com');
set role authenticated;
select public.deal_append('pd1', 'documents', '{"name":"b.pdf"}');
select public.deal_append('pd1', 'documents', '{"name":"c.pdf"}');
do $$ begin
  assert (select jsonb_array_length(documents) from public.transaction where id = 'pd1') = 3, 'all kept';
  begin perform public.deal_append('pd2', 'documents', '{"name":"x.pdf"}'); assert false, 'added to someone else''s deal';
  exception when sqlstate 'P0002' then null; end;
  begin perform public.deal_append('pd1', 'commission_calc', '{"x":1}'); assert false, 'wrong list allowed';
  exception when raise_exception then null; end;
end $$;
reset role;
do $$ begin assert (select documents from public.transaction where id = 'pd2') is null, 'untouched'; end $$;
delete from public.transaction where id in ('pd1','pd2');
select 'deal append rules: all checks passed';
