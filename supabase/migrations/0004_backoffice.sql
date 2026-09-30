-- Activity log: every create, change and delete on the important tables, with who did it.
-- Admins read it in the Activity tab. Run after 0003.

create or replace function private.log_activity() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  prev jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  changed jsonb := '[]'::jsonb;
  k text;
  label text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(rec) loop
      if k not in ('updated_date', 'synced_at') and (rec -> k) is distinct from (prev -> k) then
        changed := changed || to_jsonb(k);
      end if;
    end loop;
    if jsonb_array_length(changed) = 0 then return new; end if;
    -- Never copy signer link codes or bank details into the log.
  end if;

  label := coalesce(
    nullif(rec ->> 'property_address', ''), nullif(rec ->> 'title', ''), nullif(rec ->> 'name', ''),
    nullif(rec ->> 'full_name', ''), nullif(rec ->> 'payee_name', ''), nullif(rec ->> 'agent_name', ''),
    nullif(rec ->> 'email', ''), nullif(rec ->> 'user_email', ''), rec ->> 'id');

  insert into public.activity_event (brokerage_id, actor_email, table_name, op, record_id, summary, changed, created_by)
  values (
    coalesce(rec ->> 'brokerage_id', prev ->> 'brokerage_id'),
    coalesce(nullif(public.auth_email(), ''), 'system'),
    tg_table_name,
    lower(tg_op),
    rec ->> 'id',
    left(label, 200),
    changed,
    coalesce(nullif(public.auth_email(), ''), 'system')
  );
  return coalesce(new, old);
end $$;

do $$ declare t text; begin
  foreach t in array array[
    'transaction', 'offer', 'esign_document', 'esign_submission', 'esign_template',
    'commission_plan', 'commission_record', 'payout', 'checklist_template',
    'profiles', 'brokerage_settings', 'file_repository', 'client_review', 'compliance_training',
    'generated_contract', 'cmas_report', 'agent_private', 'transaction_contact'
  ] loop
    execute format('drop trigger if exists activity_%1$s on public.%1$I', t);
    execute format('create trigger activity_%1$s after insert or update or delete on public.%1$I for each row execute function private.log_activity()', t);
  end loop;
end $$;

-- Keep the log to 18 months.
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname = 'activity-trim';
end $$;
select cron.schedule('activity-trim', '30 4 * * *',
  $$ delete from public.activity_event where created_date < now() - interval '18 months' $$);

-- Live updates for admin screens.
do $$ declare t text; begin
  foreach t in array array['activity_event', 'transaction', 'offer', 'esign_document', 'esign_submission', 'payout', 'commission_record'] loop
    begin execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; end;
  end loop;
end $$;

-- Back-office jobs: license/E&O expiry alerts daily, monthly commission statements
-- on the 1st, and payout status checks every 30 minutes.
do $$ begin
  perform cron.unschedule(jobname) from cron.job where jobname in ('license-alerts', 'monthly-statements', 'payout-sync');
end $$;
select cron.schedule('license-alerts', '0 13 * * *', $$ select private.call_app('/api/fn/licenseAlerts') $$);
select cron.schedule('monthly-statements', '0 12 1 * *', $$ select private.call_app('/api/fn/monthlyStatements') $$);
select cron.schedule('payout-sync', '*/30 * * * *', $$ select private.call_app('/api/fn/payoutSync') $$);
