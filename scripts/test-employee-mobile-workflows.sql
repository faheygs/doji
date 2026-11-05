create function pg_temp.device_read(n integer default 1,mfa boolean default true,name text default 'get_admin_mobile_workflows_v1',args jsonb default '{}')
returns jsonb language sql as $$select portal_identity_private.employee_mobile_workflows_rpc_v1('https://employee.test','employee','user_health_'||n,'synthetic_health_session',mfa,name,args)$$;
create function pg_temp.assert_device(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.deny_device(s text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute s;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: allowed %',label;end$$;
grant doji_employee_application to postgres;
select pg_temp.assert_device((pg_temp.device_read()->>'enabled')::boolean=false,'device capture remains default-off');
update mobile_workflow_private.settings set enabled=true;
select public.record_mobile_workflow_counts_v1('98100000-0000-4000-8000-000000000003',jsonb_build_object(
 'id','wf:synthetic-batch-0001','issuedAt',floor(extract(epoch from clock_timestamp())*1000),
 'platform','ios','rows','[{"phase":"submit","outcome":"confirmed","count":2,"capped":false}]'::jsonb));
set local role anon;
select pg_temp.deny_device('select public.get_admin_mobile_workflows_v1()','anonymous cannot read device counts');reset role;
set local role authenticated;
select pg_temp.deny_device('select public.get_admin_mobile_workflows_v1()','member cannot read device counts');reset role;
set local role doji_business;
select pg_temp.deny_device('select public.get_admin_mobile_workflows_v1()','business cannot read device counts');reset role;
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.email','synthetic@test.invalid',true);
set local role doji_employee_application;
select pg_temp.deny_device('select public.get_admin_mobile_workflows_v1()','application cannot bypass device identity bridge');
select pg_temp.deny_device('select * from mobile_workflow_private.admission','application cannot read admission hashes');
select pg_temp.assert_device(jsonb_array_length(pg_temp.device_read()->'rows')=1,'Operations employee reads device aggregate');
select pg_temp.assert_device(current_setting('request.jwt.claims')='{"role":"authenticated","aal":"aal1"}' and current_setting('request.jwt.claim')='{"role":"authenticated"}' and current_setting('request.jwt.claim.sub')='91000000-0000-4000-8000-000000000001' and current_setting('request.jwt.claim.role')='authenticated' and current_setting('request.jwt.claim.email')='synthetic@test.invalid','five caller claims restored after device read');
select pg_temp.deny_device('select pg_temp.device_read(2)','non-Operations employee denied');
select pg_temp.deny_device('select pg_temp.device_read(1,false)','device read requires MFA');
select pg_temp.deny_device($q$select pg_temp.device_read(1,true,'delete_account')$q$,'device bridge cannot dispatch writes','22023');
select pg_temp.deny_device($q$select pg_temp.device_read(1,true,'get_admin_mobile_workflows_v1','{"actor":"other"}')$q$,'device arguments cannot override identity','22023');
select pg_temp.assert_device(current_setting('request.jwt.claims')='{"role":"authenticated","aal":"aal1"}','caller claims preserved after denied device read');
reset role;
update mobile_workflow_private.settings set enabled=false;
select pg_temp.assert_device(jsonb_array_length(pg_temp.device_read()->'rows')=0,'disabled capture hides retained device rows');
select pg_temp.assert_device((select count(*)=1 from mobile_workflow_private.hours),'disabling reads does not delete evidence');
update public.admin_employees set status='disabled' where id='98100000-0000-4000-8000-000000000001';
set local role doji_employee_application;
select pg_temp.deny_device('select pg_temp.device_read()','revoked employee cannot read device reports');reset role;
