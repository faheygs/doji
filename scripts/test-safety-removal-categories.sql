-- Runs inside the same synthetic rollback transaction, after existing bridge tests.
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
do $$declare tax record; case_id uuid; data jsonb; begin
 for tax in select * from public.safety_removal_taxonomy_v1() loop
  case_id:=gen_random_uuid();
  data:=current_setting('test.request')::jsonb||jsonb_build_object('reason',tax.reason,'detail',tax.detail,'relationship','witness');
  perform public.submit_safety_removal_v1(case_id,repeat('a',64),data);
  perform pg_temp.check_true(exists(select 1 from public.safety_removal_cases where id=case_id
    and queue=case when tax.restricted then 'restricted_safety' else 'moderation' end
    and priority=case when tax.restricted then 'critical' when tax.reason in ('self_harm','violence_hate_exploitation') then 'high' else 'normal' end
    and deadline_at=received_at+case when tax.detail='nonconsensual_intimate_images' then interval '48 hours' else interval '24 hours' end),tax.detail||' server routing');
  if tax.detail='impersonating_me' then perform set_config('test.ordinary',case_id::text,true); end if;
 end loop;
end$$;
set local role service_role;
select pg_temp.expect_error(format('select public.submit_safety_removal_v1(%L,%L,%L)',gen_random_uuid(),repeat('a',64),(current_setting('test.request')::jsonb||'{"reason":"spam_scam","detail":"child_sexual_content"}')::text),'valid category');
select pg_temp.expect_error(format('select public.submit_safety_removal_v1(%L,%L,%L)',gen_random_uuid(),repeat('a',64),(current_setting('test.request')::jsonb||'{"queue":"moderation"}')::text),'Invalid request');
select pg_temp.expect_error(format('select public.submit_safety_removal_v1(%L,%L,%L)',current_setting('test.case'),current_setting('test.secret'),(current_setting('test.request')::jsonb||'{"reason":"spam_scam","detail":"spam"}')::text),'reference already used');
reset role;
update public.admin_employees set roles=array['moderator'] where id=current_setting('test.employee')::uuid;
select pg_temp.check_true(not exists(select 1 from public.safety_removal_alerts a join public.safety_removal_cases c on c.id=a.case_id where c.priority='normal'),'routine cases do not send urgent email');
select pg_temp.check_true(not exists(select 1 from public.safety_removal_cases c where c.priority in ('high','critical') and not exists(select 1 from public.safety_removal_alerts a where a.case_id=c.id)),'urgent cases retain durable alert intent');
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select pg_temp.check_true(public.get_admin_safety_removal_v1(current_setting('test.ordinary')::uuid)->>'queue'='moderation','moderator reads ordinary case');
select pg_temp.check_true(not exists(select 1 from jsonb_array_elements(public.get_admin_safety_removals_v1(null,null,false,'moderation')->'items') x where x->>'queue'<>'moderation'),'ordinary page excludes restricted cases');
select pg_temp.expect_error('select public.get_admin_safety_removals_v1(null,null,false,''restricted_safety'')','Restricted employee');
select pg_temp.expect_error(format('select public.get_admin_safety_removal_v1(%L)',current_setting('test.case')),'Case unavailable');
select pg_temp.expect_error(format('select public.get_admin_safety_target_v1(%L,''post'',%L)',current_setting('test.case'),current_setting('test.post')),'Case unavailable');
select pg_temp.expect_error(format('select public.admin_safety_removal_command_v1(%L,8,%L,%L)',current_setting('test.case'),gen_random_uuid(),'{"action":"claim","note":"Unauthorized restricted read"}'),'Case unavailable');
select pg_temp.expect_error(format('select public.admin_create_safety_report_v1(%L,8,%L,%L)',current_setting('test.case'),gen_random_uuid(),current_setting('test.handoff')),'Case unavailable');
select pg_temp.expect_error(format('select public.get_admin_safety_target_v1(%L,''post'',%L)',current_setting('test.ordinary'),current_setting('test.post')),'Content type does not match');
select set_config('test.ordinary_target',public.get_admin_safety_target_v1(current_setting('test.ordinary')::uuid,'account',current_setting('test.author')::uuid)::text,true);
select set_config('test.ordinary_handoff',jsonb_build_object('kind','account','target_id',current_setting('test.author'),'fingerprint',current_setting('test.ordinary_target')::jsonb->>'fingerprint','note','Verified exact account identified by external request')::text,true);
select set_config('test.ordinary_result',public.admin_create_safety_report_v1(current_setting('test.ordinary')::uuid,1,'12345678-1111-4111-8111-111111111111',current_setting('test.ordinary_handoff')::jsonb)::text,true);
select pg_temp.check_true(public.admin_create_safety_report_v1(current_setting('test.ordinary')::uuid,1,'12345678-1111-4111-8111-111111111111',current_setting('test.ordinary_handoff')::jsonb)=current_setting('test.ordinary_result')::jsonb,'ordinary handoff replay stable');
reset role;
select pg_temp.check_true(exists(select 1 from public.reports r join public.admin_report_triage t on t.report_id=r.id where r.id=(current_setting('test.ordinary_result')::jsonb->>'report_id')::uuid and r.reason='impersonation' and r.reason_detail='impersonating_me' and r.target_kind='account' and t.queue='moderation' and t.priority='normal' and r.reporter_id is null),'ordinary bridge preserves exact allegation and queue');
select pg_temp.check_true((select moderation_status<>'quarantined' from public.posts where id=current_setting('test.post')::uuid),'ordinary account handoff does not quarantine content');
select pg_temp.check_true(not exists(select 1 from public.domain_event_outbox where topic is null),'all categories preserve valid event topics');
update public.admin_employees set roles=array['super_admin'] where id=current_setting('test.employee')::uuid;
