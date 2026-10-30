-- Preparation only. Enable independently after staging qualification; never bulk apply.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create schema workflow_health_private;
revoke all on schema workflow_health_private from public,anon,authenticated,service_role;
create table workflow_health_private.settings(
 id boolean primary key default true check(id),
 observations_enabled boolean not null default false,
 scheduler_retention_enabled boolean not null default false,
 scheduler_cursor bigint not null default 0
);
insert into workflow_health_private.settings(id) values(true);
-- Fixed cardinality: five workflows, three outcomes, 24 hourly slots (360 rows).
-- These are observed backend attempts, not unique member actions or delivery proof.
create table workflow_health_private.hours(
 workflow text not null check(workflow in ('prelive','activate','close','close_targeted','maintenance')),
 outcome text not null check(outcome in ('succeeded','failed','deferred')),
 slot smallint not null check(slot between 0 and 23), hour timestamptz not null,
 attempts bigint not null check(attempts>0), elapsed_ms bigint not null check(elapsed_ms>=0),
 counts jsonb not null,
 primary key(workflow,outcome,slot)
);
-- Last receipt per workflow/outcome, not a per-request payload archive.
create table workflow_health_private.receipts(
 workflow text not null, outcome text not null, observed_at timestamptz not null,
 phase text not null, counts jsonb not null,
 primary key(workflow,outcome),
 check(workflow in ('prelive','activate','close','close_targeted','maintenance')),
 check(outcome in ('succeeded','failed','deferred'))
);
-- Database-owner managed holds. No API role may add, release or inspect holds.
create table workflow_health_private.scheduler_holds(
 scope text not null check(scope in ('all','job','run')), target bigint not null,
 evidence_reference uuid not null, created_at timestamptz not null default now(),
 primary key(scope,target), check((scope='all' and target=0) or (scope<>'all' and target>0))
);
create table workflow_health_private.scheduler_receipt(
 id boolean primary key default true check(id), observed_at timestamptz not null,
 scanned integer not null, succeeded_deleted integer not null, failed_deleted integer not null,
 has_more boolean not null
);
alter table workflow_health_private.settings enable row level security;
alter table workflow_health_private.hours enable row level security;
alter table workflow_health_private.receipts enable row level security;
alter table workflow_health_private.scheduler_holds enable row level security;
alter table workflow_health_private.scheduler_receipt enable row level security;
revoke all on all tables in schema workflow_health_private from public,anon,authenticated,service_role;

create function public.record_workflow_health_v1(p_workflow text,p_outcome text,p_phase text,p_elapsed_ms integer,p_counts jsonb default '{}')
returns boolean language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare observed timestamptz:=clock_timestamp(); bucket timestamptz; position smallint;
begin
 if p_workflow is null or p_workflow not in ('prelive','activate','close','close_targeted','maintenance')
  or p_outcome is null or p_outcome not in ('succeeded','failed','deferred')
  or p_phase is null or p_phase not in ('command','operational_retention','expired_media','committed_intents','push_endpoints','rate_limits','post_media','account_media','queue_check','scheduler_logs','complete')
  or p_elapsed_ms is null or p_elapsed_ms not between 0 and 900000
  or p_counts is null or jsonb_typeof(p_counts)<>'object' or octet_length(p_counts::text)>1024 then
  raise exception using errcode='22023',message='Invalid workflow observation';end if;
 if exists(select 1 from jsonb_each(p_counts) x where
  x.key not in ('orphaned_media','committed_media_intents','stale_push_endpoints','expired_rate_limit_buckets','deleted_post_media','deleted_account_media','scheduler_succeeded_deleted','scheduler_failed_deleted')
  or jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-9]{1,6}$') then
  raise exception using errcode='22023',message='Invalid workflow counts';end if;
 if p_workflow<>'maintenance' and p_counts<>'{}'::jsonb then
  raise exception using errcode='22023',message='Cleanup counts require maintenance';end if;
 perform 1 from workflow_health_private.settings where id and observations_enabled for share;
 if not found then return false;end if;
 bucket:=date_trunc('hour',observed);position:=mod(floor(extract(epoch from bucket)/3600)::bigint,24)::smallint;
 insert into workflow_health_private.hours as h values(p_workflow,p_outcome,position,bucket,1,p_elapsed_ms,p_counts)
 on conflict(workflow,outcome,slot) do update set hour=excluded.hour,
  attempts=case when h.hour=excluded.hour then h.attempts+1 else 1 end,
  elapsed_ms=case when h.hour=excluded.hour then h.elapsed_ms+excluded.elapsed_ms else excluded.elapsed_ms end,
  counts=case when h.hour=excluded.hour then
   (select coalesce(jsonb_object_agg(key,total),'{}'::jsonb) from
    (select key,sum(value::bigint) total from
     (select * from jsonb_each_text(h.counts) union all select * from jsonb_each_text(excluded.counts)) entries
     group by key) totals) else excluded.counts end;
 insert into workflow_health_private.receipts values(p_workflow,p_outcome,observed,p_phase,p_counts)
 on conflict(workflow,outcome) do update set observed_at=excluded.observed_at,phase=excluded.phase,counts=excluded.counts;
 return true;
end$$;

create function public.run_scheduler_log_retention_v1(p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare cursor_id bigint; scanned_count integer; last_id bigint; successes integer; failures integer;
 ids bigint[]; more boolean;
begin
 if p_limit is null or p_limit not between 1 and 5000 then
  raise exception using errcode='22023',message='Invalid retention batch';end if;
 select scheduler_cursor into cursor_id from workflow_health_private.settings
  where id and scheduler_retention_enabled for update;
 if not found then return jsonb_build_object('enabled',false,'has_more',false);end if;
 -- Fence concurrent hold creation/release before selecting deletion candidates.
 lock table workflow_health_private.scheduler_holds in share mode;
 select array_agg(runid),count(*),max(runid) into ids,scanned_count,last_id from
  (select runid from cron.job_run_details where runid>cursor_id order by runid limit p_limit) page;
 with deleted as (
  delete from cron.job_run_details d where d.runid=any(ids) and d.end_time is not null
   and ((d.status='succeeded' and d.end_time<now()-interval '30 days')
     or (d.status='failed' and d.end_time<now()-interval '90 days'))
   and not exists(select 1 from workflow_health_private.scheduler_holds h
    where h.scope='all' or (h.scope='run' and h.target=d.runid) or (h.scope='job' and h.target=d.jobid))
  returning status
 ) select count(*) filter(where status='succeeded'),count(*) filter(where status='failed')
  into successes,failures from deleted;
 more:=coalesce((select exists(select 1 from cron.job_run_details where runid>last_id)),false);
 update workflow_health_private.settings set scheduler_cursor=case when more then last_id else 0 end where id;
 insert into workflow_health_private.scheduler_receipt values(true,clock_timestamp(),scanned_count,successes,failures,more)
 on conflict(id) do update set observed_at=excluded.observed_at,scanned=excluded.scanned,
  succeeded_deleted=excluded.succeeded_deleted,failed_deleted=excluded.failed_deleted,has_more=excluded.has_more;
 return jsonb_build_object('enabled',true,'scanned',scanned_count,'succeeded_deleted',successes,'failed_deleted',failures,'has_more',more);
end$$;

create function public.get_workflow_health_v1() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled',s.observations_enabled,'retention_enabled',s.scheduler_retention_enabled,
  'window','current hour and previous 23 hours','coverage','best-effort backend attempts; not member success rates',
  'hours',coalesce((select jsonb_agg(to_jsonb(h)-'slot' order by hour,workflow,outcome)
   from workflow_health_private.hours h where hour>=date_trunc('hour',now())-interval '23 hours'),'[]'::jsonb),
  'receipts',coalesce((select jsonb_agg(to_jsonb(r) order by workflow,outcome) from workflow_health_private.receipts r),'[]'::jsonb),
  'scheduler_receipt',(select to_jsonb(r)-'id' from workflow_health_private.scheduler_receipt r))
 from workflow_health_private.settings s where id;
$$;
revoke all on function public.record_workflow_health_v1(text,text,text,integer,jsonb),
 public.run_scheduler_log_retention_v1(integer),public.get_workflow_health_v1()
 from public,anon,authenticated;
grant execute on function public.record_workflow_health_v1(text,text,text,integer,jsonb),
 public.run_scheduler_log_retention_v1(integer),public.get_workflow_health_v1() to service_role;
commit;
