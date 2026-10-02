-- Definitions only, disabled. No new cron installed by this file.
begin;
create table public.moderation_media_delivery_config (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 endpoint text not null check(endpoint ~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/moderation-media$')
);
alter table public.moderation_media_delivery_config enable row level security;
revoke all on public.moderation_media_delivery_config from public,anon,authenticated,doji_employee,service_role;
create function public.wake_moderation_media_v1()
returns void language plpgsql security definer set search_path='' as $$
declare destination text; secret text;
begin
 select endpoint into destination from public.moderation_media_delivery_config where singleton and enabled;
 if destination is null or not exists(select 1 from public.moderation_media_objects
  where (phase in('pending','archived','origin_removed') or (desired='restored' and phase='revoked'))
   and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp()-interval '1 minute')) then return; end if;
 select decrypted_secret into secret from vault.decrypted_secrets where name='moderation_media_dispatch_secret';
 if secret is null or length(secret)<32 then return; end if;
 perform net.http_post(url:=destination,headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=1000);
end$$;
create function public.wake_moderation_media_on_change_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 begin perform public.wake_moderation_media_v1(); exception when others then null; end;
 return new;
end$$;
revoke all on function public.wake_moderation_media_v1(),public.wake_moderation_media_on_change_v1() from public,anon,authenticated,doji_employee,service_role;
create trigger wake_moderation_media_after_capture after insert on public.moderation_media_decisions
 for each statement execute function public.wake_moderation_media_on_change_v1();
create trigger wake_moderation_media_after_progress after update of phase,desired,failure_code on public.moderation_media_objects
 for each row when ((new.phase,new.desired,new.failure_code) is distinct from (old.phase,old.desired,old.failure_code))
 execute function public.wake_moderation_media_on_change_v1();
commit;
-- Separate guarded activation: one five-minute recovery job calling
-- public.wake_moderation_media_v1(). On rollback disable delivery/capture, keep
-- all ledger/evidence/visibility fences and provide manual deadline coverage.
