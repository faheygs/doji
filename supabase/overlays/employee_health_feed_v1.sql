-- LOCAL CANDIDATE. Separate shared-system release; default disabled.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create schema employee_health_private;
revoke all on schema employee_health_private from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application;
create table employee_health_private.settings(id boolean primary key default true check(id),enabled boolean not null default false);
insert into employee_health_private.settings values(true,false);
create table employee_health_private.sources(
 source text primary key check(source in ('delivery','history','sentry')),
 revision bigint not null check(revision>0), observed_at timestamptz not null,
 last_event_key text not null
);
alter table employee_health_private.settings enable row level security;
alter table employee_health_private.sources enable row level security;
revoke all on all tables in schema employee_health_private from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application;

-- One bounded row per source; no event payloads, errors, metrics, user IDs or PII.
create function public.record_employee_health_change_v1(p_source text,p_observed_at timestamptz,p_event_key text) returns boolean
language plpgsql security definer set search_path='' set lock_timeout='250ms' as $$
declare version bigint;
begin
 if p_source is null or p_source not in ('delivery','history','sentry') or p_observed_at is null
  or p_observed_at>clock_timestamp()+interval '1 minute' or p_observed_at<clock_timestamp()-interval '1 day'
  or p_event_key is null or length(p_event_key)>100 or length(p_event_key)<1 then
  raise exception using errcode='22023',message='Invalid health observation';end if;
 -- Shared lock serializes disabling/rollback with any writer that passed admission.
 perform 1 from employee_health_private.settings where id and enabled for share;
 if not found then return false;end if;
 -- Time-seeded versions avoid replaying an old outbox key after inverse/reapply.
 insert into employee_health_private.sources as s values(p_source,floor(extract(epoch from clock_timestamp())*1000000)::bigint,p_observed_at,p_event_key)
 on conflict(source) do update set revision=greatest(s.revision+1,excluded.revision),observed_at=excluded.observed_at,last_event_key=excluded.last_event_key
 where excluded.observed_at>s.observed_at and excluded.last_event_key<>s.last_event_key
 returning revision into version;
 if not found then return false;end if;
 perform public.enqueue_domain_event('staff:health:operations','staff.health.changed',null,
  jsonb_build_object('source',p_source,'revision',version::text), 'employee-health:'||p_source||':'||version);
 return true;
end$$;
revoke all on function public.record_employee_health_change_v1(text,timestamptz,text) from public,anon,authenticated,doji_employee,doji_business,doji_employee_application;
grant execute on function public.record_employee_health_change_v1(text,timestamptz,text) to service_role;

-- Bounded producer: the existing archive refresh writes at most five summaries.
-- Coalesce multiple summary rows from the same transaction into one invalidation.
create function employee_health_private.history_changed() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from employee_health_private.settings where id and enabled) then return null;end if;
 if tg_op='UPDATE' and (to_jsonb(new)-'captured_at')=(to_jsonb(old)-'captured_at') then return null;end if;
 perform public.record_employee_health_change_v1('history',clock_timestamp(),'history:'||pg_current_xact_id()::text);
 return null;
exception when others then return null; -- Monitoring sidecar cannot abort source persistence.
end$$;
revoke all on function employee_health_private.history_changed() from public,anon,authenticated,service_role,doji_employee,doji_business,doji_employee_application;
create trigger employee_health_history_changed after insert or update on public.admin_daily_event_health_snapshots
 for each row execute function employee_health_private.history_changed();

create function public.get_admin_health_feed_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if coalesce(auth.jwt()->>'role','')<>'doji_employee' or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or auth.uid() is null or not public.admin_user_has_permission('operations.read') then
  raise exception using errcode='42501',message='Employee operations access required';end if;
 return jsonb_build_object('enabled',exists(select 1 from employee_health_private.settings where id and enabled),
  'sources',coalesce((select jsonb_agg(jsonb_build_object('source',source,'revision',revision::text,'observed_at',observed_at) order by source)
   from employee_health_private.sources),'[]'::jsonb));
end$$;
revoke all on function public.get_admin_health_feed_v1() from public,anon,authenticated,service_role,doji_business,doji_employee_application;
grant execute on function public.get_admin_health_feed_v1() to doji_employee;

-- Add a new fixed bridge rather than replacing the existing employee dispatcher.
create function portal_identity_private.employee_health_rpc_v1(p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_name is distinct from 'get_admin_health_feed_v1' or p_args is distinct from '{}'::jsonb then
  raise exception using errcode='22023',message='Invalid employee health operation';end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 result:=public.get_admin_health_feed_v1();
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);raise;
end$$;
revoke all on function portal_identity_private.employee_health_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver;
grant execute on function portal_identity_private.employee_health_rpc_v1(text,text,text,text,boolean,text,jsonb) to doji_employee_application;
commit;
