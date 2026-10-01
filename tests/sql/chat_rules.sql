\set ON_ERROR_STOP 1
grant usage on schema auth to authenticated; grant execute on all functions in schema auth to authenticated;
grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to authenticated;
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-00000000000a','admin@x.com'),('00000000-0000-0000-0000-00000000000b','ann@x.com'),
 ('00000000-0000-0000-0000-00000000000c','bob@x.com'),('00000000-0000-0000-0000-00000000000d','eve@other.com');
insert into public.profiles (id,email,full_name,role,brokerage_id) values
 ('00000000-0000-0000-0000-00000000000a','admin@x.com','Admin','admin','B1'),('00000000-0000-0000-0000-00000000000b','ann@x.com','Ann','user','B1'),
 ('00000000-0000-0000-0000-00000000000c','bob@x.com','Bob','user','B1'),('00000000-0000-0000-0000-00000000000d','eve@other.com','Eve','user','B2')
 on conflict (id) do update set role = excluded.role, brokerage_id = excluded.brokerage_id;
insert into public.channel (id,brokerage_id,name,label,is_private) values ('c1','B1','general','General',false),('c2','B1','leadership','Leadership',true);
insert into public.channel_member (brokerage_id,channel_id,user_email) values ('B1','leadership','ann@x.com');
insert into public.social_message (id,brokerage_id,channel,content,sender_email,mentions) values
 ('m1','B1','general','hi all','admin@x.com','["channel"]'),('m2','B1','leadership','secret','admin@x.com','["ann@x.com"]');
insert into public.group_chat (id,brokerage_id,name,members,created_by_email) values ('g1','B1','Ann+Admin','[{"id":"00000000-0000-0000-0000-00000000000b","email":"ann@x.com"},{"email":"admin@x.com"}]','ann@x.com');
insert into public.group_message (id,brokerage_id,group_id,content,sender_email) values ('gm1','B1','g1','group hi','admin@x.com');
insert into public.direct_message (id,brokerage_id,content,sender_email,receiver_email) values ('d1','B1','hey ann','bob@x.com','ann@x.com');

create or replace function pg_temp.as_user(uid text, email text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'email', email, 'aal', 'aal2')::text, false);
end $$;

-- Bob (agent, not in leadership)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','bob@x.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.channel) = 1, 'bob sees only public channel';
  assert (select count(*) from public.social_message) = 1, 'bob cannot read private channel';
  assert (select count(*) from public.group_chat) = 0, 'bob cannot see group he is not in';
  assert (select count(*) from public.group_message) = 0, 'bob cannot read that group';
  assert (select count(*) from public.direct_message) = 1, 'bob sees his DM';
end $$;
do $$ begin
  begin insert into public.social_message (brokerage_id,channel,content,sender_email) values ('B1','leadership','sneak','bob@x.com'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  begin insert into public.social_message (brokerage_id,channel,content,sender_email) values ('B1','general','fake','admin@x.com'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
  begin insert into public.channel_member (brokerage_id,channel_id,user_email) values ('B1','leadership','bob@x.com'); raise exception 'should fail';
  exception when insufficient_privilege then null; end;
end $$;
update public.social_message set content = 'hacked' where id = 'm1';
do $$ begin assert (select content from public.social_message where id='m1') = 'hi all', 'bob cannot edit others'; end $$;
select public.chat_toggle_reaction('social_message','m1','👍');
do $$ begin
  begin perform public.chat_toggle_reaction('social_message','m2','👍'); raise exception 'should fail';
  exception when raise_exception then if sqlerrm <> 'not allowed' then raise; end if; end;
end $$;
insert into public.social_message (brokerage_id,channel,content,sender_email) values ('B1','general','bob here','bob@x.com');
reset role;

-- Ann (member of leadership, in group, has DM)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','ann@x.com');
set role authenticated;
do $$ declare u record; begin
  assert (select count(*) from public.channel) = 2, 'ann sees private channel she is in';
  assert (select count(*) from public.social_message) = 3, 'ann reads general + leadership';
  assert (select count(*) from public.group_message) = 1, 'ann reads her group';
  select * into u from public.chat_unread() where kind = 'channel' and conv_key = 'leadership';
  assert u.unread = 1 and u.mentions = 1, 'leadership unread with mention';
  select * into u from public.chat_unread() where kind = 'channel' and conv_key = 'general';
  assert u.unread = 2 and u.mentions = 1, 'general: 2 unread, @channel counts as mention';
  select * into u from public.chat_unread() where kind = 'dm';
  assert u.conv_key = 'bob@x.com' and u.unread = 1, 'dm unread from bob';
  select * into u from public.chat_unread() where kind = 'group';
  assert u.unread = 1, 'group unread';
end $$;
-- receiver can't edit sender's DM text
update public.direct_message set content = 'changed' where id = 'd1';
do $$ begin assert (select content from public.direct_message where id='d1') = 'hey ann', 'receiver cannot edit DM'; end $$;
select public.chat_mark_read('dm','bob@x.com');
select public.chat_mark_read('channel','general');
select public.chat_mark_read('channel','general');
select public.chat_toggle_reaction('social_message','m1','👍');
select public.chat_toggle_reaction('social_message','m1','🎉');
do $$ declare u record; begin
  assert (select read from public.direct_message where id='d1'), 'dm marked read';
  assert not exists (select 1 from public.chat_unread() where kind = 'dm'), 'no dm unread';
  select * into u from public.chat_unread() where kind = 'channel' and conv_key = 'general';
  assert u.unread = 0, 'general read';
  assert (select reactions from public.social_message where id='m1') = '[{"emoji":"👍","users":["bob@x.com","ann@x.com"]},{"emoji":"🎉","users":["ann@x.com"]}]'::jsonb, (select reactions::text from public.social_message where id='m1');
  assert (select count(*) from public.chat_readers('channel','general')) = 1, 'readers';
end $$;
select public.chat_toggle_reaction('social_message','m1','👍');
do $$ begin assert (select reactions from public.social_message where id='m1') = '[{"emoji":"👍","users":["bob@x.com"]},{"emoji":"🎉","users":["ann@x.com"]}]'::jsonb, 'toggle off'; end $$;
reset role;

-- Eve (other brokerage)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d','eve@other.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.channel) = 0 and (select count(*) from public.social_message) = 0, 'eve sees nothing';
  assert (select count(*) from public.chat_readers('channel','general')) = 0, 'eve no readers';
end $$;
reset role;

-- Admin sees private channel without membership; can pin others' messages
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','admin@x.com');
set role authenticated;
update public.social_message set pinned = true where content = 'bob here';
do $$ begin
  assert (select count(*) from public.social_message) = 3;
  assert (select pinned from public.social_message where content = 'bob here'), 'admin pins';
  assert (select count(*) from public.group_message) = 1, 'admin is in the group';
  assert (select count(*) from public.direct_message) = 0, 'admins do not read other people''s DMs';
end $$;
reset role;
select 'chat rules: all checks passed';
-- Support chat privacy
insert into public.conversation (id,brokerage_id,agent_email,title) values ('cv1','B1','ann@x.com','Ann question');
insert into public.message (id,brokerage_id,conversation_id,content,sender_email) values ('ms1','B1','cv1','help','ann@x.com');
insert into public.admin_message (id,brokerage_id,content,sender_email) values ('am1','B1','brokers only','admin@x.com');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c','bob@x.com');
set role authenticated;
do $$ begin
  assert (select count(*) from public.conversation) = 0 and (select count(*) from public.message) = 0, 'bob cannot read ann support chat';
  assert (select count(*) from public.admin_message) = 0, 'agents cannot read broker chat';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b','ann@x.com');
set role authenticated;
do $$ begin assert (select count(*) from public.message) = 1, 'ann reads her own'; end $$;
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a','admin@x.com');
set role authenticated;
do $$ begin assert (select count(*) from public.message) = 1 and (select count(*) from public.admin_message) = 1, 'admin sees support + broker chat'; end $$;
reset role;
select 'support chat rules: all checks passed';
