-- 0018: Stories (like Instagram/Facebook): photos, 30-second videos, text, broker announcements
-- pinned to the front, and automatic celebrations (closings, new listings, certifications,
-- work anniversaries, new agents). Seen only inside the brokerage; gone when they expire.

-- Story -----------------------------------------------------------------
create table if not exists public.story (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  author_email text,
  author_name text,
  author_photo text,
  auto_key text,
  auto_type text,
  bg_color text,
  brokerage_id text,
  caption text,
  duration_seconds integer,
  expires_at timestamptz,
  image_url text,
  kind text,
  link text,
  media_type text,
  media_url text,
  pinned boolean,
  subtitle text,
  title text,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.story add column if not exists author_email text;
alter table public.story add column if not exists author_name text;
alter table public.story add column if not exists author_photo text;
alter table public.story add column if not exists auto_key text;
alter table public.story add column if not exists auto_type text;
alter table public.story add column if not exists bg_color text;
alter table public.story add column if not exists brokerage_id text;
alter table public.story add column if not exists caption text;
alter table public.story add column if not exists duration_seconds integer;
alter table public.story add column if not exists expires_at timestamptz;
alter table public.story add column if not exists image_url text;
alter table public.story add column if not exists kind text;
alter table public.story add column if not exists link text;
alter table public.story add column if not exists media_type text;
alter table public.story add column if not exists media_url text;
alter table public.story add column if not exists pinned boolean;
alter table public.story add column if not exists subtitle text;
alter table public.story add column if not exists title text;
drop trigger if exists story_touch on public.story;
create trigger story_touch before update on public.story for each row execute function public.touch_updated_date();
drop trigger if exists story_fill on public.story;
create trigger story_fill before insert on public.story for each row execute function public.fill_owner();
alter table public.story enable row level security;
create index if not exists story_brokerage_id_idx on public.story (brokerage_id);

-- StoryView -------------------------------------------------------------
create table if not exists public.story_view (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  brokerage_id text,
  reaction text,
  story_id text,
  viewer_email text,
  viewer_name text,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.story_view add column if not exists brokerage_id text;
alter table public.story_view add column if not exists reaction text;
alter table public.story_view add column if not exists story_id text;
alter table public.story_view add column if not exists viewer_email text;
alter table public.story_view add column if not exists viewer_name text;
drop trigger if exists story_view_touch on public.story_view;
create trigger story_view_touch before update on public.story_view for each row execute function public.touch_updated_date();
drop trigger if exists story_view_fill on public.story_view;
create trigger story_view_fill before insert on public.story_view for each row execute function public.fill_owner();
alter table public.story_view enable row level security;
create index if not exists story_view_brokerage_id_idx on public.story_view (brokerage_id);

create index if not exists story_live_idx on public.story (brokerage_id, expires_at desc);
create unique index if not exists story_auto_key_idx on public.story (brokerage_id, auto_key) where auto_key is not null;
create unique index if not exists story_view_once_idx on public.story_view (story_id, viewer_email);

drop policy if exists story_access on public.story;
create policy story_access on public.story for select using ((brokerage_id = public.auth_brokerage_id() and expires_at > now()) or public.is_super_admin());
drop policy if exists story_delete on public.story;
create policy story_delete on public.story for delete using ((brokerage_id = public.auth_brokerage_id() and (lower(author_email) = public.auth_email() or public.is_brokerage_admin())) or public.is_super_admin());
drop policy if exists story_view_access on public.story_view;
create policy story_view_access on public.story_view for select using (lower(viewer_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or exists (select 1 from public.story s where s.id = story_view.story_id and lower(s.author_email) = public.auth_email()))) or public.is_super_admin());
drop policy if exists story_view_insert on public.story_view;
drop policy if exists story_view_update on public.story_view;
create policy story_view_insert on public.story_view for insert with check (lower(viewer_email) = public.auth_email() and brokerage_id = public.auth_brokerage_id() and exists (select 1 from public.story s where s.id = story_view.story_id and s.brokerage_id = public.auth_brokerage_id()));
create policy story_view_update on public.story_view for update using (lower(viewer_email) = public.auth_email()) with check (lower(viewer_email) = public.auth_email() and brokerage_id = public.auth_brokerage_id());

-- A deal's status changing (e.g. to Closed) now reaches the automations: celebration stories, and
-- the "Just sold" listing kit, which until now only ran when a deal's people changed.
drop trigger if exists automation_transaction_status on public.transaction;
create trigger automation_transaction_status after update of status on public.transaction
  for each row when (old.status is distinct from new.status)
  execute function private.on_row_change();

-- Hourly: agents' new listings in the MLS feed. Daily (9:05 a.m. Eastern): work anniversaries and
-- clearing out expired stories and their files.
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname in ('stories-hourly', 'stories-daily'); end $$;
select cron.schedule('stories-hourly', '23 * * * *', $$ select private.call_app('/api/fn/stories', '{"scan": true}'::jsonb) $$);
select cron.schedule('stories-daily', '5 13 * * *', $$ select private.call_app('/api/fn/stories', '{"daily": true}'::jsonb) $$);
