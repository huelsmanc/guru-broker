-- MLS listings (synced from SmartMLS and other MLSs). Run after 0002.
-- Written by the sync job only; every signed-in user can read.

create table if not exists public.mls_listing (
  id text primary key,                 -- '<source>:<listing key>'
  source text not null,                -- e.g. 'smartmls'
  feed_type text,                      -- 'idx' | 'vow' | 'broker'
  listing_key text not null,
  mls_number text,
  status text,                         -- Active, Pending, Closed, ...
  property_type text,
  property_sub_type text,
  list_price numeric,
  original_list_price numeric,
  close_price numeric,
  list_date date,
  close_date date,
  pending_date date,
  days_on_market integer,
  street_address text,
  unit text,
  city text,
  state text,
  zip text,
  county text,
  latitude double precision,
  longitude double precision,
  beds integer,
  baths_full integer,
  baths_half integer,
  baths_total numeric,
  living_area numeric,
  lot_size_acres numeric,
  year_built integer,
  garage_spaces numeric,
  taxes numeric,
  hoa_fee numeric,
  list_agent_name text,
  list_agent_email text,
  list_agent_phone text,
  list_office_name text,
  public_remarks text,
  photo_count integer,
  photos jsonb not null default '[]'::jsonb,
  modified_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists mls_listing_mls_number_idx on public.mls_listing (mls_number);
create index if not exists mls_listing_status_idx on public.mls_listing (status, close_date desc);
create index if not exists mls_listing_zip_idx on public.mls_listing (zip);
create index if not exists mls_listing_city_idx on public.mls_listing (lower(city));
create index if not exists mls_listing_geo_idx on public.mls_listing (latitude, longitude);
create index if not exists mls_listing_address_idx on public.mls_listing (lower(street_address));

alter table public.mls_listing enable row level security;
drop policy if exists mls_listing_read on public.mls_listing;
create policy mls_listing_read on public.mls_listing for select using (auth.uid() is not null);

create table if not exists public.mls_sync_state (
  source text primary key,
  cursor timestamptz,
  last_run timestamptz,
  last_ok timestamptz,
  last_count integer,
  total_count integer default 0,
  page_offset integer not null default 1,   -- RETS paging within the current window
  window_max timestamptz,                   -- newest change seen in the current window
  last_error text
);
alter table public.mls_sync_state enable row level security;
drop policy if exists mls_sync_state_read on public.mls_sync_state;
create policy mls_sync_state_read on public.mls_sync_state for select using (public.is_brokerage_admin());

-- Pull new and changed listings every 15 minutes.
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'mls-sync';
end $$;
select cron.schedule('mls-sync', '*/15 * * * *', $$ select private.call_app('/api/fn/mlsSync') $$);
