begin;
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,expected text,label text) returns text language plpgsql as $$
begin begin execute s;exception when others then if sqlstate=expected then return 'PASS: '||label;end if;raise;end;raise exception 'FAIL: allowed %',label;end$$;
insert into portal_identity_private.realms(realm,issuer,audience,enabled) values('employee','https://employee.test','employee',true);
select portal_identity_private.bind_identity('employee','user_compose','98300000-0000-4000-8000-000000000001','synthetic compose testing');
select portal_identity_private.prepare_employee_actor_v1('98300000-0000-4000-8000-000000000001','synthetic compose testing');
select portal_identity_private.set_principal_state(id,revision,'active','synthetic compose testing') from portal_identity_private.principals where realm='employee';
insert into public.admin_employees(id,display_name,status,roles) values('98300000-0000-4000-8000-000000000001','Synthetic writer','active',array['super_admin']);
update public.admin_employee_cutover set employee_only=true;
select set_config('test.compose_args',jsonb_build_object('p_action','publish','p_id',null,'p_version',null,
 'p_input',jsonb_build_object('title','Synthetic','body','Offline only','ends_at',now()+interval '1 day',
 'cta_label',null,'cta_url',null,'priority',0,'max_impressions_per_user',1,'min_hours_between_impressions',24,'reward_action',null,'reward_sparks',0),
 'p_request_id','98300000-0000-4000-8000-000000000002')::text,true);
create function pg_temp.compose(mfa boolean default true,args jsonb default null) returns jsonb language sql as $$
 select portal_identity_private.employee_announcement_rpc_v1('https://employee.test','employee','user_compose','session_test',$1,
 'admin_announcement_compose_v1',coalesce($2,current_setting('test.compose_args')::jsonb));$$;
select pg_temp.ok(not has_function_privilege('authenticated','portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb)','EXECUTE'),'member bridge denied');
select pg_temp.ok(not has_function_privilege('anon','portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb)','EXECUTE'),'anonymous bridge denied');
select pg_temp.ok(not has_function_privilege('service_role','portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb)','EXECUTE'),'service role bridge denied');
select pg_temp.denied('select pg_temp.compose()','42501','existing employee bridge disabled gate preserved');
update portal_identity_private.employee_rpc_settings set enabled=true;
select pg_temp.denied('select pg_temp.compose(false)','42501','MFA denied');
select pg_temp.denied($q$select pg_temp.compose(true,current_setting('test.compose_args')::jsonb||'{"actor_id":"forged"}'::jsonb)$q$,'22023','caller actor injection denied');
select set_config('request.jwt.claims','{"sub":"98300000-0000-4000-8000-000000000099","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim.sub','98300000-0000-4000-8000-000000000099',true);
select set_config('test.prior_claims',current_setting('request.jwt.claims'),true);
set local role doji_employee_application;
select set_config('test.receipt',pg_temp.compose()::text,true);
select pg_temp.ok(current_setting('test.receipt')::jsonb#>>'{command,state}'='published','verified employee publishes atomically');
select pg_temp.ok(current_setting('request.jwt.claims')=current_setting('test.prior_claims'),'caller claims restored on success');
select pg_temp.ok(current_setting('request.jwt.claim.sub')='98300000-0000-4000-8000-000000000099','individual stale sub restored');
select pg_temp.ok(pg_temp.compose()->>'replayed'='true','bridge exact retry returns receipt');
select pg_temp.denied($q$select pg_temp.compose(true,current_setting('test.compose_args')::jsonb||'{"p_action":"save_draft"}'::jsonb)$q$,'22023','changed retry rejected');
select pg_temp.ok(current_setting('request.jwt.claims')=current_setting('test.prior_claims'),'claims restored after exception');
reset role;
update public.admin_employees set roles=array['operations'] where id='98300000-0000-4000-8000-000000000001';
set local role doji_employee_application;
select pg_temp.denied('select pg_temp.compose()','42501','revoked write role denied before replay');
reset role;
select pg_temp.ok((select count(*)=1 from public.app_announcements where title='Synthetic'),'no duplicate announcement');
rollback;
