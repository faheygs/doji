-- LOCAL / RELEASE CANDIDATE ONLY. Definitions do not activate delivery or cron.
-- Apply after external_takedown_alerts_v1.sql in a separately approved release.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table public.safety_removal_delivery_config (
 singleton boolean primary key default true check(singleton), enabled boolean not null default false,
 endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/safety-removal-alerts$')
);
alter table public.safety_removal_delivery_config enable row level security;
revoke all on public.safety_removal_delivery_config from public,anon,authenticated,doji_employee,service_role;

create function public.wake_safety_removal_alerts_v1()
returns void language plpgsql security definer set search_path='' as $$
declare destination text; secret text;
begin
 select endpoint into destination from public.safety_removal_delivery_config where singleton and enabled;
 if destination is null or not exists(select 1 from public.safety_removal_alerts where state='pending'
  and next_attempt_at<=clock_timestamp() and coalesce(lease_until,clock_timestamp())<=clock_timestamp()) then return; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='safety_removal_dispatch_secret';
 if secret is null or length(secret)<32 then return; end if;
 perform net.http_post(url:=destination,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=1000);
end$$;
revoke all on function public.wake_safety_removal_alerts_v1() from public,anon,authenticated,doji_employee,service_role;

create function public.wake_safety_removal_on_receipt_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 -- Network enqueue failure must not reject or erase a valid request. The durable
 -- alert row and separately qualified recovery job remain authoritative.
 begin perform public.wake_safety_removal_alerts_v1(); exception when others then null; end;
 return new;
end$$;
revoke all on function public.wake_safety_removal_on_receipt_v1() from public,anon,authenticated,doji_employee,service_role;
create trigger safety_removal_alert_wakeup after insert on public.safety_removal_alerts
 for each row execute function public.wake_safety_removal_on_receipt_v1();
commit;

-- ACTIVATION IS NOT INCLUDED. After quota, secrets, endpoint and delivery checks,
-- the operator-approved release installs one named five-minute recovery job:
-- cron.schedule('safety-removal-alert-recovery-v1','*/5 * * * *',
--               'select public.wake_safety_removal_alerts_v1()');
-- Inspect an existing same-name job first; never duplicate or overwrite it blind.
-- Rollback sets enabled=false and unschedules only that exact captured job ID;
-- it retains cases and alert intents, and requires manual case coverage.
