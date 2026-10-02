create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 raise notice 'PASS: %',label;
end$$;
create function pg_temp.expect_error(command text,fragment text) returns void language plpgsql as $$begin
 begin execute command; exception when others then
   if position(fragment in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'FAIL: expected error containing %',fragment;
end$$;
select set_config('test.member',id::text,true) from auth.users where role='authenticated' limit 1;
select set_config('test.employee',id::text,true) from public.admin_employees where 'super_admin'=any(roles) limit 1;
select set_config('test.claims',jsonb_build_object('sub',current_setting('test.employee'),'role','doji_employee','aal','aal2')::text,true);
update auth.users set raw_user_meta_data=raw_user_meta_data||jsonb_build_object(
 'terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now())
 where id=current_setting('test.member')::uuid;
insert into public.profiles(id,username,display_name) values(current_setting('test.member')::uuid,'editorial_test','Synthetic Member');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
select pg_temp.check_true(not has_table_privilege(current_user,'public.app_announcements','UPDATE'),'no direct member table write');
select pg_temp.check_true(not has_function_privilege('authenticated','public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)','EXECUTE'),'member command grant denied');
select pg_temp.check_true(not has_function_privilege('anon','public.get_admin_editorial_page_v1(text,integer,timestamptz,uuid,text)','EXECUTE'),'anon read denied');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.admin_editorial_item_v1(text,uuid)','EXECUTE'),'internal helper ungranted');
select pg_temp.check_true(not has_function_privilege('service_role','public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)','EXECUTE'),'service role default function grant removed');
select pg_temp.check_true(not has_table_privilege('service_role','public.admin_announcement_state','SELECT,INSERT,UPDATE,DELETE'),'service role default table grant removed');
do $$declare a jsonb; b jsonb; input jsonb; id uuid; v text; begin
 input:=jsonb_build_object('title','Synthetic announcement','body','Local fixture only','starts_at',now()-interval '1 minute',
  'ends_at',now()+interval '1 day','priority',0,'max_impressions_per_user',1,'min_hours_between_impressions',24);
 a:=public.admin_editorial_command_v1('announcements','create',null,null,input,'Test announcement draft','editorial-create-key');
 id:=(a->>'id')::uuid; v:=a->>'version';
 perform set_config('test.announcement',id::text,true);
 perform pg_temp.check_true(a->>'state'='draft' and a->>'enabled'='false','draft invisible to members');
 b:=public.admin_editorial_command_v1('announcements','create',null,null,input,'Test announcement draft','editorial-create-key');
 perform pg_temp.check_true(a=b,'create retry returns same result');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''create'',null,null,%L,''Different reason'',''editorial-create-key'')',input::text),'different command');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''save'',%L,''stale'',%L,''Test stale draft'',''editorial-stale-key'')',id,input::text),'Item changed');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''save'',%L,%L,%L,''Unsafe destination'',''editorial-link-key'')',id,v,(input||'{"cta_label":"Go","cta_url":"javascript:alert(1)"}')::text),'supported in-app');
 b:=public.get_admin_editorial_item_v1('announcements',id);
 perform pg_temp.check_true(jsonb_array_length(b->'recent_history')=1,'audited create visible');
 a:=public.admin_editorial_command_v1('announcements','publish',id,v,'{}','Publish reviewed fixture','editorial-publish-key');
 perform pg_temp.check_true(a->>'display_state'='live','publish enables eligible announcement');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''save'',%L,%L,%L,''Cannot edit published'',''editorial-immutable-key'')',id,a->>'version',input::text),'no longer available');
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select pg_temp.check_true((select count(*)=1 from public.claim_active_app_announcement()),'existing member claim still works');
select pg_temp.check_true((select count(*)=0 from public.claim_active_app_announcement()),'existing impression cap still works');
reset role;
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; begin
 a:=public.get_admin_editorial_item_v1('announcements',current_setting('test.announcement')::uuid);
 a:=public.admin_editorial_command_v1('announcements','cancel',(a->>'id')::uuid,a->>'version','{}','Cancel synthetic fixture','editorial-cancel-key');
 perform pg_temp.check_true(a->>'display_state'='cancelled' and a->>'enabled'='false','cancel stops future claims');
end$$;
reset role;
select pg_temp.check_true((select count(*)=1 from public.app_announcement_receipts where announcement_id=current_setting('test.announcement')::uuid),'cancel preserves member receipt');
select set_config('request.jwt.claims','{}',true);
-- Legacy badge triggers assume the badge catalog exists (fixture has no seed data).
insert into public.badges(id,name,emoji,description,criteria_type,criteria_value) values
 ('idea_submitted','Submitted','test','Synthetic','ideas',1),('idea_picked','Picked','test','Synthetic','ideas',1) on conflict do nothing;
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,options) values
 ('11111111-2222-4333-8444-555555555555',current_setting('test.member')::uuid,'wyr','Would you rather choose tea or coffee?','editorial-test-wyr','["Tea","Coffee"]'),
 ('21111111-2222-4333-8444-555555555555',current_setting('test.member')::uuid,'question','What made you smile today?','editorial-test-question','[]');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; b jsonb; v text; begin
 a:=public.get_admin_editorial_item_v1('suggestions','11111111-2222-4333-8444-555555555555'); v:=a->>'version';
 a:=public.admin_editorial_command_v1('suggestions','approved','11111111-2222-4333-8444-555555555555',v,'{}','Balanced safe choices','editorial-approve-key');
 b:=public.admin_editorial_command_v1('suggestions','approved','11111111-2222-4333-8444-555555555555',v,'{}','Balanced safe choices','editorial-approve-key');
 perform pg_temp.check_true(a=b and a->>'status'='approved','review retry is exactly once');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''suggestions'',''rejected'',''11111111-2222-4333-8444-555555555555'',%L,''{}'',''Stale conflicting decision'',''editorial-reject-key'')',v),'Idea changed');
 a:=public.get_admin_editorial_item_v1('suggestions','21111111-2222-4333-8444-555555555555');
 perform set_config('test.decline_version',a->>'version',true);
 a:=public.admin_editorial_command_v1('suggestions','rejected',(a->>'id')::uuid,a->>'version','{}','Too similar to prior ideas','editorial-decline-key');
 perform pg_temp.check_true(a->>'status'='rejected' and a->>'challenge_id' is null,'decline creates no challenge');
 a:=public.get_admin_editorial_page_v1('suggestions',1);
 perform pg_temp.check_true(jsonb_array_length(a->'items')=1 and a->'next_cursor'<>'null','bounded first page');
 b:=public.get_admin_editorial_page_v1('suggestions',1,(a#>>'{next_cursor,at}')::timestamptz,(a#>>'{next_cursor,id}')::uuid);
 perform pg_temp.check_true(a#>>'{items,0,id}'<>b#>>'{items,0,id}','keyset page has no overlap');
end$$;
reset role;
select pg_temp.check_true((select count(*)=2 from public.poll_options where challenge_id=(select challenge_id from public.admin_suggestion_reviews where decision='approved')),'WYR preserves exactly two options');
select pg_temp.check_true(not exists(select 1 from public.daily_events),'review never schedules Doji');
select pg_temp.check_true(not exists(select 1 from public.profiles where id=current_setting('test.employee')::uuid),'employee has no member profile');
select pg_temp.check_true((select count(*)=1 and sum(delta)=15 from public.spark_ledger where ref_id='suggestion:11111111-2222-4333-8444-555555555555' and reason='suggestion_approved'),'existing reward exactly once');
select pg_temp.check_true((select count(*)=1 from public.domain_event_outbox where event_type='notification.suggestion.reviewed' and aggregate_id='11111111-2222-4333-8444-555555555555'),'existing approval notification exactly once');
select pg_temp.check_true((select count(*)=1 from public.domain_event_outbox where event_type='notification.suggestion.reviewed' and aggregate_id='21111111-2222-4333-8444-555555555555'),'existing rejection notification exactly once');
select pg_temp.check_true((select reviewed_by is null from public.challenge_suggestions where id='11111111-2222-4333-8444-555555555555'),'employee not written to member FK');
-- Validate all supported mappings, without modifying existing scheduling paths.
select set_config('request.jwt.claims','{}',true);
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,options) values
 ('31111111-2222-4333-8444-555555555555',current_setting('test.member')::uuid,'poll','Choose your favorite time of day','editorial-test-poll','["Morning","Noon","Evening"]'),
 ('41111111-2222-4333-8444-555555555555',current_setting('test.member')::uuid,'photo_idea','Photograph something colorful nearby','editorial-test-photo','[]'),
 ('51111111-2222-4333-8444-555555555555',current_setting('test.member')::uuid,'format_question','Describe your day in three words','editorial-test-format','{"answer_rule":{"type":"exact_word_count","count":3}}'),
 ('61111111-2222-4333-8444-555555555555',current_setting('test.member')::uuid,'question','What is your favorite outdoor activity?','editorial-test-task','[]');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare id uuid; item jsonb; begin
 foreach id in array array['31111111-2222-4333-8444-555555555555','41111111-2222-4333-8444-555555555555','51111111-2222-4333-8444-555555555555','61111111-2222-4333-8444-555555555555']::uuid[] loop
  item:=public.get_admin_editorial_item_v1('suggestions',id);
  perform public.admin_editorial_command_v1('suggestions','approved',id,item->>'version','{}','Safe synthetic test idea','review-'||id::text);
 end loop;
end$$;
reset role;
select pg_temp.check_true((select array_agg(text order by position)=array['Morning','Noon','Evening','Other'] from public.poll_options where challenge_id=(select challenge_id from public.admin_suggestion_reviews where suggestion_id='31111111-2222-4333-8444-555555555555')),'generic poll preserves options plus existing Other');
select pg_temp.check_true((select c.type='photo' and c.requires_photo and not c.requires_text and c.is_active and c.schedule_count=0 from public.challenges c join public.admin_suggestion_reviews r on r.challenge_id=c.id where r.suggestion_id='41111111-2222-4333-8444-555555555555'),'photo mapping matches member contract');
select pg_temp.check_true((select c.type='format' and c.answer_rule='{"type":"exact_word_count","count":3}'::jsonb from public.challenges c join public.admin_suggestion_reviews r on r.challenge_id=c.id where r.suggestion_id='51111111-2222-4333-8444-555555555555'),'format answer rule preserved');
select pg_temp.check_true((select c.type='task' and c.requires_text and not c.requires_photo from public.challenges c join public.admin_suggestion_reviews r on r.challenge_id=c.id where r.suggestion_id='61111111-2222-4333-8444-555555555555'),'question mapping preserved');
select pg_temp.check_true(not exists(select 1 from public.daily_events),'all kinds leave scheduler untouched');
select pg_temp.check_true(not exists(select 1 from public.admin_employee_command_receipts where result->>'operation'='editorial.v1'
 and (result->'result' ?| array['body','title','options','admin_note','author'])),'receipts do not retain a second copy of member content');
set local role doji_employee;
do $$declare a jsonb; b jsonb; input jsonb; begin
 perform pg_temp.check_true(jsonb_array_length(public.get_admin_editorial_page_v1('suggestions',25,null,null,'rejected')->'items')=1,'history filter reaches authoritative rejected records');
 input:=jsonb_build_object('title','Scheduled fixture','body','Not eligible yet','starts_at',now()+interval '1 day','ends_at',now()+interval '2 days','priority',20,'max_impressions_per_user',2,'min_hours_between_impressions',12);
 a:=public.admin_editorial_command_v1('announcements','create',null,null,input,'Future schedule fixture','schedule-create-key');
 a:=public.admin_editorial_command_v1('announcements','publish',(a->>'id')::uuid,a->>'version','{}','Schedule future fixture','schedule-publish-key');
 perform pg_temp.check_true(a->>'display_state'='scheduled','future publish correctly labeled scheduled');
 input:=input||jsonb_build_object('starts_at',now()-interval '2 days','ends_at',now()-interval '1 day');
 a:=public.admin_editorial_command_v1('announcements','create',null,null,input,'Expired window fixture','expired-create-key');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''publish'',%L,%L,''{}'',''Expired draft rejected'',''expired-publish-key'')',a->>'id',a->>'version'),'window has expired');
end$$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select pg_temp.check_true((select count(*)=0 from public.claim_active_app_announcement()),'future/cancelled/expired draft are not claimable');
select pg_temp.check_true(public.get_own_profile() is not null,'member profile read survives editorial activity');
select pg_temp.check_true(public.get_realtime_token_capabilities()->>'userId'=current_setting('test.member'),'member realtime authorization survives');
select public.get_notification_center_snapshot(now()-interval '1 day',1);
select count(*) from public.get_feed_page_snapshot_v2('00000000-0000-0000-0000-000000000000','everyone',1,null,null);
select count(*) from public.get_comment_thread_snapshot('00000000-0000-0000-0000-000000000000','everyone',null,null,1);
reset role;
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local enable_seqscan=off;
do $$declare plan json; begin
 execute 'explain (format json) select id from public.challenge_suggestions order by created_at desc,id desc limit 26' into plan;
 perform pg_temp.check_true(plan::text like '%editorial_suggestions_page_idx%','history uses bounded keyset index');
end$$;
set local enable_seqscan=on;
select set_config('request.jwt.claims','{}',true);
delete from public.challenge_suggestions where id='21111111-2222-4333-8444-555555555555';
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
select pg_temp.check_true(public.admin_editorial_command_v1('suggestions','rejected','21111111-2222-4333-8444-555555555555',
 current_setting('test.decline_version'),'{}','Too similar to prior ideas','editorial-decline-key')->>'item_unavailable'='true',
 'deleted item retry verifies saved outcome without retaining or restoring content');
reset role;
update public.admin_employees set roles=array['operations'] where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true((public.get_admin_editorial_page_v1('suggestions')->>'can_write')='false','operations read only');
select pg_temp.expect_error($q$select public.admin_editorial_command_v1('announcements','create',null,null,'{}','Unauthorized write','editorial-denied-key')$q$,'Editorial permission required');
reset role;
update public.admin_employees set status='disabled' where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.expect_error($q$select public.get_admin_editorial_page_v1('suggestions')$q$,'Editorial permission required');
reset role;
update public.admin_employees set status='active',roles=array['super_admin'] where id=current_setting('test.employee')::uuid;
select set_config('request.jwt.claims',(current_setting('test.claims')::jsonb||'{"aal":"aal1"}')::text,true);
set local role doji_employee;
select pg_temp.expect_error($q$select public.get_admin_editorial_page_v1('suggestions')$q$,'Verified employee access required');
