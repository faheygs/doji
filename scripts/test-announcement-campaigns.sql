-- Run only inside the synthetic offline harness after editorial fixtures.
reset role;
update public.app_announcements set enabled=false; -- Prior synthetic lifecycle fixtures only.
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; b jsonb; input jsonb; id uuid; begin
 input:=jsonb_build_object('title','Reward campaign','body','Your ideas matter.',
  'starts_at',clock_timestamp()-interval '1 hour','ends_at',clock_timestamp()+interval '1 day',
  'priority',0,'max_impressions_per_user',3,'min_hours_between_impressions',1,
  'cta_label','Suggest a Doji','cta_url','/(app)/suggest-challenge','reward_action','submit_idea','reward_sparks',500);
 perform set_config('test.campaign_input',input::text,true);
 a:=public.admin_editorial_command_v1('announcements','create',null,null,input,'Synthetic reward campaign','campaign-create-one');
 perform set_config('test.campaign',a->>'id',true);
 perform pg_temp.check_true(a->>'reward_sparks'='500' and a->>'reward_action'='submit_idea' and not (a->>'enabled')::boolean,'dynamic reward draft stays disabled');
 a:=public.admin_editorial_command_v1('announcements','save',(a->>'id')::uuid,a->>'version',input||'{"reward_sparks":750}','Change draft amount','campaign-save-amount');
 perform pg_temp.check_true(a->>'reward_sparks'='750','amount is editable per draft');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''save'',%L,%L,%L,''Legacy form protection'',''campaign-old-ui-key'')',a->>'id',a->>'version',(input-'reward_action'-'reward_sparks')::text),'Refresh the portal');
 a:=public.admin_editorial_command_v1('announcements','save',(a->>'id')::uuid,a->>'version',input,'Restore example amount','campaign-restore-amount');
 perform set_config('test.draft_version',a->>'version',true);
 foreach input in array array[
  input||'{"reward_sparks":0}', input||'{"reward_sparks":10001}', input||'{"reward_sparks":-1}',
  input||'{"reward_sparks":1.5}', input||'{"reward_sparks":"500"}', input||'{"reward_action":"visit_shop"}',
  input||'{"reward_action":null}',input||'{"cta_url":"/(app)/profile/shop"}'
 ] loop
   begin
     perform public.admin_editorial_command_v1('announcements','create',null,null,input,'Reject invalid reward',gen_random_uuid()::text);
     raise exception 'FAIL: invalid reward accepted';
   exception when raise_exception then if sqlerrm like 'FAIL:%' then raise; end if; end;
 end loop;
 perform pg_temp.check_true(true,'invalid amounts, unsupported actions, orphan reward and shop mismatch rejected');
 input:=current_setting('test.campaign_input')::jsonb;
 b:=public.admin_editorial_command_v1('announcements','create',null,null,(input-'reward_action'-'reward_sparks')||'{"cta_url":"/(app)/profile/shop"}','Shop without a reward','campaign-shop-draft');
 perform set_config('test.shop',b->>'id',true);
 perform pg_temp.check_true(b->>'reward_sparks'='0' and b->>'reward_action' is null,'shop no-reward draft supported');
end$$;
reset role;
-- Privilege assertions include hosted-style default grants in the harness.
select pg_temp.check_true(not has_function_privilege('authenticated','public.complete_announcement_idea_v1(uuid)','execute'),'member cannot call reward helper');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.complete_announcement_idea_v1(uuid)','execute'),'employee cannot call reward helper');
select pg_temp.check_true(not has_function_privilege('service_role','public.complete_announcement_idea_v1(uuid)','execute'),'service default helper grant removed');
select pg_temp.check_true(not has_table_privilege('authenticated','public.app_announcement_completions','select,insert,update,delete'),'completion ledger private');
select pg_temp.check_true(not has_table_privilege('doji_employee','public.app_announcement_completions','select,insert,update,delete'),'staff completion ledger private');
select pg_temp.check_true(not has_table_privilege('service_role','public.app_announcement_completions','select,insert,update,delete'),'service default completion grants removed');
select pg_temp.expect_error($cmd$insert into public.app_announcements(title,body,starts_at,ends_at,enabled,reward_sparks) values('Invalid orphan reward','Synthetic',now(),now()+interval '1 hour',false,500)$cmd$,'announcement_reward_configuration');

select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select public.submit_challenge_suggestion('question','An idea before publication is not rewarded','ignored','[]','campaign-before-live');
reset role;
select pg_temp.check_true(not exists(select 1 from public.app_announcement_completions),'unpublished draft never awards');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; b jsonb; begin
 a:=public.get_admin_editorial_item_v1('announcements',current_setting('test.campaign')::uuid);
 a:=public.admin_editorial_command_v1('announcements','publish',(a->>'id')::uuid,a->>'version','{}','Publish offline only','campaign-publish-one');
 b:=public.get_admin_editorial_item_v1('announcements',current_setting('test.shop')::uuid);
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''publish'',%L,%L,''{}'',''Overlap must fail'',''campaign-overlap-key'')',b->>'id',b->>'version'),'overlaps');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''announcements'',''save'',%L,%L,%L,''Terms cannot change'',''campaign-terms-key'')',a->>'id',a->>'version',current_setting('test.campaign_input')),'no longer available');
end$$;
reset role;
select pg_temp.expect_error(format('update public.app_announcements set enabled=true where id=%L',current_setting('test.shop')),'exclusion constraint');
select pg_temp.check_true((select count(*)=1 from public.app_announcements where enabled),'table enforces single overlapping window');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
do $$declare claim record; s jsonb; retry jsonb; begin
  select * into claim from public.claim_active_app_announcement();
 perform pg_temp.check_true(claim.body like '%500 Sparks.%' and claim.body like '%Once per member%' and claim.body like '%UTC%','member claim carries structured reward terms with deadline');
 perform public.record_app_announcement_action(claim.id,'cta');
 perform public.record_app_announcement_action(claim.id,'dismissed');
 perform pg_temp.check_true(not exists(select 1 from public.claim_active_app_announcement()),'Not now remains durable');
 perform pg_temp.expect_error($cmd$select public.submit_challenge_suggestion('question','tiny','ignored','[]','campaign-invalid-idea')$cmd$,'Invalid suggestion');
 perform pg_temp.expect_error($cmd$select public.submit_challenge_suggestion('question','An idea before publication is not rewarded','ignored','[]','campaign-duplicate-idea')$cmd$,'already exists');
 s:=public.submit_challenge_suggestion('question','Share a small kindness you noticed today','ignored','[]','campaign-qualified-idea');
 retry:=public.submit_challenge_suggestion('question','Share a small kindness you noticed today','ignored','[]','campaign-qualified-idea');
 perform pg_temp.check_true(s=retry,'submission retry preserves existing receipt');
 perform set_config('test.reward_suggestion',s->>'id',true);
 perform public.submit_challenge_suggestion('question','Share something else that inspires you today','ignored','[]','campaign-second-idea');
end$$;
reset role;
select pg_temp.check_true((select count(*)=1 and sum(sparks)=500 from public.app_announcement_completions),'one completion despite repeat and different-key submissions');
select pg_temp.check_true((select count(*)=1 and sum(delta)=500 from public.spark_ledger where reason='announcement_completion'),'reward ledger pays exactly once');
select pg_temp.check_true((select suggestion_id=current_setting('test.reward_suggestion')::uuid from public.app_announcement_completions),'reward bound to actual new submission');
select pg_temp.check_true(exists(select 1 from public.domain_event_outbox where event_type='account.profile.updated'),'existing balance invalidation remains available');

select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; begin
 a:=public.get_admin_editorial_item_v1('suggestions',current_setting('test.reward_suggestion')::uuid);
 perform public.admin_editorial_command_v1('suggestions','approved',(a->>'id')::uuid,a->>'version','{}','Keep approval reward','campaign-approve-idea');
end$$;
reset role;
select pg_temp.check_true((select sum(delta)=15 from public.spark_ledger where ref_id='suggestion:'||current_setting('test.reward_suggestion') and reason='suggestion_approved'),'approval reward remains separate 15 Sparks');
delete from public.challenge_suggestions where id=current_setting('test.reward_suggestion')::uuid;
select pg_temp.check_true((select count(*)=1 from public.app_announcement_completions),'idea deletion cannot reset campaign entitlement');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; b jsonb; begin
 a:=public.get_admin_editorial_item_v1('announcements',current_setting('test.campaign')::uuid);
 perform public.admin_editorial_command_v1('announcements','cancel',(a->>'id')::uuid,a->>'version','{}','End offline campaign','campaign-cancel-one');
 b:=public.get_admin_editorial_item_v1('announcements',current_setting('test.shop')::uuid);
 b:=public.admin_editorial_command_v1('announcements','publish',(b->>'id')::uuid,b->>'version','{}','Show shop without bonus','campaign-shop-publish');
 perform pg_temp.check_true(b->>'cta_url'='/(app)/profile/shop','shop publication supported');
end$$;
reset role;
select pg_temp.check_true((select count(*)=1 and sum(delta)=500 from public.spark_ledger where reason='announcement_completion'),'cancellation retains earned Sparks');
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select public.submit_challenge_suggestion('question','A shop promotion must not pay for this idea','ignored','[]','campaign-shop-no-pay');
reset role;
select pg_temp.check_true((select count(*)=1 from public.app_announcement_completions),'no-reward campaign does not award');
-- The committed disposable-database suite checks the index path separately.
-- A new expression index built after HOT updates in this rollback-only
-- transaction may not yet be planner-usable until its creation commits.
