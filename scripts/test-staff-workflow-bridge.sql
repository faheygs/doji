-- Executes only in the synthetic network-disabled clean room, then rolls back.
create function pg_temp.ok(v boolean,label text) returns text language plpgsql as $$begin
 if v is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(s text,code text,label text) returns text language plpgsql as $$begin
 begin execute s;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: allowed %',label;end$$;
create function pg_temp.workflow(name text,args jsonb,n integer default 1,mfa boolean default true)
returns jsonb language sql as $$select portal_identity_private.employee_workflow_rpc_v1(
 'https://employee.test','employee','user_staff_'||n,'session_workflow',mfa,name,args)$$;
grant doji_employee_application to postgres;
update portal_identity_private.realms set enabled=true where realm='employee';
select portal_identity_private.set_principal_state(id,revision,'active','synthetic bridge readiness')
 from portal_identity_private.principals where realm='employee';
select set_config('test.case','{"p_kind":"suggestion","p_id":"99000000-0000-4000-8000-000000000001"}',true);
select set_config('test.assignees',jsonb_build_object('p_kind','suggestion','p_id','99000000-0000-4000-8000-000000000001','p_after_id',null,'p_limit',2)::text,true);
select set_config('test.page','{"p_kind":"all","p_filter":"all","p_limit":25,"p_after_at":null,"p_after_key":null}',true);
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
select set_config('request.jwt.claim','{"role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','91000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.email','synthetic@test.invalid',true);
select set_config('test.claims',current_setting('request.jwt.claims'),true);
set local role doji_employee_application;
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb)$q$,'42501','independent employee gate denies workflow');
reset role;
update portal_identity_private.employee_rpc_settings set enabled=true;
set local role doji_employee_application;
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb)$q$,'55000','workflow remains disabled by default');
reset role;
update staff_workflow_private.settings set enabled=true;
set local role doji_employee_application;
select pg_temp.ok(pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb)->>'owner_label'='Unassigned','bridge reads ownership as separate employee despite stale member claims');
select pg_temp.ok(current_setting('request.jwt.claims')=current_setting('test.claims')
 and current_setting('request.jwt.claim')='{"role":"authenticated"}'
 and current_setting('request.jwt.claim.sub')='91000000-0000-4000-8000-000000000001'
 and current_setting('request.jwt.claim.role')='authenticated'
 and current_setting('request.jwt.claim.email')='synthetic@test.invalid','all five caller settings restored after success');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb,1,false)$q$,'42501','workflow bridge requires verified employee MFA');
select pg_temp.denied($q$select pg_temp.workflow('delete_account','{}')$q$,'42501','workflow cannot select member or existing moderation commands');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb||'{"actor_id":"victim"}')$q$,'22023','workflow rejects actor injection');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1','{}')$q$,'22023','workflow rejects missing fields');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb,4)$q$,'42501','business reviewer cannot read a community idea');
select pg_temp.ok(current_setting('request.jwt.claims')=current_setting('test.claims')
 and current_setting('request.jwt.claim')='{"role":"authenticated"}'
 and current_setting('request.jwt.claim.sub')='91000000-0000-4000-8000-000000000001'
 and current_setting('request.jwt.claim.role')='authenticated'
 and current_setting('request.jwt.claim.email')='synthetic@test.invalid','all five caller settings restored after denied domain read');
select pg_temp.ok(jsonb_array_length(pg_temp.workflow('get_admin_owned_work_page_v1',current_setting('test.page')::jsonb)->'items')=2,'independent bridge returns both bounded sources');
select pg_temp.ok(jsonb_array_length(pg_temp.workflow('get_admin_owned_work_page_v1',current_setting('test.page')::jsonb,4)->'items')=1,'independent bridge filters queues by current authority');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_owned_work_page_v1',current_setting('test.page')::jsonb||'{"p_limit":51}')$q$,'22023','bridge cannot request an oversized queue');
select set_config('test.first_assignees',pg_temp.workflow('get_admin_case_assignees_v1',current_setting('test.assignees')::jsonb)::text,true);
select pg_temp.ok(jsonb_array_length(current_setting('test.first_assignees')::jsonb->'items')=2
 and current_setting('test.first_assignees')::jsonb->>'next_cursor' is not null,'assignee list bounded with explicit continuation');
select pg_temp.ok(pg_temp.workflow('get_admin_case_assignees_v1',current_setting('test.assignees')::jsonb||jsonb_build_object('p_after_id',current_setting('test.first_assignees')::jsonb->>'next_cursor'))#>>'{items,0,label}'='Operations','assignee keyset advances without duplicate or ineligible business reviewer');
select pg_temp.ok(not exists(select 1 from jsonb_array_elements(current_setting('test.first_assignees')::jsonb->'items') i where (select count(*) from jsonb_object_keys(i))<>2 or not i ?& array['id','label']),'assignees expose only staff ID and display label, no email or member data');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_assignees_v1',current_setting('test.assignees')::jsonb,3)$q$,'42501','nonmanager cannot enumerate assignment directory');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_assignees_v1',current_setting('test.assignees')::jsonb||'{"p_limit":51}')$q$,'22023','assignee directory rejects oversized requests');
select set_config('test.command',(current_setting('test.case')::jsonb||jsonb_build_object(
 'p_revision',0,'p_source_version',pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb)->>'source_version',
 'p_action','claim','p_target',null,'p_request_id','97000000-0000-4000-8000-000000000088'))::text,true);
select pg_temp.ok(pg_temp.workflow('admin_case_ownership_command_v1',current_setting('test.command')::jsonb,3)->>'assigned_to'='98000000-0000-4000-8000-000000000003','verified operations employee claims under their independent ID');
select pg_temp.ok(pg_temp.workflow('admin_case_ownership_command_v1',current_setting('test.command')::jsonb,3)->>'replayed'='true','bridge retry replays the atomic receipt');
select pg_temp.ok(pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb,3)->>'can_decide'='false','claiming does not grant decision authority');
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb,5)$q$,'42501','disabled employee is denied at bridge');
reset role;
select portal_identity_private.revoke_session('employee','user_staff_3','session_workflow','synthetic revocation');
set local role doji_employee_application;
select pg_temp.denied($q$select pg_temp.workflow('get_admin_case_ownership_v1',current_setting('test.case')::jsonb,3)$q$,'42501','revoked verified session cannot read workflow');
reset role;
select pg_temp.ok(not exists(select 1 from auth.users where id='98000000-0000-4000-8000-000000000003'),'workflow never creates member/Auth account for employee');
select pg_temp.ok(not has_function_privilege('authenticated','portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute')
 and not has_function_privilege('doji_business','portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute')
 and not has_function_privilege('anon','portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)','execute'),'member/business/anonymous roles have no bridge grant');
select pg_temp.ok(not has_function_privilege('doji_employee_application','staff_workflow_private.assignees(text,uuid,uuid,integer)','execute'),'transport cannot bypass the verified identity bridge');
