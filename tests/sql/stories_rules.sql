\set ON_ERROR_STOP 1
-- Stories (0018): the brokerage sees live stories only; nobody posts directly (the server does);
-- authors and admins remove; views are your own, and the author and admins see who watched.
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000a1','sown@x.com'),('00000000-0000-0000-0000-0000000000a2','sann@x.com'),
 ('00000000-0000-0000-0000-0000000000a3','sbob@x.com'),('00000000-0000-0000-0000-0000000000a4','seve@y.com') on conflict do nothing;
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-0000000000a1','sown@x.com','Own','owner','SB1'),('00000000-0000-0000-0000-0000000000a2','sann@x.com','Ann','agent','SB1'),
 ('00000000-0000-0000-0000-0000000000a3','sbob@x.com','Bob','agent','SB1'),('00000000-0000-0000-0000-0000000000a4','seve@y.com','Eve','agent','SB2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.story (id,brokerage_id,author_email,kind,caption,expires_at) values
 ('st1','SB1','sann@x.com','text','hi', now() + interval '1 day'),
 ('st2','SB1','sann@x.com','text','old', now() - interval '1 hour'),
 ('st3','SB1','sbob@x.com','text','bob', now() + interval '1 day');
create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a3','sbob@x.com'); set role authenticated;
do $$ declare n int; begin
  assert (select string_agg(id, ',' order by id) from public.story where id like 'st%') = 'st1,st3', 'live stories only';
  begin insert into public.story (brokerage_id,author_email,kind,caption,expires_at,pinned) values ('SB1','sbob@x.com','text','x', now() + interval '30 days', true);
    assert false, 'posted directly'; exception when insufficient_privilege then null; end;
  delete from public.story where id = 'st1'; get diagnostics n = row_count; assert n = 0, 'not someone else''s';
  insert into public.story_view (brokerage_id, story_id, viewer_email, reaction) values ('SB1','st1','sbob@x.com','🔥');
  begin insert into public.story_view (brokerage_id, story_id, viewer_email) values ('SB1','st1','sann@x.com');
    assert false, 'viewed as someone else'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a2','sann@x.com'); set role authenticated;
do $$ begin
  assert (select count(*) from public.story_view where story_id = 'st1') = 1, 'author sees who watched';
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a4','seve@y.com'); set role authenticated;
do $$ begin
  assert (select count(*) from public.story where id like 'st%') = 0, 'other brokerage sees none';
  assert (select count(*) from public.story_view) = 0, 'or their views';
  begin insert into public.story_view (brokerage_id, story_id, viewer_email) values ('SB2','st1','seve@y.com');
    assert false, 'viewed another brokerage''s story'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select pg_temp.as_user('00000000-0000-0000-0000-0000000000a1','sown@x.com'); set role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.story_view where story_id = 'st1') = 1, 'admin sees who watched';
  delete from public.story where id = 'st3'; get diagnostics n = row_count; assert n = 1, 'admin removes';
end $$;
reset role;
delete from public.story_view where story_id like 'st%'; delete from public.story where id like 'st%';
select 'stories rules: all checks passed';
