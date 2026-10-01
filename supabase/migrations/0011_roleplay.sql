-- Sales coach voice role-play: each practice call, its transcript and scorecard. Run after 0001-0010.
-- Safe to run again.

-- RoleplaySession -------------------------------------------------------
create table if not exists public.roleplay_session (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  agent_email text,
  agent_name text,
  brokerage_id text,
  difficulty text,
  duration_seconds integer,
  ended_at timestamptz,
  scenario text,
  scenario_title text,
  score integer,
  scorecard jsonb,
  started_at timestamptz,
  status text,
  transcript jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.roleplay_session add column if not exists agent_email text;
alter table public.roleplay_session add column if not exists agent_name text;
alter table public.roleplay_session add column if not exists brokerage_id text;
alter table public.roleplay_session add column if not exists difficulty text;
alter table public.roleplay_session add column if not exists duration_seconds integer;
alter table public.roleplay_session add column if not exists ended_at timestamptz;
alter table public.roleplay_session add column if not exists scenario text;
alter table public.roleplay_session add column if not exists scenario_title text;
alter table public.roleplay_session add column if not exists score integer;
alter table public.roleplay_session add column if not exists scorecard jsonb;
alter table public.roleplay_session add column if not exists started_at timestamptz;
alter table public.roleplay_session add column if not exists status text;
alter table public.roleplay_session add column if not exists transcript jsonb;
drop trigger if exists roleplay_session_touch on public.roleplay_session;
create trigger roleplay_session_touch before update on public.roleplay_session for each row execute function public.touch_updated_date();
drop trigger if exists roleplay_session_fill on public.roleplay_session;
create trigger roleplay_session_fill before insert on public.roleplay_session for each row execute function public.fill_owner();
alter table public.roleplay_session enable row level security;
create index if not exists roleplay_session_brokerage_id_idx on public.roleplay_session (brokerage_id);
create index if not exists roleplay_session_agent_email_idx on public.roleplay_session (agent_email);

-- Security: the agent's own practice calls, plus brokerage admins (and anyone with company reports).
drop policy if exists roleplay_session_access on public.roleplay_session;
create policy roleplay_session_access on public.roleplay_session for select using (lower(agent_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('reports.company'))) or public.is_super_admin());
-- roleplay_session: written only by the salesRoleplay server route.
