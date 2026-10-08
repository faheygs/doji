-- Run only in the owned offline test database, in a rollback transaction.
create function pg_temp.ok(value boolean,label text) returns text language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: expected denial %',label;end$$;
create function pg_temp.employee(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','98000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','doji_employee','aal','aal2')::text,true)
$$;
update staff_workflow_private.settings set extended_enabled=true;
select pg_temp.employee(1);
set local role doji_employee;
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation')$q$,'safety queue disabled on install','55000');
reset role;
update staff_workflow_private.settings set safety_queue_enabled=true;
select set_config('request.jwt.claims','{}',true);
update public.admin_employees set roles=array['moderator'] where id='98000000-0000-4000-8000-000000000002';
insert into public.reports(id,reported_user_id,reporter_id,reason,target_kind,created_at)
 select ('97000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 '91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','spam_scam','account','2026-01-01'::timestamptz
 from generate_series(1,30) n;
insert into public.admin_report_triage(report_id,queue,assigned_to)
 values('97000000-0000-4000-8000-000000000001','restricted_safety',null),
 ('97000000-0000-4000-8000-000000000002','moderation','98000000-0000-4000-8000-000000000001');
insert into public.moderation_decisions(id,report_id,affected_user_id,content_kind,action,policy_code,severity,rationale,user_notice,decided_by)
 values('97000000-0000-4000-8000-000000000101','97000000-0000-4000-8000-000000000001',
 '91000000-0000-4000-8000-000000000001','account','no_violation','no_violation','none',
 'Synthetic queue decision rationale','Synthetic queue member notice','98000000-0000-4000-8000-000000000003');
insert into public.moderation_appeals(id,decision_id,user_id,statement,submitted_at)
 values('97000000-0000-4000-8000-000000000102','97000000-0000-4000-8000-000000000101',
 '91000000-0000-4000-8000-000000000001','Secret appeal statement','2026-01-01');
insert into public.safety_removal_cases(id,token_hash,request_hash,request,queue,priority,received_at)
 values('97000000-0000-4000-8000-000000000103',repeat('b',64),'queue-test-1','{"secret":"private payload"}','moderation','normal','2026-01-01'),
 ('97000000-0000-4000-8000-000000000104',repeat('c',64),'queue-test-2','{"secret":"private payload"}','restricted_safety','normal','2026-01-01');
select pg_temp.employee(1);
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('restricted_safety')->'items')=2,'restricted report and external request share one page');
select pg_temp.ok(public.get_admin_safety_work_page_v1('moderation')::text not like '%private payload%' and public.get_admin_safety_work_page_v1('moderation')::text not like '%Secret appeal%','summary excludes evidence and identity payloads');
select pg_temp.ok(public.get_admin_safety_work_page_v1('moderation',false,'external_intake')#>>'{items,0,origin}'='external','external origin is explicit');
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('moderation',false,'all','mine')->'items')=1,'mine is server-filtered');
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('moderation',false,'all','unassigned',25)->'items')=25,'unassigned page is bounded');
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('invalid')$q$,'invalid area denied','22023');
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation',null)$q$,'null closed filter denied','22023');
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation',false,'business_privacy')$q$,'unrelated source denied','22023');
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation',false,'all','all',26)$q$,'oversized page denied','22023');
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation',false,'all','all',25,now(),null)$q$,'partial cursor denied','22023');
do $$declare page jsonb; after_at timestamptz; after_key text; keys text[]:=array[]::text[]; k text; pages int:=0;begin
 loop
  page:=public.get_admin_safety_work_page_v1('moderation',false,'all','all',2,after_at,after_key);
  for k in select value->>'key' from jsonb_array_elements(page->'items') loop
   if k=any(keys) then raise exception 'Duplicate page record';end if;keys:=array_append(keys,k);
  end loop;
  pages:=pages+1;if pages>20 then raise exception 'Cursor failed to terminate';end if;
  exit when page->'next_cursor'='null'::jsonb;
  after_at:=(page#>>'{next_cursor,at}')::timestamptz;after_key:=page#>>'{next_cursor,key}';
 end loop;
 if cardinality(keys)<>31 then raise exception 'Expected 31 records, got %',cardinality(keys);end if;
end$$;
select pg_temp.ok(true,'equal-timestamp mixed-source paging has no omissions or duplicates');
select pg_temp.employee(2);
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('restricted_safety')$q$,'ordinary moderator cannot read restricted page');
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('moderation')->'items')=25,'ordinary moderator retains ordinary queue');
select pg_temp.employee(4);
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation')$q$,'business-only reviewer denied');
reset role;
insert into public.moderation_account_actions(decision_id,user_id,action)
 values('97000000-0000-4000-8000-000000000101','91000000-0000-4000-8000-000000000001','permanent_ban');
select pg_temp.employee(1);
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('restricted_safety')->'items')=3,'restricted appeal follows existing appeal permission rule');
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('moderation',false,'appeal')->'items')=0,'restricted appeal never leaks into ordinary area');
reset role;
update public.safety_removal_cases set state='not_actionable',closed_at=now() where id='97000000-0000-4000-8000-000000000103';
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(public.get_admin_safety_work_page_v1('moderation',false,'external_intake')->'items')=0,'closed intake leaves open queue');
select pg_temp.ok(public.get_admin_safety_work_page_v1('moderation',true)#>>'{items,0,work_state}'='closed','closed history retained without active deadline');
select pg_temp.ok(public.get_admin_safety_work_page_v1('moderation',true)#>'{items,0,due_at}'='null'::jsonb,'closed case cannot appear overdue');
reset role;
update portal_identity_private.realms set enabled=true where realm='employee';
select portal_identity_private.set_principal_state(id,revision,'active','synthetic safety bridge') from portal_identity_private.principals where realm='employee';
update portal_identity_private.employee_rpc_settings set enabled=true;
grant doji_employee_application to postgres;
set local role doji_employee_application;
select pg_temp.ok(portal_identity_private.employee_workflow_rpc_v1('https://employee.test','employee','user_staff_1','session_safety',true,
 'get_admin_safety_work_page_v1','{"p_queue":"moderation","p_closed":false,"p_kind":"all","p_filter":"all","p_limit":25,"p_after_at":null,"p_after_key":null}')->>'scope'='staff_safety_v1','verified independent identity bridge reads unified queue');
select pg_temp.denied($q$select portal_identity_private.employee_workflow_rpc_v1('https://employee.test','employee','user_staff_1','session_safety',false,
 'get_admin_safety_work_page_v1','{"p_queue":"moderation","p_closed":false,"p_kind":"all","p_filter":"all","p_limit":25,"p_after_at":null,"p_after_key":null}')$q$,'bridge requires MFA');
reset role;
set local role authenticated;
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation')$q$,'member cannot execute safety read');
reset role;
set local role anon;
select pg_temp.denied($q$select public.get_admin_safety_work_page_v1('moderation')$q$,'anonymous cannot execute safety read');
reset role;
