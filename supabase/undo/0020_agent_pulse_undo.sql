do $$ begin perform cron.unschedule(jobname) from cron.job where jobname = 'agent-pulse-weekly'; end $$;
