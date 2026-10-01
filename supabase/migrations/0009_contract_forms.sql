-- Contract forms library: blank state forms (purchase agreement, listing agreement, buyer
-- representation, disclosures) with their boxes set up once. brokerage_id 'platform' = a form
-- the platform owner manages, shown only to brokerages assigned to that state (brokerage.states).
-- Run after 0001-0008. Safe to run again.

alter table public.brokerage add column if not exists states jsonb;

-- ContractForm ----------------------------------------------------------
create table if not exists public.contract_form (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  brokerage_id text,
  created_by_email text,
  description text,
  document_url text,
  fields jsonb,
  form_type text,
  form_version text,
  is_active boolean,
  name text,
  page_count text,
  roles jsonb,
  state text,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.contract_form add column if not exists brokerage_id text;
alter table public.contract_form add column if not exists created_by_email text;
alter table public.contract_form add column if not exists description text;
alter table public.contract_form add column if not exists document_url text;
alter table public.contract_form add column if not exists fields jsonb;
alter table public.contract_form add column if not exists form_type text;
alter table public.contract_form add column if not exists form_version text;
alter table public.contract_form add column if not exists is_active boolean;
alter table public.contract_form add column if not exists name text;
alter table public.contract_form add column if not exists page_count text;
alter table public.contract_form add column if not exists roles jsonb;
alter table public.contract_form add column if not exists state text;
drop trigger if exists contract_form_touch on public.contract_form;
create trigger contract_form_touch before update on public.contract_form for each row execute function public.touch_updated_date();
drop trigger if exists contract_form_fill on public.contract_form;
create trigger contract_form_fill before insert on public.contract_form for each row execute function public.fill_owner();
alter table public.contract_form enable row level security;
create index if not exists contract_form_brokerage_id_idx on public.contract_form (brokerage_id);

-- Contract forms: is the signed-in user's brokerage assigned to this state? -------
create or replace function public.brokerage_in_state(p_state text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.brokerage b where b.id = public.auth_brokerage_id()
                 and coalesce(b.states, '[]'::jsonb) ? upper(coalesce(p_state, '')))
$$;
-- Only the platform owner assigns a brokerage's states (they decide which state forms it gets).
create or replace function public.guard_brokerage_states() returns trigger language plpgsql as $$
begin
  if auth.uid() is null or public.is_super_admin() then return new; end if;
  if tg_op = 'INSERT' then new.states := '[]'::jsonb;
  elsif coalesce(new.states, '[]'::jsonb) is distinct from coalesce(old.states, '[]'::jsonb) then new.states := old.states;
  end if;
  return new;
end $$;
drop trigger if exists brokerage_states_guard on public.brokerage;
create trigger brokerage_states_guard before insert or update on public.brokerage for each row execute function public.guard_brokerage_states();

-- Security: platform forms for brokerages in that state; a brokerage's own forms for its
-- members; brokerage admins manage their own; only the super admin manages platform forms.
drop policy if exists contract_form_access on public.contract_form;
create policy contract_form_access on public.contract_form for select using ((brokerage_id = 'platform' and public.brokerage_in_state(contract_form.state)) or brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
drop policy if exists contract_form_insert on public.contract_form;
drop policy if exists contract_form_update on public.contract_form;
drop policy if exists contract_form_delete on public.contract_form;
create policy contract_form_insert on public.contract_form for insert with check ((brokerage_id = public.auth_brokerage_id() and brokerage_id <> 'platform' and public.is_brokerage_admin()) or public.is_super_admin());
create policy contract_form_update on public.contract_form for update using ((brokerage_id = public.auth_brokerage_id() and brokerage_id <> 'platform' and public.is_brokerage_admin()) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and brokerage_id <> 'platform' and public.is_brokerage_admin()) or public.is_super_admin());
create policy contract_form_delete on public.contract_form for delete using ((brokerage_id = public.auth_brokerage_id() and brokerage_id <> 'platform' and public.is_brokerage_admin()) or public.is_super_admin());
