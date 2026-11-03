-- Preparation only. Requires workflow_health_v1 and the independent employee registry.
-- One replaceable observation, not incident history. No jobs, events or provider calls.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create schema employee_health_snapshot_private;
revoke all on schema employee_health_snapshot_private from public,anon,authenticated,service_role;
create table employee_health_snapshot_private.settings(
 id boolean primary key default true check(id), enabled boolean not null default false,
 project_ref text check(project_ref in ('ohrcupagdoilkwhecict','tvixsmqxotuvyjqzmjla'))
);
insert into employee_health_snapshot_private.settings(id) values(true);
create table employee_health_snapshot_private.snapshot(
 id boolean primary key default true check(id), observed_at timestamptz not null,
 stored_at timestamptz not null, delivery jsonb not null, workflows jsonb not null,
 check(octet_length(delivery::text)<=4096 and octet_length(workflows::text)<=262144)
);
alter table employee_health_snapshot_private.settings enable row level security;
alter table employee_health_snapshot_private.snapshot enable row level security;
revoke all on all tables in schema employee_health_snapshot_private from public,anon,authenticated,service_role,
 doji_employee,doji_employee_application,doji_business;

create function public.capture_employee_health_snapshot_v1(p_project_ref text,p_health jsonb) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='250ms' set statement_timeout='1500ms' as $$
declare observation timestamptz; captured timestamptz:=clock_timestamp(); delivery jsonb; workflows jsonb;
 metrics text[]:=array['realtime_p95_ms_5m','realtime_max_ms_5m','realtime_sample_count_5m','realtime_over_5s_5m',
 'outbox_overdue','outbox_exhausted','push_stale_shards','push_exhausted_shards','apns_provider_credential_errors'];
begin
 perform 1 from employee_health_snapshot_private.settings
  where id and enabled and project_ref=p_project_ref for share;
 if not found then return false;end if;
 if p_health is null or jsonb_typeof(p_health)<>'object' or octet_length(p_health::text)>16384
  or jsonb_typeof(p_health->'healthy') is distinct from 'boolean'
  or jsonb_typeof(p_health->'checked_at') is distinct from 'string' then
  raise exception using errcode='22023',message='Invalid health snapshot';end if;
 begin observation:=(p_health->>'checked_at')::timestamptz;
 exception when others then raise exception using errcode='22023',message='Invalid observation time';end;
 if observation is null or not isfinite(observation) or observation<captured-interval '3 minutes'
  or observation>captured+interval '30 seconds' then
  raise exception using errcode='22023',message='Observation outside collection window';end if;
 -- Unknown fields never enter the cache; missing metrics stay unknown, not zero.
 if exists(select 1 from jsonb_each(p_health) x where x.key=any(metrics) and x.value<>'null'::jsonb
  and (jsonb_typeof(x.value)<>'number' or x.value::text !~ '^[0-9]+(\.[0-9]+)?$' or length(x.value::text)>24)) then
  raise exception using errcode='22023',message='Invalid health metric';end if;
 select jsonb_build_object('available',true,'healthy',p_health->'healthy','checked_at',observation)
  ||coalesce(jsonb_object_agg(x.key,x.value),'{}'::jsonb) into delivery
  from jsonb_each(p_health) x where x.key=any(metrics);
 -- Serialize collectors before the bounded workflow projection. Old completions cannot win.
 perform pg_advisory_xact_lock(682019,1);
 if exists(select 1 from employee_health_snapshot_private.snapshot where id and observed_at>=observation) then
  return false;end if;
 begin
  workflows:=public.get_workflow_health_v1();
  if workflows is null or jsonb_typeof(workflows)<>'object' or octet_length(workflows::text)>262000 then
   raise exception 'Invalid workflow snapshot';end if;
  workflows:=workflows||jsonb_build_object('available',true,'observed_at',captured);
 exception when others then
  workflows:=jsonb_build_object('available',false);
 end;
 insert into employee_health_snapshot_private.snapshot as s values(true,observation,captured,delivery,workflows)
 on conflict(id) do update set observed_at=excluded.observed_at,stored_at=excluded.stored_at,
  delivery=excluded.delivery,workflows=excluded.workflows;
 return true;
end$$;
revoke all on function public.capture_employee_health_snapshot_v1(text,jsonb)
 from public,anon,authenticated,doji_employee,doji_employee_application,doji_business;
grant execute on function public.capture_employee_health_snapshot_v1(text,jsonb) to service_role;

create function employee_health_snapshot_private.read_v1(p_summary boolean) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare snapshot employee_health_snapshot_private.snapshot; enabled boolean;
begin
 select s.enabled and s.project_ref is not null into enabled from employee_health_snapshot_private.settings s where id;
 if not coalesce(enabled,false) then return jsonb_build_object('enabled',false);end if;
 select * into snapshot from employee_health_snapshot_private.snapshot where id;
 if not found then return jsonb_build_object('enabled',true,'available',false);end if;
 return jsonb_build_object('enabled',true,'available',true,'observed_at',snapshot.observed_at,
  'stored_at',snapshot.stored_at,'stale',snapshot.observed_at<statement_timestamp()-interval '3 minutes',
  'coverage','delivery and backend lifecycle observations; not complete platform health',
  'operational',case when p_summary then snapshot.delivery-array[
   'realtime_p95_ms_5m','realtime_max_ms_5m','realtime_sample_count_5m','realtime_over_5s_5m',
   'outbox_overdue','outbox_exhausted','push_stale_shards','push_exhausted_shards','apns_provider_credential_errors']
   else snapshot.delivery end,
  'workflows',case when p_summary then jsonb_build_object('available',snapshot.workflows->'available',
   'enabled',snapshot.workflows->'enabled','observed_at',snapshot.workflows->'observed_at') else snapshot.workflows end);
end$$;
revoke all on function employee_health_snapshot_private.read_v1(boolean)
 from public,anon,authenticated,service_role,doji_business,doji_employee_application,doji_employee;
create function public.get_admin_health_snapshot_v1(p_summary boolean default false) returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if coalesce(auth.jwt()->>'role','')<>'doji_employee' or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or auth.uid() is null or not public.admin_user_has_permission('operations.read') then
  raise exception using errcode='42501',message='Employee operations access required';end if;
 return employee_health_snapshot_private.read_v1(p_summary);
end$$;
revoke all on function public.get_admin_health_snapshot_v1(boolean)
 from public,anon,authenticated,service_role,doji_business,doji_employee_application;
grant execute on function public.get_admin_health_snapshot_v1(boolean) to doji_employee;
create function portal_identity_private.employee_health_snapshot_rpc_v1(p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_name is distinct from 'get_admin_health_snapshot_v1'
  or (p_args is distinct from '{"p_summary":true}'::jsonb and p_args is distinct from '{"p_summary":false}'::jsonb) then
  raise exception using errcode='22023',message='Invalid employee snapshot operation';end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 result:=public.get_admin_health_snapshot_v1((p_args->>'p_summary')::boolean);
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);raise;
end$$;
revoke all on function portal_identity_private.employee_health_snapshot_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver;
grant execute on function portal_identity_private.employee_health_snapshot_rpc_v1(text,text,text,text,boolean,text,jsonb) to doji_employee_application;
commit;
