create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute s;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: allowed %',label;end$$;
create function pg_temp.history(n integer default 1,mfa boolean default true,name text default 'get_admin_monitor_history_v1',args jsonb default '{}')
returns jsonb language sql as $$select portal_identity_private.employee_monitor_history_rpc_v1('https://employee.test','employee','user_health_'||n,'synthetic_health_session',mfa,name,args)$$;
grant doji_employee_application to postgres;
update monitor_history_private.settings set enabled=true;
select public.record_monitor_observation_v1('worker','99100000-0000-4000-8000-000000000001',clock_timestamp(),'degraded','domain-outbox-delayed');
set local role anon;
select pg_temp.denied('select public.get_admin_monitor_history_v1()','anonymous cannot read incidents');
reset role;
set local role authenticated;
select pg_temp.denied('select public.get_admin_monitor_history_v1()','member cannot read incidents');
reset role;
set local role doji_business;
select pg_temp.denied('select public.get_admin_monitor_history_v1()','business cannot read incidents');
reset role;
select set_config('request.jwt.claims','{"role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.email','synthetic@test.invalid',true);
set local role doji_employee_application;
select pg_temp.denied('select public.get_admin_monitor_history_v1()','application cannot bypass identity bridge');
select pg_temp.denied('select * from monitor_history_private.incidents','application cannot read private rows');
select pg_temp.ok(jsonb_array_length(pg_temp.history()->'incidents')=1,'operations employee reads retained incident');
select pg_temp.ok(current_setting('request.jwt.claims')='{"role":"authenticated","aal":"aal1"}' and current_setting('request.jwt.claim')='{"role":"authenticated"}' and current_setting('request.jwt.claim.sub')='91000000-0000-4000-8000-000000000001' and current_setting('request.jwt.claim.role')='authenticated' and current_setting('request.jwt.claim.email')='synthetic@test.invalid','five caller claims restored after history read');
select pg_temp.denied('select pg_temp.history(2)','non-operations employee denied');
select pg_temp.denied('select pg_temp.history(1,false)','MFA required');
select pg_temp.denied($q$select pg_temp.history(1,true,'delete_account')$q$,'no member command dispatch','22023');
select pg_temp.denied($q$select pg_temp.history(1,true,'get_admin_monitor_history_v1','{"actor":"other"}')$q$,'injected arguments denied','22023');
select pg_temp.ok(current_setting('request.jwt.claims')='{"role":"authenticated","aal":"aal1"}','claims preserved after denied read');
reset role;
update public.admin_employees set status='disabled' where id='98100000-0000-4000-8000-000000000001';
set local role doji_employee_application;
select pg_temp.denied('select pg_temp.history()','revoked employee cannot read history');
reset role;
