-- Print shop: print and mail orders (postcards, flyers, business cards), saved mailing lists, and listing kits.
-- Run after 0001-0012. Safe to run again.

-- MailingList -----------------------------------------------------------
create table if not exists public.mailing_list (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  brokerage_id text,
  name text,
  owner_email text,
  recipient_count integer,
  recipients jsonb,
  source text,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.mailing_list add column if not exists brokerage_id text;
alter table public.mailing_list add column if not exists name text;
alter table public.mailing_list add column if not exists owner_email text;
alter table public.mailing_list add column if not exists recipient_count integer;
alter table public.mailing_list add column if not exists recipients jsonb;
alter table public.mailing_list add column if not exists source text;
drop trigger if exists mailing_list_touch on public.mailing_list;
create trigger mailing_list_touch before update on public.mailing_list for each row execute function public.touch_updated_date();
drop trigger if exists mailing_list_fill on public.mailing_list;
create trigger mailing_list_fill before insert on public.mailing_list for each row execute function public.fill_owner();
alter table public.mailing_list enable row level security;
create index if not exists mailing_list_owner_email_idx on public.mailing_list (owner_email);
create index if not exists mailing_list_brokerage_id_idx on public.mailing_list (brokerage_id);

-- PrintOrder ------------------------------------------------------------
create table if not exists public.print_order (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  amount_cents integer,
  brokerage_id text,
  currency text,
  design_id text,
  failed_count integer,
  files jsonb,
  fulfilled_at timestamptz,
  list_id text,
  owner_email text,
  owner_name text,
  paid_at timestamptz,
  problems jsonb,
  product text,
  product_label text,
  quantity integer,
  recipient_count integer,
  recipients jsonb,
  sent_count integer,
  ship_to jsonb,
  status text,
  stripe_session_id text,
  test_mode boolean,
  tracking jsonb,
  transaction_id text,
  vendor text,
  vendor_ids jsonb,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.print_order add column if not exists amount_cents integer;
alter table public.print_order add column if not exists brokerage_id text;
alter table public.print_order add column if not exists currency text;
alter table public.print_order add column if not exists design_id text;
alter table public.print_order add column if not exists failed_count integer;
alter table public.print_order add column if not exists files jsonb;
alter table public.print_order add column if not exists fulfilled_at timestamptz;
alter table public.print_order add column if not exists list_id text;
alter table public.print_order add column if not exists owner_email text;
alter table public.print_order add column if not exists owner_name text;
alter table public.print_order add column if not exists paid_at timestamptz;
alter table public.print_order add column if not exists problems jsonb;
alter table public.print_order add column if not exists product text;
alter table public.print_order add column if not exists product_label text;
alter table public.print_order add column if not exists quantity integer;
alter table public.print_order add column if not exists recipient_count integer;
alter table public.print_order add column if not exists recipients jsonb;
alter table public.print_order add column if not exists sent_count integer;
alter table public.print_order add column if not exists ship_to jsonb;
alter table public.print_order add column if not exists status text;
alter table public.print_order add column if not exists stripe_session_id text;
alter table public.print_order add column if not exists test_mode boolean;
alter table public.print_order add column if not exists tracking jsonb;
alter table public.print_order add column if not exists transaction_id text;
alter table public.print_order add column if not exists vendor text;
alter table public.print_order add column if not exists vendor_ids jsonb;
drop trigger if exists print_order_touch on public.print_order;
create trigger print_order_touch before update on public.print_order for each row execute function public.touch_updated_date();
drop trigger if exists print_order_fill on public.print_order;
create trigger print_order_fill before insert on public.print_order for each row execute function public.fill_owner();
alter table public.print_order enable row level security;
create index if not exists print_order_owner_email_idx on public.print_order (owner_email);
create index if not exists print_order_brokerage_id_idx on public.print_order (brokerage_id);
create index if not exists print_order_transaction_id_idx on public.print_order (transaction_id);

drop policy if exists mailing_list_access on public.mailing_list;
create policy mailing_list_access on public.mailing_list for all using (lower(owner_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() and (lower(owner_email) = public.auth_email() or public.is_brokerage_admin()));
drop policy if exists print_order_access on public.print_order;
create policy print_order_access on public.print_order for select using (lower(owner_email) = public.auth_email() or (brokerage_id = public.auth_brokerage_id() and public.is_brokerage_admin()) or public.is_super_admin());
-- print_order: written only by server routes.

-- Send queued postcards in batches (every 5 minutes) and check shipping on printed orders.
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'print-queue'; end $$;
select cron.schedule('print-queue', '*/5 * * * *', $$ select private.call_app('/api/fn/printQueue') $$);

-- Listing kits for agents' own new MLS listings (hourly).
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'listing-kits'; end $$;
select cron.schedule('listing-kits', '17 * * * *', $$ select private.call_app('/api/fn/listingKit', '{"scan": true}'::jsonb) $$);
