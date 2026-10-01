-- Messaging: unread counts, read receipts and reactions done safely in the database,
-- plus speed-ups. Run after 0001-0005. Safe to run again.

-- Existing channels keep working the way Base44 did: members only (admins see all),
-- except the brokerage-wide default channels, which become public.
update public.channel
   set is_private = not coalesce((extra->>'is_default')::boolean, false)
 where is_private is null;

-- Emails are compared lower-case everywhere; tidy any mixed-case ones from Base44.
update public.direct_message set sender_email = lower(sender_email), receiver_email = lower(receiver_email)
 where sender_email <> lower(sender_email) or receiver_email <> lower(receiver_email);
update public.social_message set sender_email = lower(sender_email) where sender_email <> lower(sender_email);
update public.group_message set sender_email = lower(sender_email) where sender_email <> lower(sender_email);
update public.thread_reply set sender_email = lower(sender_email) where sender_email <> lower(sender_email);

-- Per person, per conversation: when they last read it.
create unique index if not exists chat_read_state_unique on public.chat_read_state (lower(user_email), kind, conv_key);

create index if not exists social_message_channel_time on public.social_message (brokerage_id, channel, created_date desc);
create index if not exists thread_reply_message_time on public.thread_reply (message_id, created_date);
create index if not exists direct_message_pair_time on public.direct_message (lower(sender_email), lower(receiver_email), created_date desc);
create index if not exists direct_message_unread on public.direct_message (lower(receiver_email)) where read is not true;
create index if not exists group_message_group_time on public.group_message (group_id, created_date desc);
create index if not exists call_brokerage_time on public.call (brokerage_id, created_date desc);

-- Messages no longer create a notification for every person on every message (that flooded
-- the bell and leaked private channels). Unread badges replace it; @mentions still notify.
drop trigger if exists automation_social_message on public.social_message;

-- Can the signed-in user see this message? (kind = table name)
create or replace function public.chat_can_see(p_kind text, p_id text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare ok boolean := false;
begin
  if p_kind = 'social_message' then
    select public.can_see_channel(m.brokerage_id, m.channel) into ok from public.social_message m where m.id = p_id;
  elsif p_kind = 'thread_reply' then
    select public.can_see_channel(m.brokerage_id, m.channel) into ok
      from public.thread_reply r join public.social_message m on m.id = r.message_id where r.id = p_id;
  elsif p_kind = 'direct_message' then
    select lower(d.sender_email) = public.auth_email() or lower(d.receiver_email) = public.auth_email() into ok
      from public.direct_message d where d.id = p_id;
  elsif p_kind = 'group_message' then
    select public.in_members(g.members) into ok
      from public.group_message gm join public.group_chat g on g.id = gm.group_id where gm.id = p_id;
  end if;
  return coalesce(ok, false);
end $$;

-- Add or remove my reaction. Done in one locked step so two people reacting at once
-- can't overwrite each other. Reactions: [{"emoji": "👍", "users": ["a@x.com"]}]
create or replace function public.chat_toggle_reaction(p_kind text, p_id text, p_emoji text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur jsonb; nxt jsonb := '[]'::jsonb; me text := public.auth_email(); r jsonb; users jsonb; found boolean := false;
begin
  if p_kind not in ('social_message', 'thread_reply', 'direct_message', 'group_message') then raise exception 'bad kind'; end if;
  if me = '' or not public.chat_can_see(p_kind, p_id) then raise exception 'not allowed'; end if;
  if length(coalesce(p_emoji, '')) = 0 or length(p_emoji) > 16 then raise exception 'bad emoji'; end if;
  execute format('select coalesce(reactions, ''[]''::jsonb) from public.%I where id = $1 for update', p_kind) into cur using p_id;
  for r in select * from jsonb_array_elements(coalesce(cur, '[]'::jsonb)) loop
    if r->>'emoji' = p_emoji then
      found := true;
      if (r->'users') ? me then
        select coalesce(jsonb_agg(u), '[]'::jsonb) into users from jsonb_array_elements(r->'users') u where u #>> '{}' <> me;
      else
        users := coalesce(r->'users', '[]'::jsonb) || to_jsonb(me);
      end if;
      if jsonb_array_length(users) > 0 then nxt := nxt || jsonb_build_array(jsonb_build_object('emoji', p_emoji, 'users', users)); end if;
    else
      nxt := nxt || jsonb_build_array(r);
    end if;
  end loop;
  if not found then nxt := nxt || jsonb_build_array(jsonb_build_object('emoji', p_emoji, 'users', jsonb_build_array(me))); end if;
  execute format('update public.%I set reactions = $1 where id = $2', p_kind) using nxt, p_id;
  return nxt;
end $$;

-- Mark a conversation read up to now. kind: channel (key = channel name), dm (key = the other
-- person's email), group (key = group id), thread (key = parent message id).
create or replace function public.chat_mark_read(p_kind text, p_key text) returns void
language plpgsql security definer set search_path = public as $$
declare me text := public.auth_email(); b text := public.auth_brokerage_id();
begin
  if me = '' or b is null then return; end if;
  if p_kind = 'channel' and not public.can_see_channel(b, p_key) then raise exception 'not allowed'; end if;
  if p_kind = 'group' and not exists (select 1 from public.group_chat g where g.id = p_key and public.in_members(g.members)) then raise exception 'not allowed'; end if;
  if p_kind not in ('channel', 'dm', 'group', 'thread') then raise exception 'bad kind'; end if;
  insert into public.chat_read_state (brokerage_id, user_email, kind, conv_key, last_read_at)
  values (b, me, p_kind, p_key, now())
  on conflict (lower(user_email), kind, conv_key) do update set last_read_at = excluded.last_read_at;
  if p_kind = 'dm' then
    update public.direct_message set read = true
     where lower(receiver_email) = me and lower(sender_email) = lower(p_key) and read is not true;
  end if;
end $$;

-- Unread counts for the sidebar: every channel I can see, every DM partner and group.
create or replace function public.chat_unread() returns table (kind text, conv_key text, unread integer, mentions integer, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  with me as (select public.auth_email() as email, public.auth_brokerage_id() as b),
  reads as (select r.kind, r.conv_key, r.last_read_at from public.chat_read_state r, me where lower(r.user_email) = me.email)
  select 'channel', c.name,
         (select count(*)::int from public.social_message m
           where m.brokerage_id = me.b and m.channel = c.name and lower(m.sender_email) <> me.email
             and m.created_date > coalesce((select last_read_at from reads where kind = 'channel' and conv_key = c.name), now() - interval '14 days')),
         (select count(*)::int from public.social_message m
           where m.brokerage_id = me.b and m.channel = c.name and lower(m.sender_email) <> me.email
             and (m.mentions ? me.email or m.mentions ? 'channel')
             and m.created_date > coalesce((select last_read_at from reads where kind = 'channel' and conv_key = c.name), now() - interval '14 days')),
         (select max(m.created_date) from public.social_message m where m.brokerage_id = me.b and m.channel = c.name)
    from public.channel c, me
   where c.brokerage_id = me.b and public.can_see_channel(c.brokerage_id, c.name)
  union all
  select 'dm', lower(d.sender_email), count(*)::int, count(*)::int, max(d.created_date)
    from public.direct_message d, me
   where lower(d.receiver_email) = me.email and d.read is not true
   group by lower(d.sender_email)
  union all
  select 'group', g.id,
         (select count(*)::int from public.group_message gm
           where gm.group_id = g.id and lower(gm.sender_email) <> me.email
             and gm.created_date > coalesce((select last_read_at from reads where kind = 'group' and conv_key = g.id), g.created_date)),
         (select count(*)::int from public.group_message gm
           where gm.group_id = g.id and lower(gm.sender_email) <> me.email and gm.mentions ? me.email
             and gm.created_date > coalesce((select last_read_at from reads where kind = 'group' and conv_key = g.id), g.created_date)),
         (select max(gm.created_date) from public.group_message gm where gm.group_id = g.id)
    from public.group_chat g, me
   where g.brokerage_id = me.b and public.in_members(g.members)
$$;

-- Who has read a channel or group, and when (for "Seen by" under my latest message).
create or replace function public.chat_readers(p_kind text, p_key text) returns table (user_email text, last_read_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare b text := public.auth_brokerage_id();
begin
  if p_kind = 'channel' and not public.can_see_channel(b, p_key) then return; end if;
  if p_kind = 'group' and not exists (select 1 from public.group_chat g where g.id = p_key and public.in_members(g.members)) then return; end if;
  if p_kind not in ('channel', 'group') then return; end if;
  return query select lower(r.user_email), r.last_read_at from public.chat_read_state r
   where r.brokerage_id = b and r.kind = p_kind and r.conv_key = p_key;
end $$;

grant execute on function public.chat_toggle_reaction(text, text, text) to authenticated;
grant execute on function public.chat_mark_read(text, text) to authenticated;
grant execute on function public.chat_unread() to authenticated;
grant execute on function public.chat_readers(text, text) to authenticated;
revoke execute on function public.chat_toggle_reaction(text, text, text) from anon;
revoke execute on function public.chat_mark_read(text, text) from anon;
revoke execute on function public.chat_unread() from anon;
revoke execute on function public.chat_readers(text, text) from anon;

-- Deal chats follow the deal: when the agent, co-agents or TC change, update the chat.
drop trigger if exists automation_transaction_people on public.transaction;
create trigger automation_transaction_people after update of agent_email, tc_email, co_agents on public.transaction
  for each row when (old.agent_email is distinct from new.agent_email or old.tc_email is distinct from new.tc_email or old.co_agents is distinct from new.co_agents)
  execute function private.on_row_change();
create index if not exists group_chat_transaction on public.group_chat (transaction_id);

-- Phone/desktop push for new DMs and group messages.
drop trigger if exists automation_direct_message on public.direct_message;
create trigger automation_direct_message after insert on public.direct_message
  for each row execute function private.on_row_change();
drop trigger if exists automation_group_message on public.group_message;
create trigger automation_group_message after insert on public.group_message
  for each row execute function private.on_row_change();
create unique index if not exists push_subscription_endpoint on public.push_subscription (endpoint);

-- Morning digest of unread messages and mentions (12:00 UTC = 8am Eastern).
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'chat-digest'; end $$;
select cron.schedule('chat-digest', '0 12 * * *', $$ select private.call_app('/api/fn/chatDigest') $$);

-- Finish AI call notes after calls end (every 5 minutes).
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'call-notes'; end $$;
select cron.schedule('call-notes', '*/5 * * * *', $$ select private.call_app('/api/fn/callNotes') $$);
