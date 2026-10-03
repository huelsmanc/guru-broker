-- 0020: Agent pulse. Every Monday morning (9:20 Eastern), refresh each brokerage's agent pulse and
-- tell its admins who may be drifting. Results live in the server-only app_secret table (no new tables).
do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'agent-pulse-weekly'; end $$;
select cron.schedule('agent-pulse-weekly', '20 13 * * 1', $$ select private.call_app('/api/fn/agentPulse', '{"scan": true}'::jsonb) $$);
