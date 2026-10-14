-- LOCAL PREPARATION ONLY. Apply after business_applications_v1, never alone.
-- No authenticator membership, flag enablement, member RPC or RLS change.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.realtime_budgets (
 account_id uuid primary key,
 window_at timestamptz not null,
 used integer not null check(used between 1 and 24)
);
alter table business_private.realtime_budgets enable row level security;
revoke all on business_private.realtime_budgets from public,anon,authenticated,doji_employee,doji_business,service_role;

create function public.get_business_realtime_capability_v1() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; n integer; at_time timestamptz:=clock_timestamp();
begin
 uid:=business_private.business_actor(false);
 if not exists(select 1 from business_private.settings where singleton and realtime_enabled) then
  raise exception using errcode='55000',message='Business realtime is not enabled';
 end if;
 -- Atomic per-identity reservation; no member table writes or shared global lock.
 insert into business_private.realtime_budgets as b values(uid,at_time,1)
 on conflict(account_id) do update set
  window_at=case when b.window_at<=at_time-interval '1 hour' then at_time else b.window_at end,
  used=case when b.window_at<=at_time-interval '1 hour' then 1 else b.used+1 end
 where b.window_at<=at_time-interval '1 hour' or b.used<24
 returning used into n;
 if n is null then return jsonb_build_object('allowed',false); end if;
 return jsonb_build_object('allowed',true,'userId',uid,'topic','business:'||uid||':events');
end$$;
revoke all on function public.get_business_realtime_capability_v1() from public,anon,authenticated,doji_employee,doji_business,service_role;
grant execute on function public.get_business_realtime_capability_v1() to doji_business;
commit;
