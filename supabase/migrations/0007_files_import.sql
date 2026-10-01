-- Imports and app-managed secrets (private files themselves use the private-files bucket
-- from 0001). Run after 0001-0006. Safe to run again.

-- Secrets the server creates for itself (e.g. the push notification keys). No security
-- rules are added, so only the server (service role) can read or write this table.
create table if not exists public.app_secret (
  name text primary key,
  value jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.app_secret enable row level security;
revoke all on public.app_secret from anon, authenticated;

-- Imports look records up by these (so running an import again doesn't duplicate anything).
create index if not exists commission_record_import_key on public.commission_record ((extra ->> 'import_key'));
create index if not exists commission_record_import_batch on public.commission_record ((extra ->> 'import_batch'));
create index if not exists transaction_import_key on public.transaction ((extra ->> 'import_key'));
create index if not exists profiles_legacy_id on public.profiles ((extra ->> 'legacy_id'));
