-- Adds "Add automatically" checklist templates to new transactions and to users when they
-- join a brokerage (see server/functions/applyDefaultChecklists.js).

drop trigger if exists automation_transaction_insert on public.transaction;
create trigger automation_transaction_insert after insert on public.transaction
  for each row execute function private.on_row_change();

drop trigger if exists automation_profiles_insert on public.profiles;
create trigger automation_profiles_insert after insert on public.profiles
  for each row when (new.brokerage_id is not null) execute function private.on_row_change();

drop trigger if exists automation_profiles_join on public.profiles;
create trigger automation_profiles_join after update of brokerage_id on public.profiles
  for each row when (new.brokerage_id is not null and old.brokerage_id is distinct from new.brokerage_id)
  execute function private.on_row_change();
