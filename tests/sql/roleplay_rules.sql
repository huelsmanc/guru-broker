\set ON_ERROR_STOP 1
-- Practice calls: an agent sees only their own; admins see the brokerage's; nobody writes from the browser.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000006a1','radmin@r.com'),('00000000-0000-0000-0000-0000000006a2','rann@r.com'),
 ('00000000-0000-0000-0000-0000000006a3','rbob@r.com'),('00000000-0000-0000-0000-0000000006a4','reve@o.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000006a1','radmin@r.com','Admin','admin','R1'),('00000000-0000-0000-0000-0000000006a2','rann@r.com','Ann','user','R1'),
 ('00000000-0000-0000-0000-0000000006a3','rbob@r.com','Bob','user','R1'),('00000000-0000-0000-0000-0000000006a4','reve@o.com','Eve','admin','R2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.roleplay_session (id, brokerage_id, agent_email, scenario, score) values
 ('rp1','R1','rann@r.com','expired',70),('rp2','R1','rbob@r.com','fsbo',55),('rp3','R2','reve@o.com','fsbo',90);

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000006a2','rann@r.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.roleplay_session) = 1, 'ann sees only her own calls';
  begin insert into public.roleplay_session (brokerage_id, agent_email, score) values ('R1','rann@r.com',100); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  update public.roleplay_session set score = 100 where id = 'rp1';
end $$;
reset role;
do $$ begin assert (select score from public.roleplay_session where id = 'rp1') = 70, 'agents cannot change their own score'; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000006a1','radmin@r.com');
set role authenticated;
do $$ begin assert (select count(*) from public.roleplay_session) = 2, 'admin sees the brokerage''s calls, not R2'; end $$;
reset role;
select 'roleplay rules: all checks passed';
