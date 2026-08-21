-- Remove the last callable pieces of the pre-outbox notification pipeline.
-- Historical migrations remain immutable, but no cron job or SECURITY DEFINER
-- helper may call the retired direct-push Edge Functions at runtime.

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
    where jobname in (
      'doji_dispatch_challenge_pushes',
      'doji_expire_events'
    )
    or command ilike any (array[
      '%/functions/v1/dispatch-challenge-pushes%',
      '%/functions/v1/expire-events%',
      '%/functions/v1/send-push-notifications%',
      '%/functions/v1/notify-user%',
      '%/functions/v1/recalculate-streak%'
    ])
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;

drop function if exists public.doji_notify_user_push(uuid, text, text, jsonb, text);
