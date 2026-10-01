-- Contacts: each agent's own contact book, linkable to deals and e-sign. Run after 0001-0007.
-- Safe to run again.

-- Contact ---------------------------------------------------------------
create table if not exists public.contact (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  address text,
  birthday text,
  brokerage_id text,
  company text,
  email text,
  name text,
  notes text,
  owner_email text,
  owner_name text,
  phone text,
  source text,
  tags jsonb,
  type text,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.contact add column if not exists address text;
alter table public.contact add column if not exists birthday text;
alter table public.contact add column if not exists brokerage_id text;
alter table public.contact add column if not exists company text;
alter table public.contact add column if not exists email text;
alter table public.contact add column if not exists name text;
alter table public.contact add column if not exists notes text;
alter table public.contact add column if not exists owner_email text;
alter table public.contact add column if not exists owner_name text;
alter table public.contact add column if not exists phone text;
alter table public.contact add column if not exists source text;
alter table public.contact add column if not exists tags jsonb;
alter table public.contact add column if not exists type text;
drop trigger if exists contact_touch on public.contact;
create trigger contact_touch before update on public.contact for each row execute function public.touch_updated_date();
drop trigger if exists contact_fill on public.contact;
create trigger contact_fill before insert on public.contact for each row execute function public.fill_owner();
alter table public.contact enable row level security;
create index if not exists contact_owner_email_idx on public.contact (owner_email);
create index if not exists contact_brokerage_id_idx on public.contact (brokerage_id);

-- Deal contacts can point at the contact-book entry they came from.
alter table public.transaction_contact add column if not exists contact_id text;
create index if not exists transaction_contact_contact_id_idx on public.transaction_contact (contact_id);
create index if not exists contact_email_idx on public.contact (owner_email, lower(email));

-- Security: the agent's own contacts, plus brokerage admins (and anyone given "see all private contacts").
drop policy if exists contact_access on public.contact;
create policy contact_access on public.contact for all using (lower(owner_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('contacts.private_all'))) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and (lower(owner_email) = public.auth_email() or public.is_brokerage_admin())) or public.is_super_admin());
