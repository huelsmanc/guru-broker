\set ON_ERROR_STOP 1
-- Contact book: each agent sees only their own; admins see the brokerage's; other brokerages see nothing.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000001a','cadmin@x.com'),('00000000-0000-0000-0000-00000000001b','cann@x.com'),
 ('00000000-0000-0000-0000-00000000001c','cbob@x.com'),('00000000-0000-0000-0000-00000000001d','ceve@other.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-00000000001a','cadmin@x.com','Admin','admin','B1'),('00000000-0000-0000-0000-00000000001b','cann@x.com','Ann','user','B1'),
 ('00000000-0000-0000-0000-00000000001c','cbob@x.com','Bob','user','B1'),('00000000-0000-0000-0000-00000000001d','ceve@other.com','Eve','user','B2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.contact (id,brokerage_id,owner_email,name,email) values
 ('k1','B1','cann@x.com','Buyer Bill','bill@c.com'),('k2','B1','cbob@x.com','Seller Sam','sam@c.com'),('k3','B2','ceve@other.com','Other','o@c.com');

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email)::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000001b','cann@x.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.contact) = 1, 'ann sees only her own contact';
  assert (select name from public.contact) = 'Buyer Bill', 'and it is hers';
  insert into public.contact (brokerage_id,owner_email,name) values ('B1','cann@x.com','New one');
  begin insert into public.contact (brokerage_id,owner_email,name) values ('B1','cbob@x.com','planted'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  begin insert into public.contact (brokerage_id,owner_email,name) values ('B2','cann@x.com','wrong brokerage'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  update public.contact set name = 'hacked' where id = 'k2';
end $$;
reset role;
do $$ begin assert (select name from public.contact where id = 'k2') = 'Seller Sam', 'ann cannot change bob''s contact'; end $$;

select pg_temp.as_user('00000000-0000-0000-0000-00000000001a','cadmin@x.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.contact) = 3, 'admin sees every contact in the brokerage (not B2)';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-00000000001d','ceve@other.com');
set role authenticated;
do $$ begin assert (select count(*) from public.contact) = 1, 'other brokerage sees only their own'; end $$;
reset role;
select 'contacts rules: all checks passed';
