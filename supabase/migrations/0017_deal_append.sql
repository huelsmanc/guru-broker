-- 0017: Add to a deal's lists (documents, e-sign documents, co-agents, updates) in one step inside
-- the database, so two people adding at the same moment both get kept. Runs with the person's own
-- access rules: you can only add to deals you're allowed to change.
create or replace function public.deal_append(p_id text, p_col text, p_item jsonb) returns void
language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  if p_col not in ('documents', 'esign_docs', 'co_agents', 'updates') then
    raise exception 'That list cannot be added to';
  end if;
  execute format('update public.transaction set %I = coalesce(case when jsonb_typeof(%I) = ''array'' then %I end, ''[]''::jsonb) || jsonb_build_array($1) where id = $2', p_col, p_col, p_col)
    using p_item, p_id;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Deal not found or not allowed' using errcode = 'P0002'; end if;
end $$;
revoke all on function public.deal_append(text, text, jsonb) from public;
grant execute on function public.deal_append(text, text, jsonb) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.deal_append(text, text, jsonb) to service_role;
  end if;
end $$;
