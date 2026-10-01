-- Imports don't send notifications, run automations or fill the activity log for old records;
-- later edits to imported records behave normally. Run on a test database after the migrations.
begin;
update private.app_config set app_url = 'https://app.test', hook_secret = 's';
delete from net.calls;

-- An imported message: no push. A new one: push.
insert into public.direct_message (id, brokerage_id, sender_email, receiver_email, content, extra)
  values ('imp_dm1', 'B1', 'a@x.com', 'b@x.com', 'old', '{"imported": true, "import_run": "r1"}');
do $$ begin if (select count(*) from net.calls) <> 0 then raise exception 'an imported message must not call the app'; end if; end $$;
insert into public.direct_message (id, brokerage_id, sender_email, receiver_email, content)
  values ('imp_dm2', 'B1', 'a@x.com', 'b@x.com', 'hi');
do $$ begin if (select count(*) from net.calls) <> 1 then raise exception 'a new message must call the app'; end if; end $$;

-- An imported deal: no automation, no activity row. Importing it again: still nothing.
insert into public.transaction (id, brokerage_id, property_address, extra)
  values ('imp_t1', 'B1', '1 Main', '{"imported": true, "import_run": "r1"}');
update public.transaction set property_address = '1 Main St', agent_email = 'z@x.com', extra = '{"imported": true, "import_run": "r2"}' where id = 'imp_t1';
do $$ begin
  if (select count(*) from net.calls) <> 1 then raise exception 'importing a deal must not run automations'; end if;
  if exists (select 1 from public.activity_event where record_id = 'imp_t1') then raise exception 'imports are not logged row by row'; end if;
end $$;

-- Someone edits the imported deal later: logged, and the automations run.
update public.transaction set agent_email = 'a@x.com' where id = 'imp_t1';
do $$ begin
  if (select count(*) from net.calls) <> 2 then raise exception 'a later edit must run automations'; end if;
  if (select count(*) from public.activity_event where record_id = 'imp_t1' and op = 'update') <> 1 then raise exception 'a later edit must be logged'; end if;
end $$;

-- Undoing an import (system): not logged. A person deleting a normal deal: logged.
delete from public.transaction where id = 'imp_t1';
insert into public.transaction (id, brokerage_id, property_address) values ('imp_t2', 'B1', '2 Oak');
delete from public.transaction where id = 'imp_t2';
do $$ begin
  if exists (select 1 from public.activity_event where record_id = 'imp_t1' and op = 'delete') then raise exception 'undoing an import is not logged'; end if;
  if not exists (select 1 from public.activity_event where record_id = 'imp_t2' and op = 'delete') then raise exception 'deleting a normal deal is logged'; end if;
end $$;

-- The app's secrets table is closed to signed-in users (no grants and no security rules;
-- even with table grants, as in this test database, no rows are visible).
insert into public.app_secret (name, value) values ('vapid', '{"privateKey": "x"}');
set local role authenticated;
do $$ declare n int; begin
  begin
    select count(*) into n from public.app_secret;
  exception when insufficient_privilege then n := 0;
  end;
  if n <> 0 then raise exception 'app_secret must not be readable'; end if;
end $$;
reset role;
rollback;
select 'import rules: all checks passed';
