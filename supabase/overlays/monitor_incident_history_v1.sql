-- Preparation only. No producer, portal grant, scheduler or alert is enabled here.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create schema monitor_history_private;
revoke all on schema monitor_history_private from public,anon,authenticated,service_role;
create table monitor_history_private.settings(
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into monitor_history_private.settings(id) values(true);
create table monitor_history_private.latest(
 monitor text primary key check(monitor in ('worker','watchdog')),
 observation_id uuid, observed_at timestamptz, received_at timestamptz,
 state text check(state in ('healthy','degraded','unavailable')), family text
);
insert into monitor_history_private.latest(monitor) values('worker'),('watchdog');
create table monitor_history_private.incidents(
 id bigint generated always as identity primary key,
 monitor text not null references monitor_history_private.latest(monitor),
 family text not null, opened_at timestamptz not null, last_observed_at timestamptz not null,
 ended_at timestamptz, ended_reason text check(ended_reason in ('recovered','superseded')),
 check((ended_at is null)=(ended_reason is null))
);
create unique index monitor_one_open_incident on monitor_history_private.incidents(monitor) where ended_at is null;
alter table monitor_history_private.settings enable row level security;
alter table monitor_history_private.latest enable row level security;
alter table monitor_history_private.incidents enable row level security;
revoke all on all tables in schema monitor_history_private from public,anon,authenticated,service_role;
revoke all on all sequences in schema monitor_history_private from public,anon,authenticated,service_role;

create function public.record_monitor_observation_v1(
 p_monitor text,p_observation_id uuid,p_observed_at timestamptz,p_state text,p_family text
) returns boolean language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare previous monitor_history_private.latest; received timestamptz:=clock_timestamp();
begin
 if p_monitor is null or p_monitor not in ('worker','watchdog') or p_observation_id is null
  or p_observed_at is null or not isfinite(p_observed_at)
  or p_observed_at<received-interval '5 minutes' or p_observed_at>received
  or p_state is null or p_state not in ('healthy','degraded','unavailable') then
  raise exception using errcode='22023',message='Invalid monitor observation';end if;
 if (p_state='healthy' and p_family is not null) or (p_state<>'healthy' and
  (p_family is null or p_family not in ('apns-provider-credentials','domain-outbox-exhausted',
   'push-fanout-exhausted','domain-outbox-delayed','realtime-delivery-degraded',
   'operational-health-check-failed','monitor-heartbeat-missing'))) then
  raise exception using errcode='22023',message='Invalid monitor family';end if;
 perform 1 from monitor_history_private.settings where id and enabled for share;
 if not found then return false;end if;
 select * into strict previous from monitor_history_private.latest where monitor=p_monitor for update;
 if previous.observation_id=p_observation_id then
  if previous.observed_at is distinct from p_observed_at or previous.state is distinct from p_state
   or previous.family is distinct from p_family then
   raise exception using errcode='22023',message='Conflicting monitor replay';end if;
  return false;
 end if;
 -- Replayed, concurrent or delayed observations cannot reopen or recover a newer incident.
 if previous.observed_at is not null and p_observed_at<=previous.observed_at then return false;end if;
 if p_state='healthy' or previous.family is distinct from p_family then
  update monitor_history_private.incidents set ended_at=p_observed_at,
   ended_reason=case when p_state='healthy' then 'recovered' else 'superseded' end
   where monitor=p_monitor and ended_at is null;
 end if;
 if p_state<>'healthy' then
  insert into monitor_history_private.incidents(monitor,family,opened_at,last_observed_at)
   values(p_monitor,p_family,p_observed_at,p_observed_at)
  on conflict(monitor) where ended_at is null do update set last_observed_at=excluded.last_observed_at;
 end if;
 update monitor_history_private.latest set observation_id=p_observation_id,observed_at=p_observed_at,
  received_at=received,state=p_state,family=p_family where monitor=p_monitor;
 return true;
end$$;

-- Small independent-probe projection: no incident scan, repairs, identifiers or secrets.
create function public.get_monitor_heartbeat_v1() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',s.enabled,'checked_at',statement_timestamp(),
  'observed_at',l.observed_at,'received_at',l.received_at,'state',l.state)
 from monitor_history_private.settings s cross join monitor_history_private.latest l
 where s.id and l.monitor='worker';
$$;

create function public.get_monitor_incident_history_v1(p_before_id bigint default null,p_limit integer default 50)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if p_limit is null or p_limit not between 1 and 100 or p_before_id<=0 then
  raise exception using errcode='22023',message='Invalid monitor history page';end if;
 return jsonb_build_object('enabled',(select enabled from monitor_history_private.settings where id),
  'coverage','monitor observations only; superseded is not recovered; source freshness must be checked',
  'latest',(select jsonb_agg(to_jsonb(l) order by monitor) from monitor_history_private.latest l),
  'incidents',coalesce((select jsonb_agg(to_jsonb(i) order by id desc) from
   (select * from monitor_history_private.incidents where p_before_id is null or id<p_before_id
    order by id desc limit p_limit) i),'[]'::jsonb));
end$$;
revoke all on function public.record_monitor_observation_v1(text,uuid,timestamptz,text,text),
 public.get_monitor_incident_history_v1(bigint,integer),public.get_monitor_heartbeat_v1() from public,anon,authenticated;
grant execute on function public.record_monitor_observation_v1(text,uuid,timestamptz,text,text),
 public.get_monitor_incident_history_v1(bigint,integer),public.get_monitor_heartbeat_v1() to service_role;
commit;
