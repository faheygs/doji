-- Same network-isolated synthetic transaction. No physical bytes deleted here.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select pg_temp.check_true(not has_table_privilege('service_role','public.media_cleanup_reservations','SELECT'),'cleanup reservations private even to raw service reads');
select pg_temp.check_true(not has_function_privilege('authenticated','public.claim_media_cleanup_v1(text,text[])','EXECUTE'),'member cannot authorize cleanup');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.claim_media_cleanup_v1(text,text[])','EXECUTE'),'employee cannot authorize cleanup');
set local role service_role;
select pg_temp.check_true(public.claim_media_cleanup_v1('avatars',array[current_setting('test.author')||'/original.jpg'])='[]','cleanup defers exact held object');
select pg_temp.check_true(public.claim_media_cleanup_v1('avatars',array[current_setting('test.author')||'/unowned.jpg'])='[]','cleanup requires existing durable eligibility');
select pg_temp.expect_error('select public.claim_media_cleanup_v1(''moderation-evidence'',array[''x/original''])','Invalid cleanup batch');
select pg_temp.expect_error('select public.claim_media_cleanup_v1(''avatars'',array[''../file.jpg''])','Invalid cleanup path');
reset role;
select set_config('test.cleanup_path',current_setting('test.author')||'/expired.jpg',true);
insert into storage.objects(bucket_id,name,owner_id,version,metadata) values
 ('post-media',current_setting('test.cleanup_path'),current_setting('test.author'),'cleanup-v1','{"size":7,"mimetype":"image/jpeg"}');
insert into public.media_objects_pending_delete(bucket_id,object_path) values('post-media',current_setting('test.cleanup_path'));
set local role service_role;
select set_config('test.cleanup_job',public.claim_media_cleanup_v1('post-media',array[current_setting('test.cleanup_path')])->>0,true);
select pg_temp.check_true(current_setting('test.cleanup_job')::jsonb->>'state'='claimed','eligible exact cleanup leased');
select pg_temp.check_true(public.claim_media_cleanup_v1('post-media',array[current_setting('test.cleanup_path')])='[]','concurrent cleanup cannot claim active lease');
select pg_temp.check_true(not public.check_media_cleanup_lease_v1('post-media',current_setting('test.cleanup_path'),gen_random_uuid()),'wrong cleanup lease denied');
select pg_temp.check_true(not public.finish_media_cleanup_v1('post-media',current_setting('test.cleanup_path'),(current_setting('test.cleanup_job')::jsonb->>'lease_id')::uuid),'cleanup cannot acknowledge while object exists');
reset role;
select pg_temp.check_true(public.moderation_media_is_frozen_v1('post-media',current_setting('test.cleanup_path')),'cleanup reserves source against member replacements');
-- Model an otherwise valid, delayed commit, not an invalid/unreserved upload.
update public.media_upload_intents set object_path=current_setting('test.cleanup_path')
 where idempotency_key=current_setting('test.post') and slot='photo';
select pg_temp.expect_error(format('update public.posts set photo_url=%L where id=%L','https://test.invalid/storage/v1/object/public/post-media/'||current_setting('test.cleanup_path'),current_setting('test.post')),'Media upload expired');
-- A staff decision can hide content even when cleanup has already won the race,
-- but it records an unresolved evidence gap, never a fabricated archive.
insert into storage.objects(bucket_id,name,owner_id,version,metadata) values
 ('avatars',current_setting('test.author')||'/cleanup-avatar.jpg',current_setting('test.author'),'cleanup-avatar-v1','{"size":7,"mimetype":"image/jpeg"}');
insert into public.media_objects_pending_delete(bucket_id,object_path) values('avatars',current_setting('test.author')||'/cleanup-avatar.jpg');
set local role service_role;
select public.claim_media_cleanup_v1('avatars',array[current_setting('test.author')||'/cleanup-avatar.jpg']);
reset role;
insert into public.moderation_decisions select (jsonb_populate_record(null::public.moderation_decisions,to_jsonb(d)||jsonb_build_object('id',gen_random_uuid(),'state','active','original_payload',jsonb_build_object('avatar_url',
 'https://test.invalid/storage/v1/object/public/avatars/'||current_setting('test.author')||'/cleanup-avatar.jpg')))).* from public.moderation_decisions d where id=current_setting('test.avatar_decision')::uuid;
select pg_temp.check_true(exists(select 1 from public.moderation_media_gaps where failure_code='cleanup_reserved'),'cleanup race records durable gap without blocking hiding');
update public.media_cleanup_reservations set lease_until=clock_timestamp()-interval '10 seconds' where bucket='post-media' and object_path=current_setting('test.cleanup_path');
set local role service_role;
select pg_temp.check_true(public.claim_media_cleanup_v1('post-media',array[current_setting('test.cleanup_path')])='[]','expired cleanup lease retains in-flight grace');
reset role;
update public.media_cleanup_reservations set lease_until=clock_timestamp()-interval '2 minutes' where bucket='post-media' and object_path=current_setting('test.cleanup_path');
set local role service_role;
select set_config('test.cleanup_job',public.claim_media_cleanup_v1('post-media',array[current_setting('test.cleanup_path')])->>0,true);
reset role;
-- Test fixture only; real workers always use Storage API, never SQL deletion.
set local storage.allow_delete_query='true';
delete from storage.objects where bucket_id='post-media' and name=current_setting('test.cleanup_path');
set local storage.allow_delete_query='false';
set local role service_role;
select pg_temp.check_true(public.finish_media_cleanup_v1('post-media',current_setting('test.cleanup_path'),(current_setting('test.cleanup_job')::jsonb->>'lease_id')::uuid),'absent exact source completes');
select pg_temp.check_true(public.claim_media_cleanup_v1('post-media',array[current_setting('test.cleanup_path')])#>>'{0,state}'='complete','lost cleanup acknowledgement replays safely');
reset role;
select pg_temp.check_true(public.moderation_media_is_frozen_v1('post-media',current_setting('test.cleanup_path')),'completed path stays frozen against delayed deletion');
-- A stale expired-upload candidate must never delete a committed referenced post.
insert into public.media_objects_pending_delete(bucket_id,object_path) values('post-media',current_setting('test.post')||'.jpg') on conflict do nothing;
set local role service_role;
select pg_temp.check_true(public.claim_media_cleanup_v1('post-media',array[current_setting('test.post')||'.jpg'])='[]','held/committed post cannot enter generic cleanup');
select pg_temp.check_true(not exists(select 1 from public.claim_media_cleanup_candidates_v1('pending',20) c where c.object_path=current_setting('test.post')||'.jpg'),'held files do not occupy maintenance candidate slots');
reset role;
