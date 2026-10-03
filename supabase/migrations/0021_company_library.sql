-- 0021: Company library. Folders (private ones for admins and chosen people), page counts, and
-- library files that only library managers can add, change or remove. Files already in the library
-- are put into folders named after their old category, so nothing goes missing.

-- LibraryFolder ---------------------------------------------------------
create table if not exists public.library_folder (
  id text primary key default replace(gen_random_uuid()::text, '-', ''),
  brokerage_id text,
  created_by_email text,
  description text,
  member_emails jsonb,
  name text,
  private boolean,
  sort integer,
  extra jsonb not null default '{}'::jsonb,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  created_by text
);
alter table public.library_folder add column if not exists brokerage_id text;
alter table public.library_folder add column if not exists created_by_email text;
alter table public.library_folder add column if not exists description text;
alter table public.library_folder add column if not exists member_emails jsonb;
alter table public.library_folder add column if not exists name text;
alter table public.library_folder add column if not exists private boolean;
alter table public.library_folder add column if not exists sort integer;
drop trigger if exists library_folder_touch on public.library_folder;
create trigger library_folder_touch before update on public.library_folder for each row execute function public.touch_updated_date();
drop trigger if exists library_folder_fill on public.library_folder;
create trigger library_folder_fill before insert on public.library_folder for each row execute function public.fill_owner();
alter table public.library_folder enable row level security;
create index if not exists library_folder_brokerage_id_idx on public.library_folder (brokerage_id);

alter table public.file_repository add column if not exists folder_id text;
alter table public.file_repository add column if not exists pages integer;
create index if not exists file_repository_folder_id_idx on public.file_repository (folder_id);

drop policy if exists file_repository_access on public.file_repository;
create policy file_repository_access on public.file_repository for select using ((brokerage_id = public.auth_brokerage_id() and public.has_perm('library.access') and (folder_id is null or exists (select 1 from public.library_folder f where f.id = file_repository.folder_id))) or public.is_super_admin());
drop policy if exists file_repository_insert on public.file_repository;
drop policy if exists file_repository_update on public.file_repository;
drop policy if exists file_repository_delete on public.file_repository;
create policy file_repository_insert on public.file_repository for insert with check ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin());
create policy file_repository_update on public.file_repository for update using ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin());
create policy file_repository_delete on public.file_repository for delete using ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin());
drop policy if exists library_folder_access on public.library_folder;
create policy library_folder_access on public.library_folder for select using ((brokerage_id = public.auth_brokerage_id() and public.has_perm('library.access') and (not coalesce(private, false) or public.is_brokerage_admin() or public.has_perm('library.private_all') or coalesce(member_emails, '[]'::jsonb) ? public.auth_email())) or public.is_super_admin());
drop policy if exists library_folder_insert on public.library_folder;
drop policy if exists library_folder_update on public.library_folder;
drop policy if exists library_folder_delete on public.library_folder;
create policy library_folder_insert on public.library_folder for insert with check ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin());
create policy library_folder_update on public.library_folder for update using ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin()) with check ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin());
create policy library_folder_delete on public.library_folder for delete using ((brokerage_id = public.auth_brokerage_id() and (public.is_brokerage_admin() or public.has_perm('library.manage'))) or public.is_super_admin());

-- Existing files: one folder per old category, per brokerage.
insert into public.library_folder (brokerage_id, name, sort, private, created_by_email)
select distinct f.brokerage_id,
  case coalesce(f.category, 'other') when 'training' then 'Training' when 'template' then 'Templates' when 'policy' then 'Policies'
    when 'guide' then 'Guides' when 'contract' then 'Contracts & forms' else 'Other' end,
  case coalesce(f.category, 'other') when 'contract' then 1 when 'template' then 2 when 'policy' then 3 when 'training' then 4 when 'guide' then 5 else 9 end,
  false, 'system'
from public.file_repository f
where f.folder_id is null and f.brokerage_id is not null
  and not exists (select 1 from public.library_folder lf where lf.brokerage_id = f.brokerage_id and lf.name =
    case coalesce(f.category, 'other') when 'training' then 'Training' when 'template' then 'Templates' when 'policy' then 'Policies'
      when 'guide' then 'Guides' when 'contract' then 'Contracts & forms' else 'Other' end);

update public.file_repository f set folder_id = lf.id
from public.library_folder lf
where f.folder_id is null and lf.brokerage_id = f.brokerage_id and lf.name =
  case coalesce(f.category, 'other') when 'training' then 'Training' when 'template' then 'Templates' when 'policy' then 'Policies'
    when 'guide' then 'Guides' when 'contract' then 'Contracts & forms' else 'Other' end;

-- Activity log, like the other library changes.
drop trigger if exists activity_library_folder on public.library_folder;
create trigger activity_library_folder after insert or update or delete on public.library_folder for each row execute function private.log_activity();
