-- Error alerts: problems in the app (server functions and people's browsers) are recorded here,
-- grouped so the same error counts up instead of filling the table, and the platform owner is
-- emailed a summary when something new goes wrong.
-- Run after 0001-0013. Safe to run again.

create table if not exists public.app_error (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  fingerprint text not null,
  source text not null,            -- 'server' or 'browser'
  location text,                   -- function name, or the page path
  message text,
  detail text,                     -- stack trace or response body (trimmed)
  count integer not null default 1,
  users jsonb not null default '[]'::jsonb,  -- up to 20 emails of people who hit it
  last_url text,
  last_user_agent text,
  brokerage_id text,
  resolved boolean not null default false,
  notified_at timestamptz,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create unique index if not exists app_error_fingerprint_idx on public.app_error (fingerprint);
create index if not exists app_error_open_idx on public.app_error (resolved, last_seen desc);
create index if not exists app_error_first_seen_idx on public.app_error (first_seen);
drop trigger if exists app_error_touch on public.app_error;
create trigger app_error_touch before update on public.app_error for each row execute function public.touch_updated_date();

-- Only the platform owner can read or change these (the server writes them with the service key).
alter table public.app_error enable row level security;
drop policy if exists app_error_super_read on public.app_error;
create policy app_error_super_read on public.app_error for select using (public.is_super_admin());
drop policy if exists app_error_super_update on public.app_error;
create policy app_error_super_update on public.app_error for update using (public.is_super_admin()) with check (public.is_super_admin());
drop policy if exists app_error_super_delete on public.app_error;
create policy app_error_super_delete on public.app_error for delete using (public.is_super_admin());

-- Records one occurrence: a new row, or +1 on the existing one (and reopens it if it was marked fixed).
-- Returns true when this is a new error (or one that came back after being marked fixed).
create or replace function public.log_app_error(
  p_fingerprint text, p_source text, p_location text, p_message text, p_detail text,
  p_user_email text, p_url text, p_user_agent text, p_brokerage_id text
) returns boolean language plpgsql security definer set search_path = public as $$
declare prev boolean;
begin
  select resolved into prev from public.app_error where fingerprint = p_fingerprint;
  insert into public.app_error as e (fingerprint, source, location, message, detail, users, last_url, last_user_agent, brokerage_id)
  values (p_fingerprint, p_source, left(p_location, 300), left(p_message, 2000), left(p_detail, 8000),
          case when coalesce(p_user_email, '') = '' then '[]'::jsonb else jsonb_build_array(lower(p_user_email)) end,
          left(p_url, 1000), left(p_user_agent, 400), p_brokerage_id)
  on conflict (fingerprint) do update set
    count = e.count + 1,
    last_seen = now(),
    message = excluded.message,
    detail = coalesce(excluded.detail, e.detail),
    last_url = coalesce(excluded.last_url, e.last_url),
    last_user_agent = coalesce(excluded.last_user_agent, e.last_user_agent),
    brokerage_id = coalesce(excluded.brokerage_id, e.brokerage_id),
    users = case
      when coalesce(p_user_email, '') = '' or e.users ? lower(p_user_email) or jsonb_array_length(e.users) >= 20 then e.users
      else e.users || jsonb_build_array(lower(p_user_email)) end,
    resolved = false,
    -- A fixed error that comes back is news again.
    notified_at = case when e.resolved then null else e.notified_at end;
  return prev is null or prev;
end $$;
revoke all on function public.log_app_error(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.log_app_error(text, text, text, text, text, text, text, text, text) to service_role;
  end if;
end $$;

-- Every 15 minutes: email the platform owner about new errors (nothing is sent when there are none).
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'error-alerts'; end $$;
select cron.schedule('error-alerts', '*/15 * * * *', $$ select private.call_app('/api/fn/appErrors', '{"alert": true}'::jsonb) $$);
-- Old fixed errors are cleared out after 90 days.
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'error-cleanup'; end $$;
select cron.schedule('error-cleanup', '40 4 * * *', $$ delete from public.app_error where resolved and last_seen < now() - interval '90 days' $$);
