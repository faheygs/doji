create temp table media_test_assertions(label text);
grant insert on pg_temp.media_test_assertions to anon,authenticated,doji_employee,service_role;
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if;
 insert into pg_temp.media_test_assertions values(label);raise notice 'PASS: %',label; end$$;
create function pg_temp.expect_error(command text,fragment text) returns void language plpgsql as $$begin
 begin execute command; exception when others then if position(fragment in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'FAIL: expected %',fragment; end$$;
select set_config('test.employee',id::text,true) from public.admin_employees where 'super_admin'=any(roles) limit 1;
select pg_temp.check_true(length(current_setting('test.employee'))=36,'synthetic staff exists');
-- Metadata only: no hosted or local Storage API deletion in this SQL test.
update storage.objects set version='synthetic-v1',metadata='{"size":7,"mimetype":"image/jpeg"}'
 where bucket_id='post-media' and name=current_setting('test.post')||'.jpg';
insert into storage.objects(bucket_id,name,owner_id,version,metadata) values
 ('post-media',current_setting('test.post')||'z-front.jpg',current_setting('test.author'),'synthetic-front-v1','{"size":7,"mimetype":"image/jpeg"}');
insert into public.media_upload_intents(user_id,user_event_id,idempotency_key,slot,object_path,content_type)
 select user_id,user_event_id,idempotency_key,'front',current_setting('test.post')||'z-front.jpg','image/jpeg' from public.posts where id=current_setting('test.post')::uuid;
update public.posts set front_photo_url='https://test.invalid/storage/v1/object/public/post-media/'||current_setting('test.post')||'z-front.jpg' where id=current_setting('test.post')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.viewer'))::text,true);
set local role authenticated;
select set_config('test.report',public.submit_policy_report(current_setting('test.author')::uuid,current_setting('test.post')::uuid,null,null,'post','other','other',null,'media-integration-report')::text,true);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select public.admin_decide_report_v3((current_setting('test.report')::jsonb->>'id')::uuid,'remove_content','other','level_2','Synthetic finding for integration','Synthetic notice for integration','warning',null,'media-integration-remove');
reset role;
select set_config('test.decision',(select id::text from public.moderation_decisions where report_id=(current_setting('test.report')::jsonb->>'id')::uuid and state='active'),true);
select set_config('test.object',(select object_id::text from public.moderation_media_decisions where decision_id=current_setting('test.decision')::uuid and slot='photo'),true);
select pg_temp.check_true((select count(*)=2 from public.moderation_media_decisions),'real removal command captures both exact post objects once');
select pg_temp.check_true((select moderation_status='removed' from public.posts where id=current_setting('test.post')::uuid),'post removed before worker');
select set_config('test.media_case',gen_random_uuid()::text,true);
insert into public.safety_removal_cases(id,token_hash,request_hash,request,queue,priority,state,report_id)
 values(current_setting('test.media_case')::uuid,repeat('a',64),repeat('b',64),'{"detail":"other"}','moderation','normal','reviewing',(current_setting('test.report')::jsonb->>'id')::uuid);
select pg_temp.check_true(not public.report_media_revocation_complete_v1((current_setting('test.report')::jsonb->>'id')::uuid),'logical hiding alone cannot qualify case closure');
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select pg_temp.expect_error(format('select public.admin_safety_removal_command_v1(%L,1,%L,%L)',current_setting('test.media_case'),gen_random_uuid(),'{"action":"removed","note":"Synthetic completion test","message":"The reported content was removed.","access_review":"Synthetic service access checks were recorded."}'),'Media access verification is incomplete');
reset role;
-- SQL-only simulation of already-qualified verifier output; actual bytes/probes
-- are exercised separately through Storage HTTP and the worker tests.
savepoint completed_media_fixture;
update public.moderation_media_objects set phase='revoked',revoked_at=clock_timestamp();
select pg_temp.check_true(public.report_media_revocation_complete_v1((current_setting('test.report')::jsonb->>'id')::uuid),'all exact slots verified permits closure');
set local role doji_employee;
select public.admin_safety_removal_command_v1(current_setting('test.media_case')::uuid,1,gen_random_uuid(),'{"action":"removed","note":"Synthetic completion test","message":"The reported content was removed.","access_review":"Synthetic service access checks were recorded."}');
reset role;
select pg_temp.check_true((select state='removed' from public.safety_removal_cases where id=current_setting('test.media_case')::uuid),'real intake command closes only after verified media');
rollback to completed_media_fixture;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.author'))::text,true);
set local role authenticated;
select public.submit_moderation_appeal(current_setting('test.decision')::uuid,'Synthetic request for media review','media-integration-appeal');
reset role;
select set_config('test.appeal',(select id::text from public.moderation_appeals where decision_id=current_setting('test.decision')::uuid),true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select pg_temp.expect_error(format('select public.admin_review_moderation_appeal(%L,''reverse'',''Synthetic reversal during media lease'',''media-integration-reverse'')',current_setting('test.appeal')),'Media operation in progress');
reset role;
select pg_temp.check_true((select state='active' from public.moderation_decisions where id=current_setting('test.decision')::uuid),'blocked reversal rolls back decision');
-- Also fence a just-expired request for its bounded in-flight grace interval.
update public.moderation_media_objects set lease_until=clock_timestamp()-interval '10 seconds' where id=current_setting('test.object')::uuid;
set local role doji_employee;
select pg_temp.expect_error(format('select public.admin_review_moderation_appeal(%L,''reverse'',''Synthetic reversal during media grace'',''media-integration-reverse'')',current_setting('test.appeal')),'Media operation in progress');
reset role;
update public.moderation_media_objects set lease_until=null,lease_id=null;
set local role doji_employee;
select public.admin_review_moderation_appeal(current_setting('test.appeal')::uuid,'reverse','Synthetic final media reversal','media-integration-reverse');
reset role;
select pg_temp.check_true((select bool_and(desired='restored' and phase='pending' and revision=2) from public.moderation_media_objects),'reversal queues untouched-source verification');
select pg_temp.check_true((select moderation_status='removed' from public.posts where id=current_setting('test.post')::uuid),'reversal does not expose unverified post');
select pg_temp.check_true(exists(select 1 from public.moderation_notices where decision_id=current_setting('test.decision')::uuid and kind='appeal_reversed' and body like '%pending verification%'),'notice does not promise premature restoration');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.finish_moderation_media_restore_v1(uuid,uuid,bigint,jsonb)','EXECUTE'),'staff cannot fake byte verification');
select pg_temp.check_true(not has_function_privilege('authenticated','public.finish_moderation_media_restore_v1(uuid,uuid,bigint,jsonb)','EXECUTE'),'member cannot fake byte verification');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(current_setting('test.job')::jsonb->>'operation'='restore','worker claims restore operation');
select set_config('test.object',current_setting('test.job')::jsonb->>'id',true);
select pg_temp.check_true(not public.finish_moderation_media_restore_v1(current_setting('test.object')::uuid,gen_random_uuid(),2,current_setting('test.job')::jsonb->'original'),'stale restoration rejected');
select pg_temp.check_true(public.finish_moderation_media_restore_v1(current_setting('test.object')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,2,current_setting('test.job')::jsonb->'original'),'exact untouched identity restored atomically');
select pg_temp.check_true(not public.finish_moderation_media_restore_v1(current_setting('test.object')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,2,current_setting('test.job')::jsonb->'original'),'completed lease cannot replay reference writes');
reset role;
select pg_temp.check_true((select moderation_status='removed' from public.posts where id=current_setting('test.post')::uuid),'first restored file cannot expose multi-file post');
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(public.finish_moderation_media_restore_v1((current_setting('test.job')::jsonb->>'id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,2,current_setting('test.job')::jsonb->'original'),'second file verified');
reset role;
select pg_temp.check_true((select moderation_status='visible' from public.posts where id=current_setting('test.post')::uuid),'verified post visible');
select pg_temp.check_true(exists(select 1 from public.moderation_notices where decision_id=current_setting('test.decision')::uuid and kind='appeal_reversed' and body like '%checks are complete%'),'notice updated only after verified restoration');
-- Avatar integration: real command/appeal, plus synthetic Storage-copy metadata.
insert into storage.buckets(id,name,public) values('avatars','avatars',true) on conflict do nothing;
insert into storage.objects(bucket_id,name,owner_id,version,metadata) values
 ('avatars',current_setting('test.author')||'/original.jpg',current_setting('test.author'),'avatar-v1','{"size":7,"mimetype":"image/jpeg"}');
select set_config('test.avatar','https://test.invalid/storage/v1/object/public/avatars/'||current_setting('test.author')||'/original.jpg',true);
update public.profiles set avatar_url=current_setting('test.avatar') where id=current_setting('test.author')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.viewer'))::text,true);
set local role authenticated;
select set_config('test.avatar_report',public.submit_policy_report(current_setting('test.author')::uuid,null,null,null,'profile_photo','other','other',null,'media-avatar-report')::text,true);
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select public.admin_decide_report_v3((current_setting('test.avatar_report')::jsonb->>'id')::uuid,'remove_profile_photo','other','level_2','Synthetic avatar finding','Synthetic avatar notice','warning',null,'media-avatar-remove');
reset role;
select set_config('test.avatar_decision',(select id::text from public.moderation_decisions where report_id=(current_setting('test.avatar_report')::jsonb->>'id')::uuid and state='active'),true);
select set_config('test.avatar_object',(select object_id::text from public.moderation_media_decisions where decision_id=current_setting('test.avatar_decision')::uuid),true);
select pg_temp.check_true((select avatar_url is null from public.profiles where id=current_setting('test.author')::uuid),'avatar hidden by existing command');
select pg_temp.check_true((select original_url=current_setting('test.avatar') from public.moderation_media_decisions where decision_id=current_setting('test.avatar_decision')::uuid),'capture preserves exact original avatar');
-- Simulate the completed byte worker, which is independently fault-tested.
update public.moderation_media_objects set phase='origin_removed',archive_proof=jsonb_build_object('sha256',repeat('a',64),'size',7,'evidenceIdentity',original),next_attempt_at=clock_timestamp()
 where id=current_setting('test.avatar_object')::uuid;
update storage.objects set id=gen_random_uuid(),owner_id=null,version='restored-copy-v2'
 where bucket_id='avatars' and name=current_setting('test.author')||'/original.jpg';
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.author'))::text,true);
set local role authenticated;
select public.submit_moderation_appeal(current_setting('test.avatar_decision')::uuid,'Synthetic avatar review request','media-avatar-appeal');
reset role;
select set_config('test.avatar_appeal',(select id::text from public.moderation_appeals where decision_id=current_setting('test.avatar_decision')::uuid),true);
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select public.admin_review_moderation_appeal(current_setting('test.avatar_appeal')::uuid,'reverse','Synthetic avatar reversal','media-avatar-reverse');
reset role;
select pg_temp.check_true((select avatar_url is null from public.profiles where id=current_setting('test.author')::uuid),'avatar reference waits for byte-worker completion');
select set_config('test.restored_avatar',(select jsonb_build_object('id',id,'version',version,'size',(metadata->>'size')::bigint,'mime',metadata->>'mimetype')::text from storage.objects where bucket_id='avatars' and name=current_setting('test.author')||'/original.jpg'),true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.expect_error(format('select public.finish_moderation_media_restore_v1(%L,%L,2,%L)',current_setting('test.avatar_object'),current_setting('test.job')::jsonb->>'lease_id',(current_setting('test.restored_avatar')::jsonb||'{"version":"wrong"}')::text),'Restored identity mismatch');
select pg_temp.check_true(public.finish_moderation_media_restore_v1(current_setting('test.avatar_object')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,2,current_setting('test.restored_avatar')::jsonb),'copied avatar identity accepted only by fenced completion');
reset role;
select pg_temp.check_true((select avatar_url=current_setting('test.avatar') from public.profiles where id=current_setting('test.author')::uuid),'restored service-owned avatar linked to correct member');
-- A service-owned object unrelated to a verified restoration remains disallowed.
insert into storage.objects(bucket_id,name,owner_id,version,metadata) values
 ('avatars',current_setting('test.author')||'/unowned.jpg',null,'v1','{"size":7,"mimetype":"image/jpeg"}');
select pg_temp.expect_error(format('update public.profiles set avatar_url=%L where id=%L','https://test.invalid/storage/v1/object/public/avatars/'||current_setting('test.author')||'/unowned.jpg',current_setting('test.author')),'Invalid profile photo');
-- Synthetic second decision reuses this exact historical source, not a new upload.
select set_config('test.second_decision',gen_random_uuid()::text,true);
insert into public.moderation_decisions select (jsonb_populate_record(null::public.moderation_decisions,
 to_jsonb(d)||jsonb_build_object('id',current_setting('test.second_decision'),'state','active'))).*
 from public.moderation_decisions d where id=current_setting('test.avatar_decision')::uuid;
select pg_temp.check_true((select desired='restricted' and phase='archived' and original=current_setting('test.restored_avatar')::jsonb and revision=3 from public.moderation_media_objects where id=current_setting('test.avatar_object')::uuid),'restored source recapture pins new identity and preserves archive');
select set_config('test.third_decision',gen_random_uuid()::text,true);
select set_config('test.third_report',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.viewer'))::text,true);
insert into public.reports select (jsonb_populate_record(null::public.reports,to_jsonb(r)||jsonb_build_object('id',current_setting('test.third_report')))).*
 from public.reports r where id=(current_setting('test.avatar_report')::jsonb->>'id')::uuid;
insert into public.moderation_decisions select (jsonb_populate_record(null::public.moderation_decisions,
 to_jsonb(d)||jsonb_build_object('id',current_setting('test.third_decision'),'report_id',current_setting('test.third_report'),'state','active'))).*
 from public.moderation_decisions d where id=current_setting('test.avatar_decision')::uuid;
update public.moderation_decisions set state='reversed' where id=current_setting('test.second_decision')::uuid;
select pg_temp.check_true((select desired='restricted' from public.moderation_media_objects where id=current_setting('test.avatar_object')::uuid),'another active hold prevents restoration');
update public.moderation_decisions set state='reversed' where id=current_setting('test.third_decision')::uuid;
select pg_temp.check_true((select desired='restored' and revision=4 from public.moderation_media_objects where id=current_setting('test.avatar_object')::uuid),'last hold release queues restoration');
-- Preserve a newer legitimate avatar when historical media restoration completes.
insert into storage.objects(bucket_id,name,owner_id,version,metadata) values
 ('avatars',current_setting('test.author')||'/newer.jpg',current_setting('test.author'),'new-v1','{"size":7,"mimetype":"image/jpeg"}');
update public.profiles set avatar_url='https://test.invalid/storage/v1/object/public/avatars/'||current_setting('test.author')||'/newer.jpg' where id=current_setting('test.author')::uuid;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(public.finish_moderation_media_restore_v1(current_setting('test.avatar_object')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,4,current_setting('test.restored_avatar')::jsonb),'historical restoration completed');
reset role;
select pg_temp.check_true((select avatar_url like '%/newer.jpg' from public.profiles where id=current_setting('test.author')::uuid),'newer member avatar never overwritten');
-- Real quarantine -> no-violation path (no appeal required).
select set_config('test.quarantine_report',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.viewer'))::text,true);
insert into public.reports select (jsonb_populate_record(null::public.reports,to_jsonb(r)||jsonb_build_object('id',current_setting('test.quarantine_report'),'status','pending'))).*
 from public.reports r where id=(current_setting('test.avatar_report')::jsonb->>'id')::uuid;
select set_config('request.jwt.claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
set local role doji_employee;
select public.admin_decide_report_v3(current_setting('test.quarantine_report')::uuid,'escalate_restricted','other','level_2','Synthetic quarantine rationale','Synthetic quarantine notice',null,null,'media-quarantine-action');
reset role;
select pg_temp.check_true((select avatar_url is null from public.profiles where id=current_setting('test.author')::uuid),'real quarantine hides current avatar');
select set_config('test.quarantine_decision',(select id::text from public.moderation_decisions where report_id=current_setting('test.quarantine_report')::uuid and state='active'),true);
select pg_temp.check_true(exists(select 1 from public.moderation_media_decisions where decision_id=current_setting('test.quarantine_decision')::uuid),'real quarantine captures media');
set local role doji_employee;
select public.admin_decide_report_v3(current_setting('test.quarantine_report')::uuid,'no_violation','no_violation','none','Synthetic no violation rationale','Synthetic no violation notice',null,null,'media-no-violation-action');
reset role;
select pg_temp.check_true((select avatar_url is null from public.profiles where id=current_setting('test.author')::uuid),'no-violation waits for verified source');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(current_setting('test.job')::jsonb->>'operation'='restore','no-violation queues restoration');
select pg_temp.check_true(public.finish_moderation_media_restore_v1((current_setting('test.job')::jsonb->>'id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,2,current_setting('test.job')::jsonb->'original'),'no-violation source verified');
reset role;
select pg_temp.check_true((select avatar_url like '%/newer.jpg' from public.profiles where id=current_setting('test.author')::uuid),'no-violation restores correct quarantined avatar');
