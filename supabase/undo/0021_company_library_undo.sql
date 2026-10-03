-- Undo 0021: back to one shared list (files keep their folder in an unused column).
drop policy if exists file_repository_access on public.file_repository;
drop policy if exists file_repository_insert on public.file_repository;
drop policy if exists file_repository_update on public.file_repository;
drop policy if exists file_repository_delete on public.file_repository;
create policy file_repository_access on public.file_repository for all using (brokerage_id = public.auth_brokerage_id() or public.is_super_admin()) with check (brokerage_id = public.auth_brokerage_id() or public.is_super_admin());
drop table if exists public.library_folder;
