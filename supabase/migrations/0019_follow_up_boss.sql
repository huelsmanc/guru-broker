-- 0019: Follow Up Boss. Every 10 minutes, people in an "Under Contract" stage get a deal opened
-- (instant updates from Follow Up Boss do this right away; this check is the backup).
-- Settings and the encrypted API key live in the server-only app_secret table (no new tables).
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'fub-check'; end $$;
select cron.schedule('fub-check', '*/10 * * * *', $$ select private.call_app('/api/fn/fub', '{"poll": true}'::jsonb) $$);
