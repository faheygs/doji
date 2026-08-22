-- Doji challenge correctness is driven by durable one-shot Cloudflare alarms.
-- Recurring pg_cron jobs are retired and must not remain in production, even if
-- an older deployment used a job name that was not listed by prior migrations.

do $$
declare
  job record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  for job in
    select jobid
    from cron.job
    where jobname like 'doji\_%' escape '\'
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;
