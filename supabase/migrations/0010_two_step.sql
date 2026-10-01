-- 2-step sign-in (authenticator app or emailed code).
-- Brokers, office admins, owners, accounting and the super admin must confirm a second step after
-- signing in; agents too when they turn it on or their brokerage requires it. Until they do, the
-- database shows that sign-in no data. Run after 0001-0009. Safe to run again.

-- 2-step sign-in. Brokers, admins, accounting, and anyone who turns it on (or every agent
-- when the brokerage requires it) must confirm a second step after signing in: an
-- authenticator app code (Supabase MFA, the sign-in becomes "aal2") or a code emailed to them
-- (the server then records that sign-in session as confirmed). Until then the security
-- helpers below return nothing, so the database shows them no data at all.
create table if not exists public.second_step_session (
  user_id uuid not null,
  session_id text not null,
  method text,
  confirmed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (user_id, session_id)
);
alter table public.second_step_session enable row level security; -- server only
create table if not exists public.trusted_device (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  user_id uuid not null,
  token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null
);
create index if not exists trusted_device_user_idx on public.trusted_device (user_id);
alter table public.trusted_device enable row level security; -- server only
create table if not exists public.second_step_code (
  user_id uuid primary key,
  code_hash text not null,
  sent_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.second_step_code enable row level security; -- server only

-- Must this person confirm a second step?
create or replace function public.second_step_needed(p_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare p record; brokerage_rule boolean;
begin
  select role, brokerage_id, permissions, coalesce((to_jsonb(pr)->'extra'->>'mfa_enabled')::boolean, false) as opted
    into p from public.profiles pr where pr.id = p_uid;
  if not found then return false; end if;
  if p.opted then return true; end if;
  if p.role = 'super_admin' or public.normalize_role(p.role) in ('owner', 'broker', 'office_admin') then return true; end if;
  if coalesce(case when p.permissions ? 'accounting.access' then (p.permissions ->> 'accounting.access')::boolean
                   else public.perm_default(p.role, 'accounting.access') end, false) then return true; end if;
  select coalesce((s.extra->>'require_2fa_all')::boolean, false) into brokerage_rule
    from public.brokerage_settings s where s.brokerage_id = p.brokerage_id order by s.created_date limit 1;
  return coalesce(brokerage_rule, false);
end $$;

-- Has this sign-in done its second step (or doesn't it need one)? Remembered for the
-- rest of the database request, so long lists don't repeat the check per row.
create or replace function public.second_step_ok() returns boolean
language plpgsql stable security definer set search_path = public as $$
declare uid uuid := auth.uid(); sid text; cache text; ok boolean;
begin
  if uid is null then return true; end if; -- signed-out visitors: the rules themselves decide
  if coalesce(auth.jwt()->>'aal', '') = 'aal2' then return true; end if;
  sid := coalesce(auth.jwt()->>'session_id', '');
  cache := current_setting('gbh.second_step', true);
  if cache is not null and cache <> '' and split_part(cache, '|', 1) = uid::text || ':' || sid then
    return split_part(cache, '|', 2) = 't';
  end if;
  ok := not public.second_step_needed(uid)
        or exists (select 1 from public.second_step_session s where s.user_id = uid and s.session_id = sid and s.expires_at > now());
  perform set_config('gbh.second_step', uid::text || ':' || sid || '|' || case when ok then 't' else 'f' end, true);
  return ok;
end $$;

create or replace function public.auth_email() returns text language sql stable as $$
  select case when public.second_step_ok() then lower(coalesce(auth.jwt()->>'email', '')) else '' end
$$;
create or replace function public.auth_brokerage_id() returns text
language sql stable security definer set search_path = public as $$
  select brokerage_id from public.profiles where id = auth.uid() and public.second_step_ok()
$$;
create or replace function public.auth_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and public.second_step_ok()
$$;
create or replace function public.has_perm(key text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case when p.permissions ? key then (p.permissions ->> key)::boolean
                 else public.perm_default(p.role, key) end
       from public.profiles p where p.id = auth.uid() and public.second_step_ok()),
    false)
$$;
create or replace function public.auth_team_id() returns text
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid() and public.second_step_ok()
$$;
create or replace function public.in_members(p_members jsonb) returns boolean
language sql stable as $$
  select exists (select 1 from jsonb_array_elements(coalesce(p_members, '[]'::jsonb)) m
                 where lower(m->>'email') = public.auth_email() or (m->>'id' = auth.uid()::text and public.second_step_ok()))
$$;
