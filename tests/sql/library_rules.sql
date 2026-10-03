\set ON_ERROR_STOP 1
-- Company library (0021): everyone sees shared folders and their files; private folders only for
-- admins, people allowed every private folder, and the folder's chosen people. Only library managers
-- change anything. Old files land in folders named after their category.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000c1','lown@x.com'),('00000000-0000-0000-0000-0000000000c2','lann@x.com'),
 ('00000000-0000-0000-0000-0000000000c3','lbob@x.com'),('00000000-0000-0000-0000-0000000000c4','leve@y.com'),('00000000-0000-0000-0000-0000000000c5','ltom@x.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id,permissions) values
 ('00000000-0000-0000-0000-0000000000c1','lown@x.com','Own','owner','LB1','{}'),('00000000-0000-0000-0000-0000000000c2','lann@x.com','Ann','agent','LB1','{}'),
 ('00000000-0000-0000-0000-0000000000c3','lbob@x.com','Bob','agent','LB1','{}'),('00000000-0000-0000-0000-0000000000c4','leve@y.com','Eve','agent','LB2','{}'),
 ('00000000-0000-0000-0000-0000000000c5','ltom@x.com','Tom','agent','LB1','{"library.manage": true}')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id, permissions = excluded.permissions;

-- Old files with categories, then the migration's backfill runs again.
insert into public.file_repository (id, brokerage_id, file_name, file_url, category) values
 ('old1','LB1','ICA.pdf','/api/file?p=a','contract'),('old2','LB1','Handbook.pdf','/api/file?p=b','policy'),('old3','LB1','Misc.pdf','/api/file?p=c',null),
 ('old4','LB2','Other.pdf','/api/file?p=d','contract');
\i supabase/migrations/0021_company_library.sql
do $$ begin
  assert (select count(*) from public.library_folder where brokerage_id = 'LB1') = 3, 'three folders for LB1';
  assert (select name from public.library_folder lf join public.file_repository f on f.folder_id = lf.id where f.id = 'old1') = 'Contracts & forms', 'contract folder';
  assert (select name from public.library_folder lf join public.file_repository f on f.folder_id = lf.id where f.id = 'old3') = 'Other', 'no category -> Other';
  assert (select lf.brokerage_id from public.library_folder lf join public.file_repository f on f.folder_id = lf.id where f.id = 'old4') = 'LB2', 'own brokerage folder';
  assert (select count(*) from public.file_repository where folder_id is null) = 0, 'everything filed';
end $$;
\i supabase/migrations/0021_company_library.sql
do $$ begin assert (select count(*) from public.library_folder where brokerage_id = 'LB1') = 3, 'running it again adds nothing'; end $$;

insert into public.library_folder (id, brokerage_id, name, private, member_emails) values
 ('fpub','LB1','Forms',false,null),('fpriv','LB1','Broker only',true,'["lbob@x.com"]');
insert into public.file_repository (id, brokerage_id, file_name, file_url, folder_id) values
 ('f1','LB1','Purchase.pdf','/api/file?p=1','fpub'),('f2','LB1','Payroll.pdf','/api/file?p=2','fpriv');

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

-- Ann (agent): shared folders only, can't change anything.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c2','lann@x.com'); set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.library_folder where id = 'fpriv') = 0, 'private folder hidden';
  assert (select count(*) from public.file_repository where id = 'f2') = 0, 'private file hidden';
  assert (select count(*) from public.file_repository where id = 'f1') = 1, 'shared file seen';
  update public.file_repository set file_name = 'x' where id = 'f1'; get diagnostics n = row_count; assert n = 0, 'agent cannot rename';
  delete from public.file_repository where id = 'f1'; get diagnostics n = row_count; assert n = 0, 'agent cannot delete';
  begin insert into public.library_folder (brokerage_id, name) values ('LB1','Mine'); assert false, 'agent made a folder'; exception when insufficient_privilege then null; end;
  begin insert into public.file_repository (brokerage_id, file_name, folder_id) values ('LB1','x.pdf','fpub'); assert false, 'agent added a file'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Bob: chosen for the private folder.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c3','lbob@x.com'); set role authenticated;
do $$ begin
  assert (select count(*) from public.file_repository where id = 'f2') = 1, 'chosen person sees private file';
end $$;
reset role;

-- Eve: another brokerage.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c4','leve@y.com'); set role authenticated;
do $$ begin
  assert (select count(*) from public.file_repository where brokerage_id = 'LB1') = 0, 'other brokerage sees nothing';
  assert (select count(*) from public.library_folder where brokerage_id = 'LB1') = 0, 'or its folders';
end $$;
reset role;

-- Tom: library manager (not an admin): manages shared folders, but private ones stay hidden.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c5','ltom@x.com'); set role authenticated;
do $$ declare n int; begin
  insert into public.library_folder (brokerage_id, name) values ('LB1','Tom''s');
  update public.file_repository set file_name = 'Purchase agreement.pdf' where id = 'f1'; get diagnostics n = row_count; assert n = 1, 'manager renames';
  update public.file_repository set file_name = 'x' where id = 'f2'; get diagnostics n = row_count; assert n = 0, 'manager cannot touch an unseen private file';
  begin insert into public.library_folder (brokerage_id, name) values ('LB2','Theirs'); assert false, 'other brokerage folder'; exception when insufficient_privilege then null; end;
end $$;
reset role;

-- Owner: everything.
select pg_temp.as_user('00000000-0000-0000-0000-0000000000c1','lown@x.com'); set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.file_repository where id = 'f2') = 1, 'admin sees private';
  update public.library_folder set private = false where id = 'fpriv'; get diagnostics n = row_count; assert n = 1, 'admin edits folder';
  delete from public.file_repository where id = 'f2'; get diagnostics n = row_count; assert n = 1, 'admin deletes';
end $$;
reset role;
select 'library rules ok';
