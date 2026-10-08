create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute s;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: allowed %',label;end$$;
create function pg_temp.health(n integer default 1,mfa boolean default true,name text default 'get_admin_health_feed_v1',args jsonb default '{}')
returns jsonb language sql as $$select portal_identity_private.employee_health_rpc_v1('https://employee.test','employee','user_health_'||n,'synthetic_health_session',mfa,name,args)$$;
grant doji_employee_application to postgres;
set local role service_role;
select pg_temp.ok(not public.record_employee_health_change_v1('delivery',clock_timestamp(),'disabled'),'default-off producer does not write');
reset role;
select pg_temp.ok(not exists(select 1 from employee_health_private.sources),'disabled feed stays empty');
update employee_health_private.settings set enabled=true;
select set_config('test.observed',clock_timestamp()::text,true);
set local role service_role;
select pg_temp.ok(public.record_employee_health_change_v1('delivery',current_setting('test.observed')::timestamptz,'first'),'authorized service observation writes');
select pg_temp.ok(not public.record_employee_health_change_v1('delivery',current_setting('test.observed')::timestamptz,'first'),'duplicate observation is idempotent');
select pg_temp.ok(not public.record_employee_health_change_v1('delivery',current_setting('test.observed')::timestamptz-interval '1s','older'),'late observation cannot supersede source');
select pg_temp.denied($q$select public.record_employee_health_change_v1('member',now(),'bad')$q$,'unknown source rejected','22023');
reset role;
select set_config('test.delivery_revision',(select revision::text from employee_health_private.sources where source='delivery'),true);
select pg_temp.ok((select revision>1000000000000000 from employee_health_private.sources where source='delivery'),'versions seeded to avoid inverse/reapply outbox collisions');
select pg_temp.ok((select count(*)=1 from public.domain_event_outbox where topic='staff:health:operations'),'one durable event for one observation');
select pg_temp.ok((select bool_and(payload=jsonb_build_object('source','delivery','revision',current_setting('test.delivery_revision')) and aggregate_id is null and event_type='staff.health.changed') from public.domain_event_outbox where topic='staff:health:operations'),'payload is identifiers only');
set local role anon;
select pg_temp.denied('select public.get_admin_health_feed_v1()','anonymous cannot read health');
select pg_temp.denied($q$select public.record_employee_health_change_v1('delivery',now(),'anon')$q$,'anonymous cannot write health');
reset role;
set local role authenticated;
select pg_temp.denied('select public.get_admin_health_feed_v1()','member cannot read health');
select pg_temp.denied($q$select public.record_employee_health_change_v1('delivery',now(),'member')$q$,'member cannot write health');
reset role;
set local role doji_business;
select pg_temp.denied('select public.get_admin_health_feed_v1()','business cannot read health');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.email','synthetic@test.invalid',true);
set local role doji_employee_application;
select pg_temp.denied('select public.get_admin_health_feed_v1()','application role cannot bypass fixed bridge');
select pg_temp.denied('select * from employee_health_private.sources','application role cannot read private rows');
select pg_temp.ok(pg_temp.health()#>>'{sources,0,revision}'=current_setting('test.delivery_revision'),'independent operations employee reads bounded metadata');
select pg_temp.ok(current_setting('request.jwt.claims')='{"role":"authenticated","aal":"aal1"}' and current_setting('request.jwt.claim')='{"role":"authenticated"}' and current_setting('request.jwt.claim.sub')='91000000-0000-4000-8000-000000000001' and current_setting('request.jwt.claim.role')='authenticated' and current_setting('request.jwt.claim.email')='synthetic@test.invalid','five caller claims restored after success');
select pg_temp.denied('select pg_temp.health(2)','non-operations employee denied');
select pg_temp.denied('select pg_temp.health(1,false)','MFA required');
select pg_temp.denied($q$select pg_temp.health(1,true,'delete_account')$q$,'bridge cannot invoke member command','22023');
select pg_temp.denied($q$select pg_temp.health(1,true,'get_admin_health_feed_v1','{"actor":"other"}')$q$,'bridge rejects injected arguments','22023');
select pg_temp.ok(current_setting('request.jwt.claims')='{"role":"authenticated","aal":"aal1"}' and current_setting('request.jwt.claim.sub')='91000000-0000-4000-8000-000000000001','caller claims survive denied reads');
reset role;
update public.admin_employees set status='disabled' where id='98100000-0000-4000-8000-000000000001';
set local role doji_employee_application;
select pg_temp.denied('select pg_temp.health()','revoked employee denied on next read');
reset role;
-- Two telemetry records in one archive transaction emit one history invalidation.
insert into public.challenges(id,title,description,category) values('98200000-0000-4000-8000-000000000001','Synthetic health fixture','Offline only','creative');
insert into public.daily_events(id,challenge_id,fires_at) values
 ('98300000-0000-4000-8000-000000000001','98200000-0000-4000-8000-000000000001',now()-interval '1 hour'),
 ('98300000-0000-4000-8000-000000000002','98200000-0000-4000-8000-000000000001',now()-interval '2 hours');
insert into public.admin_daily_event_health_snapshots(daily_event_id,observed_from,observed_through,healthy)
 select id,now()-interval '1 hour',now(),true from public.daily_events where id in('98300000-0000-4000-8000-000000000001','98300000-0000-4000-8000-000000000002');
select set_config('test.history_revision',(select revision::text from employee_health_private.sources where source='history'),true);
select pg_temp.ok((select count(*)=1 from public.domain_event_outbox where topic='staff:health:operations' and payload->>'source'='history'),'one history event for multiple summaries');
update public.admin_daily_event_health_snapshots set captured_at=clock_timestamp() where daily_event_id='98300000-0000-4000-8000-000000000001';
select pg_temp.ok((select revision::text=current_setting('test.history_revision') from employee_health_private.sources where source='history'),'capture timestamp alone does not publish');
-- Deliberately break only the new sidecar; source telemetry must still persist.
create function pg_temp.reject_health() returns trigger language plpgsql as $$begin raise exception 'synthetic sidecar failure';end$$;
create trigger synthetic_health_failure before insert or update on employee_health_private.sources for each row execute function pg_temp.reject_health();
update public.admin_daily_event_health_snapshots set healthy=false where daily_event_id='98300000-0000-4000-8000-000000000001';
select pg_temp.ok((select not healthy from public.admin_daily_event_health_snapshots where daily_event_id='98300000-0000-4000-8000-000000000001'),'sidecar failure cannot abort source history persistence');
drop trigger synthetic_health_failure on employee_health_private.sources;
select pg_temp.ok((select count(*)<=3 from employee_health_private.sources),'metadata remains bounded to three sources');
