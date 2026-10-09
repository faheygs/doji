-- Synthetic fixtures only, executed by test-announcement-compose.mts offline.
begin;
set local statement_timeout='15s';
create function pg_temp.ok(v boolean,label text) returns void language plpgsql as $$
begin if v is distinct from true then raise exception 'FAIL: %',label;end if;end$$;
create function pg_temp.denied(command text,fragment text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then
    if position(fragment in sqlerrm)>0 then return;end if;raise;
  end;
  raise exception 'FAIL: expected rejection containing %',fragment;
end$$;
insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
 ('92000000-0000-4000-8000-000000000001','authenticated','doji_employee','compose-staff@test.invalid',now(),'{"account_type":"employee"}','{}'),
 ('92000000-0000-4000-8000-000000000002','authenticated','authenticated','compose-member@test.invalid',now(),'{}','{}'),
 ('92000000-0000-4000-8000-000000000003','authenticated','authenticated','compose-other@test.invalid',now(),'{}','{}');
insert into public.admin_employees(id,display_name,status,roles) values
 ('92000000-0000-4000-8000-000000000001','Synthetic compose employee','active',array['super_admin']);
update auth.users set raw_user_meta_data=jsonb_build_object(
 'terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now())
 where role='authenticated';
insert into public.profiles(id,username,display_name) values
 ('92000000-0000-4000-8000-000000000002','compose_member','Synthetic member'),
 ('92000000-0000-4000-8000-000000000003','compose_other','Synthetic other');
update public.admin_employee_cutover set employee_only=true;
select set_config('test.claims','{"sub":"92000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}',true);
select set_config('request.jwt.claims',current_setting('test.claims'),true);
select pg_temp.ok(not has_function_privilege('anon','public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)','execute'),'anonymous denied');
select pg_temp.ok(not has_function_privilege('authenticated','public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)','execute'),'member denied');
select pg_temp.ok(not has_function_privilege('service_role','public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)','execute'),'service default grant removed');
set local role doji_employee;
do $$declare a jsonb;b jsonb;payload jsonb;draft jsonb;request uuid;begin
 payload:=jsonb_build_object('title','Synthetic announcement','body','Offline fixture',
  'starts_at',now()+interval '1 day','ends_at',now()+interval '2 days',
  'priority',0,'max_impressions_per_user',1,'min_hours_between_impressions',24);
 perform set_config('test.payload',payload::text,true);
 request:='92000000-0000-4000-8000-000000000010';
 a:=public.admin_announcement_compose_v1('save_draft',null,null,payload,request);
 perform pg_temp.ok(a#>>'{item,state}'='draft' and a#>>'{item,enabled}'='false','draft disabled');
 b:=public.admin_announcement_compose_v1('save_draft',null,null,payload,request);
 perform pg_temp.ok(b->>'replayed'='true' and a->'item'=b->'item' and a->'command'=b->'command','exact retry');
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''publish'',null,null,%L,%L)',payload,request),'different command');
 perform set_config('test.draft',a#>>'{item,id}',true);
 perform set_config('test.draft_version',a#>>'{item,version}',true);
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',%L,%L,%L,gen_random_uuid())',
   a#>>'{item,id}',repeat('0',32),payload),'Item changed');
 b:=public.admin_announcement_compose_v1('save_draft',(a#>>'{item,id}')::uuid,a#>>'{item,version}',
   payload||'{"title":"Updated draft"}',gen_random_uuid());
 perform pg_temp.ok(b#>>'{item,title}'='Updated draft','save existing draft');
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',%L,%L,%L,gen_random_uuid())',
   a#>>'{item,id}',a#>>'{item,version}',payload),'Item changed');
 -- Schedule is one call and one transaction, not a disabled future draft.
 a:=public.admin_announcement_compose_v1('schedule',null,null,payload,gen_random_uuid());
 perform pg_temp.ok(a#>>'{item,state}'='published' and a#>>'{item,display_state}'='scheduled'
   and a#>>'{item,enabled}'='true','schedule enabled for future eligibility');
 perform set_config('test.scheduled',a#>>'{item,id}',true);
 -- Immediate publication has server-owned start time and cannot hide a schedule.
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''publish'',null,null,%L,gen_random_uuid())',payload),'must not include');
 payload:=payload||jsonb_build_object('starts_at',null,'ends_at',now()+interval '1 hour');
 perform set_config('test.immediate_payload',payload::text,true);
 a:=public.admin_announcement_compose_v1('publish',null,null,payload,'92000000-0000-4000-8000-000000000020');
 perform pg_temp.ok(a#>>'{item,state}'='published' and a#>>'{item,display_state}'='live','publish live');
 perform pg_temp.ok((a#>>'{item,starts_at}')::timestamptz=transaction_timestamp(),'server start');
 perform set_config('test.live',a#>>'{item,id}',true);
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',%L,%L,%L,gen_random_uuid())',
   a#>>'{item,id}',a#>>'{item,version}',current_setting('test.payload')),'no longer available');
 -- Failed create + publish must leave no draft, receipt or audit behind.
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''publish'',null,null,%L,%L)',
   payload,'92000000-0000-4000-8000-000000000030'),'overlaps');
 -- Failed save + publish must restore the original draft, including its version.
 draft:=public.get_admin_editorial_item_v1('announcements',current_setting('test.draft')::uuid);
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''publish'',%L,%L,%L,%L)',
   draft->>'id',draft->>'version',payload||'{"title":"Must roll back"}',
   '92000000-0000-4000-8000-000000000031'),'overlaps');
 b:=public.get_admin_editorial_item_v1('announcements',(draft->>'id')::uuid);
 perform pg_temp.ok(b=draft,'failed publish restores entire draft/history/version');
 foreach payload in array array[
   current_setting('test.payload')::jsonb||'{"title":""}',
   current_setting('test.payload')::jsonb||'{"priority":99}',
   current_setting('test.payload')::jsonb||'{"unexpected":true}',
   current_setting('test.payload')::jsonb||'{"cta_label":"Unsafe","cta_url":"javascript:alert(1)"}',
   current_setting('test.payload')::jsonb||'{"max_impressions_per_user":0}',
   current_setting('test.payload')::jsonb||'{"reward_action":"submit_idea","reward_sparks":10001}',
   current_setting('test.payload')::jsonb||'{"ends_at":"infinity"}'
 ] loop
   begin
     perform public.admin_announcement_compose_v1('save_draft',null,null,payload,gen_random_uuid());
     raise exception 'FAIL: invalid payload accepted';
   exception when others then if sqlerrm like 'FAIL:%' then raise;end if;end;
 end loop;
 payload:=current_setting('test.payload')::jsonb||jsonb_build_object('starts_at',now()-interval '1 hour');
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''schedule'',null,null,%L,gen_random_uuid())',payload),'future start');
 payload:=current_setting('test.immediate_payload')::jsonb||jsonb_build_object('ends_at',now()-interval '1 day');
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''publish'',null,null,%L,gen_random_uuid())',payload),'valid start and end');
 -- Reward fields are not dropped when editing an existing reward draft.
 payload:=current_setting('test.payload')::jsonb||'{"reward_action":"submit_idea","reward_sparks":500,"cta_label":"Suggest","cta_url":"/(app)/suggest-challenge"}';
 a:=public.admin_announcement_compose_v1('save_draft',null,null,payload,gen_random_uuid());
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',%L,%L,%L,gen_random_uuid())',
   a#>>'{item,id}',a#>>'{item,version}',payload-'reward_action'-'reward_sparks'),'Refresh the portal');
end$$;
reset role;
select pg_temp.ok((select count(*)=4 from public.app_announcements),'failed calls leave no announcements');
select pg_temp.ok(not exists(select 1 from public.admin_employee_command_receipts
 where idempotency_key like '%92000000-0000-4000-8000-00000000003%'),'failed calls leave no receipts');
select pg_temp.ok(not exists(select 1 from public.admin_audit_log
 where request_id like '%92000000-0000-4000-8000-00000000003%'),'failed calls leave no audit');
select pg_temp.ok(not exists(select 1 from public.admin_employee_command_receipts
 where result->>'operation'='announcement.compose.v1' and result->'result' ?| array['title','body','input']),'no copied content in receipt');
select pg_temp.ok((select count(*)=2 and bool_and(reason='System action summary: publish announcement now')
 from public.admin_audit_log where request_id like '%92000000-0000-4000-8000-000000000020:%'),'publish audited with system summary');
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.ok((select count(*)=1 from public.claim_active_app_announcement()),'member claim preserved');
select pg_temp.ok((select count(*)=0 from public.claim_active_app_announcement()),'impression limit preserved');
select public.record_app_announcement_action(current_setting('test.live')::uuid,'dismissed');
reset role;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select public.record_app_announcement_action(current_setting('test.live')::uuid,'cta');
reset role;
select pg_temp.ok((select count(*)=1 and bool_and(cta_at is null and dismissed_at is not null) from public.app_announcement_receipts),'cross-member receipt isolation');
select pg_temp.ok(not exists(select 1 from public.profiles where id='92000000-0000-4000-8000-000000000001'),'no employee member profile');
select pg_temp.ok(not exists(select 1 from public.daily_events),'no challenge scheduling');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb;b jsonb;begin
 a:=public.get_admin_editorial_item_v1('announcements',current_setting('test.live')::uuid);
 perform public.admin_editorial_command_v1('announcements','cancel',(a->>'id')::uuid,
   a->>'version','{}','Cancel synthetic fixture','compose-cancel-fixture');
 b:=public.admin_announcement_compose_v1('publish',null,null,
   current_setting('test.immediate_payload')::jsonb,'92000000-0000-4000-8000-000000000020');
 perform pg_temp.ok(b#>>'{item,state}'='cancelled' and b#>>'{command,state}'='published'
   and b->>'replayed'='true','retry reports committed command and current cancelled item without republishing');
 -- A legacy caller cannot prepopulate a compose internal key and have it reused.
 perform public.admin_editorial_command_v1('announcements','create',null,null,
   current_setting('test.payload')::jsonb,'Synthetic reserved key',
   'announcement.compose.v1:92000000-0000-4000-8000-000000000040:save');
 perform pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',null,null,%L,%L)',
   current_setting('test.payload'),'92000000-0000-4000-8000-000000000040'),'already reserved');
end$$;
reset role;
select set_config('request.jwt.claims','{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select pg_temp.ok((select count(*)=0 from public.claim_active_app_announcement()),'cancelled and scheduled are not claimable');
reset role;
-- Permission loss must block even a previously successful retry.
select set_config('request.jwt.claims',current_setting('test.claims'),true);
update public.admin_employees set roles=array['operations'] where id='92000000-0000-4000-8000-000000000001';
set local role doji_employee;
select pg_temp.denied(format('select public.admin_announcement_compose_v1(''publish'',null,null,%L,%L)',
 current_setting('test.immediate_payload'),'92000000-0000-4000-8000-000000000020'),'Editorial permission required');
reset role;
update public.admin_employees set roles=array['super_admin'],status='disabled' where id='92000000-0000-4000-8000-000000000001';
set local role doji_employee;
select pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',null,null,%L,gen_random_uuid())',
 current_setting('test.payload')),'Editorial permission required');
reset role;
update public.admin_employees set status='active' where id='92000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',(current_setting('test.claims')::jsonb||'{"aal":"aal1"}')::text,true);
set local role doji_employee;
select pg_temp.denied(format('select public.admin_announcement_compose_v1(''save_draft'',null,null,%L,gen_random_uuid())',
 current_setting('test.payload')),'Verified employee access required');
reset role;
rollback;
