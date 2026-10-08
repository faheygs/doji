-- Synthetic data only; caller wraps this file in a rollback transaction.
create function pg_temp.ok(value boolean,label text) returns text language plpgsql as $$begin
 if value is distinct from true then raise exception 'FAIL: %',label;end if;return 'PASS: '||label;end$$;
create function pg_temp.denied(q text,label text,code text default '42501') returns text language plpgsql as $$begin
 begin execute q;exception when others then if sqlstate=code then return 'PASS: '||label;end if;raise;end;
 raise exception 'FAIL: expected denial %',label;end$$;
create function pg_temp.employee(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','98000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','doji_employee','aal','aal2')::text,true)
$$;
select pg_temp.employee(1);
set local role doji_employee;
select pg_temp.denied($q$select public.get_admin_staff_work_page_v1()$q$,'expanded inbox disabled by installation','55000');
reset role;
update staff_workflow_private.settings set extended_enabled=true;
update business_private.privacy_settings set enabled=true;
select set_config('request.jwt.claims','{}',true);
-- Keep original operations decider distinct from the potential moderator.
update public.admin_employees set roles=array['moderator'] where id='98000000-0000-4000-8000-000000000002';
insert into public.reports(id,reported_user_id,reporter_id,reason,target_kind)
 values('99000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','spam_scam','account');
insert into public.moderation_decisions(id,report_id,affected_user_id,content_kind,action,policy_code,severity,rationale,user_notice,decided_by)
 values('99000000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001',
 'account','no_violation','no_violation','none','Synthetic workflow decision rationale','Synthetic workflow member notice','98000000-0000-4000-8000-000000000003');
insert into public.moderation_appeals(id,decision_id,user_id,statement) values
 ('99000000-0000-4000-8000-000000000005','99000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','Synthetic request for independent review');
insert into business_private.privacy_cases(id,account_id,kind,verification_reference,due_at) values
 ('99000000-0000-4000-8000-000000000006','96000000-0000-4000-8000-000000000001','access','synthetic-verification',now()+interval '30 days');
insert into public.safety_removal_cases(id,token_hash,request_hash,request,queue,priority) values
 ('99000000-0000-4000-8000-000000000007',repeat('a',64),'synthetic-hash','{"secret":"must not appear"}','moderation','normal');
select pg_temp.employee(1);
 set local role doji_employee;
select pg_temp.ok(jsonb_array_length(public.get_admin_staff_work_page_v1()->'items')=6,'all six sources included once');
select pg_temp.ok(public.get_admin_staff_work_page_v1()::text not like '%must not appear%','inbox excludes private intake payload');
select pg_temp.ok(public.get_admin_staff_work_page_v1('report')#>>'{items,0,ownership_model}'='existing_report','report ownership reuses existing store');
select pg_temp.ok(public.get_admin_staff_work_page_v1('external_intake')#>>'{items,0,ownership_model}'='existing_intake','intake ownership reuses existing store');
select pg_temp.denied($q$select public.get_admin_staff_work_page_v1('all','all','all',51)$q$,'page size is bounded','22023');
select pg_temp.denied($q$select public.get_admin_staff_work_page_v1('all','all','all',25,now(),null)$q$,'partial cursor rejected','22023');
select set_config('test.ext.page',public.get_admin_staff_work_page_v1('all','all','all',2)::text,true);
select pg_temp.ok(jsonb_array_length(public.get_admin_staff_work_page_v1('all','all','all',2,
 (current_setting('test.ext.page')::jsonb#>>'{next_cursor,at}')::timestamptz,current_setting('test.ext.page')::jsonb#>>'{next_cursor,key}')->'items')=2,'unified keyset next page works');
select pg_temp.ok(public.get_admin_staff_event_channels_v1()='[]','event subscriptions default off');
select pg_temp.employee(4);
select pg_temp.ok(jsonb_array_length(public.get_admin_staff_work_page_v1()->'items')=1,'business reviewer cannot see moderation or privacy');
select pg_temp.denied($q$select public.get_admin_case_ownership_v1('appeal','99000000-0000-4000-8000-000000000005')$q$,'business reviewer cannot read appeal ownership');
select pg_temp.employee(3);
select pg_temp.ok(public.get_admin_case_ownership_v1('appeal','99000000-0000-4000-8000-000000000005')->>'can_claim'='false','original ordinary decider cannot claim own appeal');
select pg_temp.ok(public.get_admin_case_ownership_v1('appeal','99000000-0000-4000-8000-000000000005')->>'can_decide'='false','assignment does not bypass independent review');
select pg_temp.denied($q$select public.get_admin_case_ownership_v1('business_privacy','99000000-0000-4000-8000-000000000006')$q$,'operations cannot read restricted privacy ownership');
select pg_temp.employee(2);
select set_config('test.ext.version',public.get_admin_case_ownership_v1('appeal','99000000-0000-4000-8000-000000000005')->>'source_version',true);
select pg_temp.ok(public.admin_case_ownership_command_v1('appeal','99000000-0000-4000-8000-000000000005',0,current_setting('test.ext.version'),'claim',null,
 '97000000-0000-4000-8000-000000000201')->>'revision'='1','independent moderator can claim appeal');
select pg_temp.ok(public.admin_case_ownership_command_v1('appeal','99000000-0000-4000-8000-000000000005',0,current_setting('test.ext.version'),'claim',null,
 '97000000-0000-4000-8000-000000000201')->>'replayed'='true','appeal retry preserves one assignment');
select pg_temp.ok(public.get_admin_staff_work_page_v1('appeal','mine')#>>'{items,0,id}'='99000000-0000-4000-8000-000000000005','mine uses durable appeal owner');
reset role;
insert into public.moderation_account_actions(decision_id,user_id,action)
 values('99000000-0000-4000-8000-000000000004','91000000-0000-4000-8000-000000000001','permanent_ban');
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(public.get_admin_staff_work_page_v1('appeal')->'items')=0,'restricted appeal removed from ordinary moderator inbox');
select pg_temp.denied($q$select public.get_admin_case_ownership_v1('appeal','99000000-0000-4000-8000-000000000005')$q$,'restricted appeal exact read denied');
select pg_temp.employee(1);
select pg_temp.ok(public.get_admin_case_ownership_v1('business_privacy','99000000-0000-4000-8000-000000000006')->>'can_claim'='true','authorized privacy manager may claim');
select public.admin_case_ownership_command_v1('business_privacy','99000000-0000-4000-8000-000000000006',0,'1','claim',null,'97000000-0000-4000-8000-000000000202');
reset role;
select pg_temp.ok((select state='open' and execution_id is null from business_private.privacy_cases where id='99000000-0000-4000-8000-000000000006'),'privacy claim does not start execution');
select pg_temp.ok(not exists(select 1 from public.domain_event_outbox where topic like 'staff:workflow:%'),'disabled events produce no outbox traffic');
update staff_workflow_private.settings set events_enabled=true;
set local role doji_employee;
select pg_temp.ok(jsonb_array_length(public.get_admin_staff_event_channels_v1())=5,'manager receives exact staff channel allowlist');
select pg_temp.employee(2);
select pg_temp.ok(public.get_admin_staff_event_channels_v1()='["staff:workflow:moderation"]','ordinary moderator receives no restricted channel');
select pg_temp.employee(4);
select pg_temp.ok(public.get_admin_staff_event_channels_v1()='["staff:workflow:business"]','business subscriber receives no moderation or privacy channel');
reset role;
update public.safety_removal_cases set queue='restricted_safety',revision=revision+1 where id='99000000-0000-4000-8000-000000000007';
select pg_temp.ok((select count(distinct topic)=2 from public.domain_event_outbox where topic like 'staff:workflow:%' and payload->>'kind'='external_intake'),'queue transition invalidates both old and new authorized views');
select pg_temp.ok(not exists(select 1 from public.domain_event_outbox where topic='staff:workflow:moderation' and payload ? 'id'),'former audience receives queue-only transition hint');
select pg_temp.ok(not exists(select 1 from public.domain_event_outbox where topic like 'staff:workflow:%'
 and (payload-'id'-'kind')<>'{}'::jsonb),'staff events contain identifiers only');
select pg_temp.employee(1);
set local role doji_employee;
select public.admin_case_ownership_command_v1('business_privacy','99000000-0000-4000-8000-000000000006',1,'1','release',null,'97000000-0000-4000-8000-000000000203');
select public.admin_case_ownership_command_v1('business_privacy','99000000-0000-4000-8000-000000000006',1,'1','release',null,'97000000-0000-4000-8000-000000000203');
reset role;
select pg_temp.ok((select count(*)=1 from public.domain_event_outbox where topic='staff:workflow:privacy'),'retry does not duplicate staff event');
update business_private.privacy_cases set state='executing' where id='99000000-0000-4000-8000-000000000006';
select pg_temp.employee(1);
set local role doji_employee;
select pg_temp.ok(public.get_admin_staff_work_page_v1('business_privacy','all','waiting')#>>'{items,0,work_state}'='waiting','execution waits are not presented as reviewer decisions');
select pg_temp.ok(public.get_admin_case_ownership_v1('business_privacy','99000000-0000-4000-8000-000000000006')->>'can_decide'='false','running privacy execution disables review decision capability');
reset role;
-- The new API operations use the same verified WorkOS identity bridge.
update portal_identity_private.realms set enabled=true where realm='employee';
select portal_identity_private.set_principal_state(id,revision,'active','synthetic expanded bridge')
 from portal_identity_private.principals where realm='employee';
update portal_identity_private.employee_rpc_settings set enabled=true;
grant doji_employee_application to postgres;
select set_config('test.ext.args','{"p_kind":"all","p_filter":"all","p_state":"all","p_limit":25,"p_after_at":null,"p_after_key":null}',true);
set local role doji_employee_application;
select pg_temp.ok(portal_identity_private.employee_workflow_rpc_v1('https://employee.test','employee','user_staff_1','session_workflow',true,
 'get_admin_staff_work_page_v1',current_setting('test.ext.args')::jsonb)->>'scope'='staff_inbox_v1','expanded inbox passes independent employee bridge');
select pg_temp.ok(jsonb_array_length(portal_identity_private.employee_workflow_rpc_v1('https://employee.test','employee','user_staff_1','session_workflow',true,
 'get_admin_staff_event_channels_v1','{}'))=5,'staff event allowlist passes verified employee bridge');
select pg_temp.denied($q$select portal_identity_private.employee_workflow_rpc_v1('https://employee.test','employee','user_staff_1','session_workflow',false,
 'get_admin_staff_event_channels_v1','{}')$q$,'event allowlist requires employee MFA');
reset role;
-- Rolled-back writes cannot leave an event that refers to an uncommitted change.
select set_config('test.events.count',(select count(*)::text from public.domain_event_outbox where topic like 'staff:workflow:%'),true);
savepoint event_rollback;
update public.challenge_suggestions set status='rejected' where id='99000000-0000-4000-8000-000000000001';
rollback to event_rollback;
select pg_temp.ok((select count(*)::text from public.domain_event_outbox where topic like 'staff:workflow:%')=current_setting('test.events.count'),'source rollback removes its staff event');
-- Deleting a restricted appeal must never broadcast its ID to ordinary moderators.
update public.moderation_decisions set rationale='Synthetic updated decision rationale' where id='99000000-0000-4000-8000-000000000004';
select pg_temp.ok((select count(distinct topic)=2 from public.domain_event_outbox where payload='{"kind":"appeal"}'::jsonb and event_type='staff.queue.changed'),'decision dependency invalidates both appeal queues without identifiers');
savepoint action_change;
delete from public.domain_event_outbox where topic like 'staff:workflow:%' and payload->>'kind'='appeal';
delete from public.moderation_account_actions where decision_id='99000000-0000-4000-8000-000000000004';
select pg_temp.ok((select count(distinct topic)=2 from public.domain_event_outbox where payload='{"kind":"appeal"}'::jsonb and event_type='staff.queue.changed'),'restriction dependency invalidates both appeal queues without identifiers');
rollback to action_change;
delete from public.moderation_appeals where id='99000000-0000-4000-8000-000000000005';
select pg_temp.ok(not exists(select 1 from public.domain_event_outbox where topic='staff:workflow:moderation'
 and aggregate_id='99000000-0000-4000-8000-000000000005'),'restricted appeal deletion stays off ordinary staff channel');
select set_config('request.jwt.claims','{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}',true);
reset role;
set local role authenticated;
select pg_temp.denied($q$select public.get_admin_staff_work_page_v1()$q$,'member denied staff inbox');
select pg_temp.denied($q$select public.get_admin_staff_event_channels_v1()$q$,'member denied staff subscriptions');
reset role;
