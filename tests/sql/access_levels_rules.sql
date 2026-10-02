\set ON_ERROR_STOP 1
-- Access levels (0015): owner sees all; state broker sees deals in their states (property state OR
-- agent's license state) but can't edit them; team leader sees only their team's deals; TC (role or
-- duty) and compliance see and edit every deal but not other agents' onboarding documents;
-- agents see their own.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000a001','aown@x.com'),
 ('00000000-0000-0000-0000-00000000a002','asb@x.com'),
 ('00000000-0000-0000-0000-00000000a003','atl@x.com'),
 ('00000000-0000-0000-0000-00000000a004','atc@x.com'),
 ('00000000-0000-0000-0000-00000000a005','aag1@x.com'),
 ('00000000-0000-0000-0000-00000000a006','aag2@x.com'),
 ('00000000-0000-0000-0000-00000000a007','aag3@x.com'),
 ('00000000-0000-0000-0000-00000000a008','acomp@x.com'),
 ('00000000-0000-0000-0000-00000000a009','alead@x.com'),
 ('00000000-0000-0000-0000-00000000a00a','aoth@other.com')
 on conflict do nothing;
insert into public.team (id, brokerage_id, name, leader_email) values
 ('tmA','BA','Team A','alead@x.com'), ('tmB','BA','Team B',null) on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id,team_id,license_state,licenses,managed_states,duties) values
 ('00000000-0000-0000-0000-00000000a001','aown@x.com','Owner','owner','BA',null,null,'[]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a002','asb@x.com','State Broker','state_broker','BA',null,'TX','[]','["fl"]','[]'),
 ('00000000-0000-0000-0000-00000000a003','atl@x.com','Team Leader','team_leader','BA','tmB',null,'[]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a004','atc@x.com','TC','tc','BA',null,null,'[]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a005','aag1@x.com','Agent One','agent','BA','tmA','GA','[{"state":"FL","number":"1"}]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a006','aag2@x.com','Agent Two','agent','BA','tmB','GA','[]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a007','aag3@x.com','Agent Three','agent','BA',null,'NC','[]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a008','acomp@x.com','Compliance','agent','BA',null,null,'[]','[]','["compliance"]'),
 ('00000000-0000-0000-0000-00000000a009','alead@x.com','Lead by team page','agent','BA','tmA',null,'[]','[]','[]'),
 ('00000000-0000-0000-0000-00000000a00a','aoth@other.com','Other TC','tc','BB',null,null,'[]','[]','[]')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id, team_id = excluded.team_id,
   license_state = excluded.license_state, licenses = excluded.licenses, managed_states = excluded.managed_states, duties = excluded.duties;

-- d1: agent 1 (team A, licensed FL), Georgia house.  d2: agent 2 (team B), Florida house.
-- d3: agent 3 (no team), North Carolina house.
insert into public.transaction (id,brokerage_id,agent_email,property_address,status) values
 ('ad1','BA','aag1@x.com','10 Peach St, Atlanta, GA 30301','active'),
 ('ad2','BA','aag2@x.com','5 Palm Ave, Miami, fl 33101','active'),
 ('ad3','BA','aag3@x.com','7 Oak Rd, Raleigh, NC','active');
insert into public.checklist (id,brokerage_id,subject_type,subject_id,subject_email,name) values
 ('acl1','BA','transaction','ad3',null,'Deal checklist'),
 ('acl2','BA','onboarding',null,'aag3@x.com','Onboarding');
insert into public.esign_document (id,brokerage_id,created_by_email,transaction_id) values
 ('aes1','BA','aag3@x.com','ad3'), ('aes2','BA','aag3@x.com',null);

do $$ begin
  assert (select property_state from public.transaction where id='ad1') = 'GA', 'state from "GA 30301"';
  assert (select property_state from public.transaction where id='ad2') = 'FL', 'lower-case state';
  assert (select property_state from public.transaction where id='ad3') = 'NC', 'state without zip';
  assert public.state_from_address('123 Main St') is null, 'no state';
  assert public.state_from_address('1 A St, Dallas, Texas 75001') is null, 'full names are not guessed';
  assert public.state_from_address('1 A St Dallas TX 75001-1234') = 'TX', 'no commas';
end $$;
update public.transaction set property_address = '7 Oak Rd, Austin, TX 78701' where id = 'ad3';
do $$ begin assert (select property_state from public.transaction where id='ad3') = 'TX', 'address change updates state'; end $$;
update public.transaction set property_address = '7 Oak Rd, Raleigh, NC' where id = 'ad3';

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;
create or replace function pg_temp.seen() returns text language sql as $$
  select coalesce(string_agg(id, ',' order by id), '') from public.transaction where id like 'ad%'
$$;

-- Owner: everything.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a001','aown@x.com'); set role authenticated;
do $$ begin assert pg_temp.seen() = 'ad1,ad2,ad3', 'owner sees all: ' || pg_temp.seen(); end $$;
reset role;

-- State broker (manages FL): d2 (Florida house) and d1 (agent licensed in FL). Not d3. Can't edit.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a002','asb@x.com'); set role authenticated;
do $$ declare n int; begin
  assert pg_temp.seen() = 'ad1,ad2', 'state broker sees FL deals: ' || pg_temp.seen();
  update public.transaction set status = 'closed' where id = 'ad2';
  get diagnostics n = row_count;
  assert n = 0, 'state broker cannot edit a deal';
  assert (select count(*) from public.checklist where id in ('acl1','acl2')) = 0, 'state broker: no NC checklist, no onboarding';
end $$;
reset role;
-- ...their own license state (TX) doesn't count, only managed states.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a001','aown@x.com');
update public.profiles set managed_states = '["NC"]' where email = 'asb@x.com';
select pg_temp.as_user('00000000-0000-0000-0000-00000000a002','asb@x.com'); set role authenticated;
do $$ begin
  assert pg_temp.seen() = 'ad3', 'state broker switched to NC: ' || pg_temp.seen();
  assert (select count(*) from public.checklist where id = 'acl1') = 1, 'state broker sees the deal checklist';
  assert (select count(*) from public.checklist where id = 'acl2') = 0, 'state broker does not see onboarding';
end $$;
-- ...and can't give themselves more states.
do $$ begin
  begin
    update public.profiles set managed_states = '["NC","FL","GA"]' where email = 'asb@x.com';
    assert false, 'state broker changed own states';
  exception when raise_exception then null; end;
end $$;
reset role;
-- An agent with managed states set but not the State broker role sees nothing extra.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a001','aown@x.com');
update public.profiles set managed_states = '["NC"]' where email = 'aag1@x.com';
select pg_temp.as_user('00000000-0000-0000-0000-00000000a005','aag1@x.com'); set role authenticated;
do $$ begin assert pg_temp.seen() = 'ad1', 'agent 1 sees own only: ' || pg_temp.seen(); end $$;
reset role;

-- Team leader (role, on team B): only agent 2's deal; can edit it.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a003','atl@x.com'); set role authenticated;
do $$ declare n int; begin
  assert pg_temp.seen() = 'ad2', 'team leader sees team B: ' || pg_temp.seen();
  update public.transaction set status = 'pending' where id = 'ad2';
  get diagnostics n = row_count;
  assert n = 1, 'team leader can edit their agent''s deal';
end $$;
reset role;
-- Leader named on the Teams page (agent role) for team A: agent 1's deal plus their own (none).
select pg_temp.as_user('00000000-0000-0000-0000-00000000a009','alead@x.com'); set role authenticated;
do $$ begin assert pg_temp.seen() = 'ad1', 'team page leader sees team A: ' || pg_temp.seen(); end $$;
reset role;

-- TC role: every deal, can edit, but not onboarding checklists or non-deal documents.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a004','atc@x.com'); set role authenticated;
do $$ declare n int; begin
  assert pg_temp.seen() = 'ad1,ad2,ad3', 'tc sees all: ' || pg_temp.seen();
  update public.transaction set status = 'pending' where id = 'ad3';
  get diagnostics n = row_count;
  assert n = 1, 'tc can edit any deal';
  delete from public.transaction where id = 'ad3';
  get diagnostics n = row_count;
  assert n = 0, 'tc cannot delete';
  assert (select count(*) from public.checklist where id = 'acl1') = 1, 'tc sees deal checklist';
  assert (select count(*) from public.checklist where id = 'acl2') = 0, 'tc does not see onboarding';
  assert (select count(*) from public.esign_document where id = 'aes1') = 1, 'tc sees deal document';
  assert (select count(*) from public.esign_document where id = 'aes2') = 0, 'tc does not see non-deal document';
end $$;
reset role;

-- Compliance duty on an agent: every deal.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a008','acomp@x.com'); set role authenticated;
do $$ begin assert pg_temp.seen() = 'ad1,ad2,ad3', 'compliance sees all: ' || pg_temp.seen(); end $$;
reset role;

-- Plain agent: own only. TC in another brokerage: nothing.
select pg_temp.as_user('00000000-0000-0000-0000-00000000a007','aag3@x.com'); set role authenticated;
do $$ begin assert pg_temp.seen() = 'ad3', 'agent 3 sees own: ' || pg_temp.seen(); end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000a00a','aoth@other.com'); set role authenticated;
do $$ begin assert pg_temp.seen() = '', 'other brokerage tc sees none: ' || pg_temp.seen(); end $$;
reset role;

delete from public.esign_document where id like 'aes%';
delete from public.checklist where id like 'acl%';
delete from public.transaction where id like 'ad%';
select 'access levels: all checks passed';
