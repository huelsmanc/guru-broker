-- Automations and scheduled jobs (replaces Base44 automations).
-- Run after 0001_init.sql. Then set your app URL and secret once:
--
--   update private.app_config set app_url = 'https://gurubroker.app', hook_secret = '<same as HOOK_SECRET in Vercel>';
--
-- Needs the pg_net and pg_cron extensions (both built into Supabase).

create extension if not exists pg_net;
create extension if not exists pg_cron;

create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.app_config (
  id boolean primary key default true check (id),
  app_url text,
  hook_secret text
);
insert into private.app_config (id) values (true) on conflict do nothing;

-- Calls a backend function on your Vercel app as the system.
create or replace function private.call_app(path text, payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public, private as $$
declare cfg private.app_config;
begin
  select * into cfg from private.app_config limit 1;
  if cfg.app_url is null or cfg.hook_secret is null then
    raise warning 'private.app_config is not set; skipping %', path;
    return;
  end if;
  perform net.http_post(
    url := rtrim(cfg.app_url, '/') || path,
    body := payload,
    headers := jsonb_build_object('content-type', 'application/json', 'x-gbh-service', cfg.hook_secret),
    timeout_milliseconds := 30000
  );
end $$;

-- True for the write an import makes (Import page / import scripts stamp extra.import_run),
-- so old records coming in don't send notifications or fill the activity log. Later edits to
-- an imported record are normal writes.
create or replace function private.is_import_write(rec jsonb, prev jsonb) returns boolean
language sql immutable as $$
  select (rec -> 'extra' ->> 'import_run') is not null
     and (prev is null or (rec -> 'extra' ->> 'import_run') is distinct from (prev -> 'extra' ->> 'import_run'))
$$;

-- Row change -> /api/hooks/db
create or replace function private.on_row_change() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if tg_op <> 'DELETE' and private.is_import_write(to_jsonb(new), case when tg_op = 'UPDATE' then to_jsonb(old) end) then
    return new;
  end if;
  perform private.call_app('/api/hooks/db', jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'INSERT' then null else to_jsonb(old) end
  ));
  return coalesce(new, old);
end $$;

-- (No per-message notifications for channel chat; see 0006_messaging.sql.)
drop trigger if exists automation_social_message on public.social_message;

drop trigger if exists automation_compliance_training on public.compliance_training;
create trigger automation_compliance_training after insert on public.compliance_training
  for each row execute function private.on_row_change();

drop trigger if exists automation_activity_log on public.activity_log;
create trigger automation_activity_log after insert on public.activity_log
  for each row execute function private.on_row_change();

drop trigger if exists automation_esign_document on public.esign_document;
create trigger automation_esign_document after update on public.esign_document
  for each row execute function private.on_row_change();

-- Scheduled jobs (times are UTC)
do $$ begin
  perform cron.unschedule(jobname) from cron.job
   where jobname in ('closing-date-reminders', 'culture-event-reminders', 'signing-reminders');
end $$;

-- Looks for key dates 47-48 hours out, so it runs every hour.
select cron.schedule('closing-date-reminders', '0 * * * *',
  $$ select private.call_app('/api/fn/closingDateReminder') $$);
-- Looks for events 24-26 hours out, so every 2 hours covers every event once.
select cron.schedule('culture-event-reminders', '15 */2 * * *',
  $$ select private.call_app('/api/fn/sendCultureEventReminders') $$);
-- Nudges signers on documents pending 48+ hours; once a day at 9am Eastern.
select cron.schedule('signing-reminders', '0 13 * * *',
  $$ select private.call_app('/api/fn/sendSigningReminders') $$);
