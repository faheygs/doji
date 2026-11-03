-- The caller owns a network-disabled clean-room container, not a hosted project.
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute s;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: allowed %',label;end$$;
create function pg_temp.capture(delta interval default interval '0s',extra jsonb default '{}') returns boolean language sql as $$
 select public.capture_employee_health_snapshot_v1('ohrcupagdoilkwhecict',
 jsonb_build_object('checked_at',clock_timestamp()+delta,'healthy',true,'outbox_overdue',0)||extra)$$;
create function pg_temp.bridge(n integer default 1,mfa boolean default true,args jsonb default '{"p_summary":true}') returns jsonb language sql as $$
 select portal_identity_private.employee_health_snapshot_rpc_v1('https://employee.test','employee','user_health_'||n,
 'synthetic_health_session',mfa,'get_admin_health_snapshot_v1',args)$$;
set role service_role;
select pg_temp.ok(not pg_temp.capture(),'snapshot default-off performs no collection');
reset role;
select pg_temp.ok(not exists(select 1 from employee_health_snapshot_private.snapshot),'disabled snapshot remains empty');
update employee_health_snapshot_private.settings set enabled=true,project_ref='ohrcupagdoilkwhecict';
select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal2","sub":"98100000-0000-4000-8000-000000000001"}',false);
select pg_temp.ok(public.get_admin_health_snapshot_v1()='{"enabled":true,"available":false}'::jsonb,'enabled collector with no observation is unavailable, not healthy');
select pg_temp.ok(not public.capture_employee_health_snapshot_v1('tvixsmqxotuvyjqzmjla','{}'),'mixed project rejected before work');
select pg_temp.denied($q$select pg_temp.capture('0s','{"healthy":"true"}')$q$,'invalid healthy flag rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('0s','{"checked_at":"infinity"}')$q$,'infinite timestamp rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('0s','{"checked_at":"not-a-date"}')$q$,'invalid timestamp rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('0s','{"checked_at":null}')$q$,'missing timestamp rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('0s','{"outbox_overdue":-1}')$q$,'negative metrics rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('0s','{"outbox_overdue":"0"}')$q$,'string metrics rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('-4 minutes')$q$,'stale samples rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('1 minute')$q$,'future samples rejected','22023');
select pg_temp.denied($q$select pg_temp.capture('0s',jsonb_build_object('payload',repeat('x',17000)))$q$,'oversized samples rejected','22023');
set role service_role;
select pg_temp.ok(pg_temp.capture('0s','{"unknown_secret":"synthetic-not-retained","realtime_p95_ms_5m":null}'),'authorized collector stores snapshot');
reset role;
select pg_temp.ok((select count(*)=1 and bool_and(not delivery?'unknown_secret' and delivery->'realtime_p95_ms_5m'='null'::jsonb and not delivery?'push_exhausted_shards') from employee_health_snapshot_private.snapshot),'fixed cardinality, field allowlist and unknown metrics preserved');
select pg_temp.ok(not pg_temp.capture('-1s'),'late collector cannot overwrite current snapshot');
select pg_temp.ok(not public.capture_employee_health_snapshot_v1('ohrcupagdoilkwhecict',
 (select delivery from employee_health_snapshot_private.snapshot)),'identical observation is idempotent');
select pg_temp.ok((select not workflows?'token' and workflows->'available'='true'::jsonb from employee_health_snapshot_private.snapshot),'bounded workflow projection captured independently');
select pg_temp.ok(not exists(select 1 from public.domain_event_outbox where topic='staff:health:operations'),'snapshot does not publish paid health events');
set role anon;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','anonymous snapshot read denied');
select pg_temp.denied('select pg_temp.capture()','anonymous snapshot write denied');
reset role;
set role authenticated;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','member snapshot read denied');
select pg_temp.denied('select pg_temp.capture()','member snapshot write denied');
reset role;
set role doji_business;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','business snapshot read denied');
reset role;
set role service_role;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','service cannot act as employee reader');
reset role;
set role doji_employee_application;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','application cannot bypass employee authorization');
select pg_temp.denied('select * from employee_health_snapshot_private.snapshot','application cannot read private snapshot rows');
select pg_temp.ok(pg_temp.bridge()->'available'='true'::jsonb,'application reads only through fixed employee bridge');
select pg_temp.denied('select pg_temp.bridge(2)','bridge rechecks operations permission');
select pg_temp.denied('select pg_temp.bridge(1,false)','bridge requires verified MFA');
select pg_temp.denied($q$select pg_temp.bridge(1,true,'{"p_summary":true,"actor":"other"}')$q$,'bridge rejects injected identity','22023');
select pg_temp.denied($q$select pg_temp.bridge(1,true,'{"p_summary":null}')$q$,'bridge rejects ambiguous summary mode','22023');
select pg_temp.ok(current_setting('request.jwt.claims')='{"role":"doji_employee","aal":"aal2","sub":"98100000-0000-4000-8000-000000000001"}','bridge restores caller claims after successful and denied reads');
reset role;
select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal2","sub":"98100000-0000-4000-8000-000000000001"}',false);
set role doji_employee;
select pg_temp.ok(public.get_admin_health_snapshot_v1()->'available'='true'::jsonb,'operations employee reads cached snapshot');
select pg_temp.ok(not (public.get_admin_health_snapshot_v1(true)#>'{workflows}')?'hours'
 and not (public.get_admin_health_snapshot_v1(true)#>'{operational}')?'outbox_overdue'
 and octet_length(public.get_admin_health_snapshot_v1(true)::text)<1024,'summary omits full details');
select pg_temp.denied('select pg_temp.capture()','employee cannot write observations');
reset role;
select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal1","sub":"98100000-0000-4000-8000-000000000001"}',false);
set role doji_employee;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','MFA required for snapshot reads');
reset role;
select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal2","sub":"98100000-0000-4000-8000-000000000002"}',false);
set role doji_employee;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','non-operations employee denied');
reset role;
select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal2","sub":"98100000-0000-4000-8000-000000000001"}',false);
-- Source ages out even when the portal keeps reading; reads must not renew timestamps.
update employee_health_snapshot_private.snapshot set observed_at=clock_timestamp()-interval '4 minutes';
select pg_temp.ok((public.get_admin_health_snapshot_v1()->>'stale')::boolean,'stopped collector becomes stale');
select pg_temp.ok(public.get_admin_health_snapshot_v1()->>'observed_at'=(select to_jsonb(observed_at)#>>'{}' from employee_health_snapshot_private.snapshot),'read preserves source timestamp');
update public.admin_employees set status='disabled' where id='98100000-0000-4000-8000-000000000001';
set role doji_employee;
select pg_temp.denied('select public.get_admin_health_snapshot_v1()','revoked employee immediately denied cached read');
reset role;
update public.admin_employees set status='active' where id='98100000-0000-4000-8000-000000000001';
-- A source failure replaces availability, never a stale successful workflow result.
alter function public.get_workflow_health_v1() rename to synthetic_workflow_health_backup;
create function public.get_workflow_health_v1() returns jsonb language plpgsql as $$begin raise exception 'synthetic';end$$;
select pg_temp.ok(pg_temp.capture(),'workflow failure does not lose delivery observation');
select pg_temp.ok((select workflows='{"available":false}'::jsonb from employee_health_snapshot_private.snapshot),'workflow failure cannot retain a green sample');
drop function public.get_workflow_health_v1();
alter function public.synthetic_workflow_health_backup() rename to get_workflow_health_v1;
update employee_health_snapshot_private.settings set enabled=false;
select pg_temp.ok(public.get_admin_health_snapshot_v1()='{"enabled":false}'::jsonb,'disable gate immediately hides retained observation');
