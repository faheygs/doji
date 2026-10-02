create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end$$;
create function pg_temp.expect_error(command text,fragment text) returns void language plpgsql as $$begin
 begin execute command; exception when others then if position(fragment in sqlerrm)>0 then return; end if; raise; end;
 raise exception 'FAIL: expected %',fragment; end$$;
-- Ledger unit fixture is synthetic metadata; real Storage bytes are tested separately.
select set_config('test.media_id',gen_random_uuid()::text,true);
select set_config('test.original',jsonb_build_object('id',gen_random_uuid(),'version','fixture-v1','size',7,'mime','image/jpeg')::text,true);
insert into storage.buckets(id,name,public) values('avatars','avatars',true) on conflict do nothing;
insert into storage.objects(bucket_id,name,owner_id,version,metadata)
 values('avatars',current_setting('test.media_id')||'/fixture.jpg',current_setting('test.media_id'),'fixture-v1','{"size":7,"mimetype":"image/jpeg"}');
insert into public.moderation_media_objects(id,bucket,object_path,original)
 values(current_setting('test.media_id')::uuid,'avatars',current_setting('test.media_id')||'/fixture.jpg',current_setting('test.original')::jsonb);
select pg_temp.check_true(not has_table_privilege('service_role','public.moderation_media_objects','SELECT'),'no raw service table reads');
select pg_temp.check_true(not has_table_privilege('authenticated','public.moderation_media_objects','SELECT'),'no member ledger read');
select pg_temp.check_true(not has_function_privilege('service_role','public.capture_moderation_media_v1(uuid,text,text,text)','EXECUTE'),'service cannot create arbitrary holds');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.claim_moderation_media_v1()','EXECUTE'),'staff cannot execute media workers');
select pg_temp.check_true(not has_function_privilege('authenticated','public.claim_moderation_media_v1()','EXECUTE'),'members cannot execute workers');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(current_setting('test.job')::jsonb->>'id'=current_setting('test.media_id'),'claim exact media');
select pg_temp.check_true(public.claim_moderation_media_v1() is null,'active lease not claimed twice');
select pg_temp.check_true(not public.check_moderation_media_lease_v1(current_setting('test.media_id')::uuid,gen_random_uuid(),1),'wrong lease rejected');
select pg_temp.expect_error(format('select public.finish_moderation_media_origin_v1(%L,%L,1)',current_setting('test.media_id'),current_setting('test.job')::jsonb->>'lease_id'),'Verified archive required');
select set_config('test.proof',jsonb_build_object('sha256',repeat('a',64),'size',7,'evidenceIdentity',jsonb_build_object('id',gen_random_uuid(),'version','copy-v1','size',7,'mime','image/jpeg'))::text,true);
select pg_temp.check_true(public.save_moderation_media_archive_v1(current_setting('test.media_id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,1,current_setting('test.proof')::jsonb),'persist verified archive');
select pg_temp.check_true(public.save_moderation_media_archive_v1(current_setting('test.media_id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,1,current_setting('test.proof')::jsonb),'identical archive proof replay');
select pg_temp.expect_error(format('select public.save_moderation_media_archive_v1(%L,%L,1,%L)',current_setting('test.media_id'),current_setting('test.job')::jsonb->>'lease_id',(current_setting('test.proof')::jsonb||jsonb_build_object('sha256',repeat('b',64)))::text),'Archive proof is immutable');
select pg_temp.expect_error(format('select public.finish_moderation_media_origin_v1(%L,%L,1)',current_setting('test.media_id'),current_setting('test.job')::jsonb->>'lease_id'),'Source object still present');
select pg_temp.check_true(public.save_moderation_media_probe_v1(current_setting('test.media_id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,1,
 jsonb_build_object('signedPath','/object/sign/avatars/'||current_setting('test.media_id')||'/fixture.jpg?token=synthetic','expiresAt',clock_timestamp()+interval '24 hours')),'pre-deletion probe saved');
reset role;
-- Test-only metadata fixture removal, NOT a production deletion implementation.
set local storage.allow_delete_query='true';
delete from storage.objects where bucket_id='avatars' and name=current_setting('test.media_id')||'/fixture.jpg';
set local storage.allow_delete_query='false';
set local role service_role;
select pg_temp.check_true(public.finish_moderation_media_origin_v1(current_setting('test.media_id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,1),'origin removal acknowledged');
select pg_temp.check_true(not public.finish_moderation_media_origin_v1(current_setting('test.media_id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,1),'completed lease cannot acknowledge again');
reset role;
select pg_temp.check_true((select phase='origin_removed' and revoked_at is null and next_attempt_at>origin_removed_at+interval '60 seconds' from public.moderation_media_objects),'origin deletion never falsely claims CDN revocation');
set local role service_role;
select pg_temp.check_true(public.claim_moderation_media_v1() is null,'CDN convergence interval enforced');
reset role;
update public.moderation_media_objects set next_attempt_at=clock_timestamp(),origin_removed_at=clock_timestamp()-interval '91 seconds';
set local role service_role;
select set_config('test.verify_job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(current_setting('test.verify_job')::jsonb->>'operation'='verify','durable verifier claimed separately');
select pg_temp.check_true(not public.finish_moderation_media_revocation_v1(current_setting('test.media_id')::uuid,gen_random_uuid(),1),'stale verifier denied');
select pg_temp.check_true(public.finish_moderation_media_revocation_v1(current_setting('test.media_id')::uuid,(current_setting('test.verify_job')::jsonb->>'lease_id')::uuid,1),'fenced revocation recorded');
reset role;
select pg_temp.check_true((select phase='revoked' and revoked_at is not null from public.moderation_media_objects),'verified state retained');
select pg_temp.check_true(public.moderation_media_is_frozen_v1('avatars',current_setting('test.media_id')||'/fixture.jpg'),'source path remains protected against reupload');
select pg_temp.check_true(not public.moderation_media_is_frozen_v1('avatars',gen_random_uuid()::text||'/new.jpg'),'unrelated new avatar path unaffected');
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.media_id'))::text,true);
set local role authenticated;
select pg_temp.expect_error(format('insert into storage.objects(bucket_id,name,owner_id) values(''avatars'',%L,%L)',current_setting('test.media_id')||'/fixture.jpg',current_setting('test.media_id')),'row-level security');
insert into storage.objects(bucket_id,name,owner_id) values('avatars',current_setting('test.media_id')||'/new-avatar.jpg',current_setting('test.media_id'));
reset role;
select pg_temp.check_true(exists(select 1 from storage.objects where name=current_setting('test.media_id')||'/new-avatar.jpg'),'normal new avatar upload still allowed');
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.moderation_media_objects set phase='archived',attempts=23,next_attempt_at=clock_timestamp();
set local role service_role;
select set_config('test.job',public.claim_moderation_media_v1()::text,true);
select pg_temp.check_true(public.fail_moderation_media_v1(current_setting('test.media_id')::uuid,(current_setting('test.job')::jsonb->>'lease_id')::uuid,1,'storage_unavailable',false),'final bounded retry acknowledged');
reset role;
select pg_temp.check_true((select phase='needs_attention' and attempts=24 and archive_proof is not null from public.moderation_media_objects),'exhaustion retains evidence and requires attention');
update public.moderation_media_objects set phase='archived',attempts=24,lease_id=gen_random_uuid(),lease_until=clock_timestamp()-interval '2 minutes';
set local role service_role;
select pg_temp.check_true(public.claim_moderation_media_v1() is null,'crashed final attempt not endlessly retried');
reset role;
select pg_temp.check_true((select phase='needs_attention' from public.moderation_media_objects),'crashed final attempt becomes attention');
