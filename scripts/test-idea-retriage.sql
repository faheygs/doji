reset role;
select set_config('request.jwt.claims','{}',true);
-- The shared editorial fixture may already have reviewed this idea using the
-- current command. Count only the three transitions exercised by this suite.
select set_config('test.retriage_update_count',(select count(*)::text from public.domain_event_outbox
 where event_type='notification.suggestion.updated' and aggregate_id='11111111-2222-4333-8444-555555555555'),true);
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,options,status) values
 ('71111111-2222-4333-8444-555555555555',(select id from public.profiles where username='editorial_test'),'question','What would you like to learn?','retriage-new-declined','[]','rejected');
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; original_challenge uuid; begin
 a:=public.get_admin_editorial_item_v1('suggestions','11111111-2222-4333-8444-555555555555');
 original_challenge:=(a->>'challenge_id')::uuid;
 perform pg_temp.check_true(a->'allowed_actions'='["rejected","pending"]'::jsonb,'accepted record remains actionable');
 a:=public.admin_editorial_command_v1('suggestions','rejected',(a->>'id')::uuid,a->>'version','{}','Correction after second review','retriage-decline-1');
 perform pg_temp.check_true(a->>'status'='rejected' and a->>'pool_active'='false','reversal removes future pool eligibility');
 a:=public.admin_editorial_command_v1('suggestions','pending',(a->>'id')::uuid,a->>'version','{}','Reopen for further review','retriage-reopen-1');
 perform pg_temp.check_true(a->>'status'='pending' and a->>'pool_active'='false','reopened remains excluded from pool');
 a:=public.admin_editorial_command_v1('suggestions','approved',(a->>'id')::uuid,a->>'version','{}','Reconsidered with full context','retriage-accept-1');
 perform pg_temp.check_true(a->>'status'='approved' and a->>'pool_active'='true' and (a->>'challenge_id')::uuid=original_challenge,'reaccept reuses original challenge');
 perform pg_temp.check_true(jsonb_array_length(a->'recent_history')=4,'all decisions retained in audit');
 perform pg_temp.check_true(a->>'username'='editorial_test' and a->>'reviewed_at' is not null,'detail supplies safe identity and timestamps');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''suggestions'',''approved'',%L,%L,''{}'',''Same status no effects'',''retriage-same-state'')',a->>'id',a->>'version'),'already has that status');
end$$;
reset role;
-- A submission campaign bonus survives every review transition independently
-- of the once-only approval reward.
insert into public.app_announcements(id,title,body,cta_label,cta_url,starts_at,ends_at,enabled,reward_action,reward_sparks)
 values('a1111111-2222-4333-8444-555555555555','Synthetic reward','Offline only','Suggest','/(app)/suggest-challenge',now()-interval '1 minute',now()+interval '1 hour',true,'submit_idea',500);
select set_config('request.jwt.claims',jsonb_build_object('sub',(select id from public.profiles where username='editorial_test'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select set_config('test.reward_idea',(public.submit_challenge_suggestion('question','Describe something you learned this week','ignored-client-hash','[]','retriage-reward-submit')->>'id'),true);
reset role;
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; decision text; begin
 foreach decision in array array['approved','rejected','pending','approved'] loop
  a:=public.get_admin_editorial_item_v1('suggestions',current_setting('test.reward_idea')::uuid);
  perform public.admin_editorial_command_v1('suggestions',decision,(a->>'id')::uuid,a->>'version','{}','Campaign reward review test','reward-review-'||gen_random_uuid()::text);
 end loop;
end$$;
reset role;
select pg_temp.check_true((select count(*)=1 and sum(sparks)=500 from public.app_announcement_completions where announcement_id='a1111111-2222-4333-8444-555555555555'),'campaign completion and reward preserved once');
select pg_temp.check_true((select count(*)=1 and sum(delta)=500 from public.spark_ledger where reason='announcement_completion'),'campaign ledger credit preserved once');
select pg_temp.check_true((select count(*)=1 and sum(delta)=15 from public.spark_ledger where ref_id='suggestion:'||current_setting('test.reward_idea') and reason='suggestion_approved'),'campaign idea approval reward remains once only');
select pg_temp.check_true(not has_function_privilege('authenticated','public.admin_idea_review_state_v1(uuid)','execute') and not has_function_privilege('doji_employee','public.admin_idea_review_state_v1(uuid)','execute'),'new helper stays private');
create temp table prior_pool as select id,is_active from public.challenges;
update public.challenges set is_active=false where id<>(select challenge_id from public.admin_suggestion_reviews where suggestion_id=current_setting('test.reward_idea')::uuid);
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; begin
 a:=public.get_admin_editorial_item_v1('suggestions',current_setting('test.reward_idea')::uuid);
 perform pg_temp.check_true(a->'allowed_actions'='[]'::jsonb,'last eligible challenge cannot be withdrawn');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''suggestions'',''pending'',%L,%L,''{}'',''Last challenge safeguard'',''retriage-last-challenge'')',a->>'id',a->>'version'),'at least one eligible');
end$$;
reset role;
update public.challenges c set is_active=p.is_active from prior_pool p where p.id=c.id;
select pg_temp.check_true((select count(*)=1 and sum(delta)=15 from public.spark_ledger where ref_id='suggestion:11111111-2222-4333-8444-555555555555' and reason='suggestion_approved'),'reaccept cannot farm approval Sparks');
select pg_temp.check_true((select count(*)=2 from public.poll_options where challenge_id=(select challenge_id from public.admin_suggestion_reviews where suggestion_id='11111111-2222-4333-8444-555555555555')),'reaccept preserves exact poll options');
select pg_temp.check_true((select count(*)=current_setting('test.retriage_update_count')::bigint+3
 from public.domain_event_outbox where event_type='notification.suggestion.updated'
 and aggregate_id='11111111-2222-4333-8444-555555555555' and payload->>'sendPush'='false'
 and topic='user:'||current_setting('test.member')||':events'),'every reversal emits private no-push invalidation');
select pg_temp.check_true((select count(*)=2 from public.domain_event_outbox where event_type='notification.suggestion.reviewed' and aggregate_id='11111111-2222-4333-8444-555555555555'),'existing push dedupe preserved across repeated acceptance');
select pg_temp.check_true(not exists(select 1 from public.daily_events),'retriage never schedules a Doji');

-- Scheduled/unclosed and completed events: never alter any occurrence.
insert into public.daily_events(id,challenge_id,fires_at,window_minutes) select
 '91111111-2222-4333-8444-555555555555',challenge_id,now()+interval '1 day',10
 from public.admin_suggestion_reviews where suggestion_id='11111111-2222-4333-8444-555555555555';
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; begin
 a:=public.get_admin_editorial_item_v1('suggestions','11111111-2222-4333-8444-555555555555');
 perform pg_temp.check_true(a->'allowed_actions'='[]'::jsonb and a->>'scheduled_at' is not null,'scheduled record explains blocked action');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''suggestions'',''rejected'',%L,%L,''{}'',''Scheduled safeguard test'',''retriage-scheduled'')',a->>'id',a->>'version'),'scheduled or unclosed');
end$$;
reset role;
update public.daily_events set fires_at=now()-interval '1 day',closes_at=now()-interval '23 hours',closed_at=now()-interval '23 hours' where id='91111111-2222-4333-8444-555555555555';
create temp table preserved_event as select to_jsonb(e) data from public.daily_events e where id='91111111-2222-4333-8444-555555555555';
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; begin
 a:=public.get_admin_editorial_item_v1('suggestions','11111111-2222-4333-8444-555555555555');
 a:=public.admin_editorial_command_v1('suggestions','pending',(a->>'id')::uuid,a->>'version','{}','Reopen after completed event','retriage-after-close');
 perform pg_temp.check_true(a->>'pool_active'='false','completed history does not prevent future withdrawal');
 -- Declined ideas with no prior challenge can be accepted normally.
 a:=public.get_admin_editorial_item_v1('suggestions','71111111-2222-4333-8444-555555555555');
 a:=public.admin_editorial_command_v1('suggestions','approved',(a->>'id')::uuid,a->>'version','{}','Reconsider declined idea','retriage-declined-accept');
 perform pg_temp.check_true(a->>'status'='approved' and a->>'challenge_id' is not null,'decline can be reversed');
end$$;
reset role;
select pg_temp.check_true((select data=(select to_jsonb(e) from public.daily_events e where id='91111111-2222-4333-8444-555555555555') from preserved_event),'past occurrence unchanged');
-- Historical decisions without a verified challenge link cannot invent mappings.
delete from public.admin_suggestion_reviews where suggestion_id='71111111-2222-4333-8444-555555555555';
select set_config('request.jwt.claims',current_setting('test.claims'),true);
set local role doji_employee;
do $$declare a jsonb; begin
 a:=public.get_admin_editorial_item_v1('suggestions','71111111-2222-4333-8444-555555555555');
 perform pg_temp.check_true(a->'allowed_actions'='[]'::jsonb,'unlinked historical acceptance blocked');
 perform pg_temp.expect_error(format('select public.admin_editorial_command_v1(''suggestions'',''pending'',%L,%L,''{}'',''Unknown historical mapping'',''retriage-legacy-test'')',a->>'id',a->>'version'),'original challenge link');
end$$;
reset role;
