-- Included by test-portal-case-reads-local.mjs inside its offline rollback transaction.
select set_config('request.jwt.claims','{}',true);
insert into storage.objects(bucket_id,name,owner_id) values
 ('avatars',current_setting('test.member_id')||'/retained-avatar.jpg',current_setting('test.member_id')),
 ('avatars',current_setting('test.member_id')||'/unrelated-avatar.jpg',current_setting('test.member_id'));
insert into public.moderation_decisions(id,report_id,affected_user_id,content_kind,content_id,action,
 policy_code,severity,rationale,user_notice,decided_by,original_payload,state)
values('99999999-9999-4999-8999-999999999999','77777777-7777-4777-8777-777777777777',current_setting('test.member_id')::uuid,
 'profile_photo',current_setting('test.member_id')::uuid,'remove_profile_photo','spam_scam','level_1',
 'Synthetic retained avatar rationale','Synthetic member avatar notice',current_setting('test.employee_id')::uuid,
 jsonb_build_object('avatar_url','https://test.invalid/storage/v1/object/public/avatars/'||current_setting('test.member_id')||'/retained-avatar.jpg'),'active');
insert into public.moderation_account_actions(decision_id,user_id,action)
values('99999999-9999-4999-8999-999999999999',current_setting('test.member_id')::uuid,'warning');
insert into public.moderation_appeals(id,decision_id,user_id,statement)
values('99999999-9999-4999-8999-999999999999','99999999-9999-4999-8999-999999999999',current_setting('test.member_id')::uuid,'Please review my retained avatar evidence');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
update public.admin_employees set status='active',roles=array['moderator'] where id=auth.uid();
-- Index applicability, not a production load benchmark. Tiny fixtures naturally
-- prefer sequential scans; disabling them here checks the exact reference lookup
-- has the intended indexed plan even for a detached/deleted member.
set local enable_seqscan=off;
do $$declare plan json; begin
 execute format('explain (format json) select id from public.moderation_decisions where content_kind=''profile_photo'' and public.public_storage_object_path(original_payload->>''avatar_url'',''avatars'')=%L',current_setting('test.member_id')||'/retained-avatar.jpg') into plan;
 perform pg_temp.check_true(plan::text like '%employee_avatar_decision_reference_idx%','preserved avatar lookup has matching index');
end$$;
set local enable_seqscan=on;
set local role doji_employee;
do $$declare detail jsonb; begin
 perform pg_temp.check_true((select count(*)=2 from storage.objects where bucket_id='avatars'),'only reported current and appealed original avatars visible despite PUBLIC policy');
 perform pg_temp.check_true(not exists(select 1 from storage.objects where name like '%/unrelated-avatar.jpg'),'same member unrelated avatar denied');
 detail:=public.get_admin_appeal_case_v1('99999999-9999-4999-8999-999999999999');
 perform pg_temp.check_true(detail#>>'{original_evidence,media_manifest,items,0,path}'=current_setting('test.member_id')||'/retained-avatar.jpg','appeal original path not current avatar');
 perform pg_temp.check_true(detail#>>'{report_case,media_manifest,items,0,path}'=current_setting('test.member_id')||'/employee-test-avatar.jpg','current path separately labeled');
 perform pg_temp.check_true(detail#>>'{original_evidence,availability}'='available','retained avatar preview available');
 perform pg_temp.check_true(not (detail#>'{report_case,evidence}' ? 'profile_photo_url'),'no raw public evidence URL');
 perform pg_temp.check_true(not public.employee_can_read_avatar_evidence_v1(current_setting('test.member_id')||'/../other.jpg'),'traversal denied');
 perform pg_temp.check_true(not public.employee_can_read_avatar_evidence_v1(current_setting('test.member_id')||'/%2fother.jpg'),'encoded separator denied');
 perform pg_temp.check_true(not public.employee_can_read_avatar_evidence_v1('https://test.invalid/avatars/a.jpg'),'URL denied');
 perform pg_temp.check_true(not public.employee_can_read_avatar_evidence_v1(null),'null denied');
end$$;
-- Staff cannot mutate Storage metadata; test underlying grants without attempting a real deletion.
select pg_temp.check_true(not has_table_privilege(current_user,'storage.objects','INSERT')
 and not has_table_privilege(current_user,'storage.objects','UPDATE')
 and not has_table_privilege(current_user,'storage.objects','DELETE'),'no employee media write grants');
reset role;

-- A restricted consequence on a routine report protects original bytes at signing time.
update public.moderation_account_actions set action='permanent_ban' where decision_id='99999999-9999-4999-8999-999999999999';
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where name like '%/retained-avatar.jpg'),'original restricted consequence denied');
select pg_temp.expect_denied($q$select public.get_admin_appeal_case_v1('99999999-9999-4999-8999-999999999999')$q$,'restricted original avatar appeal');
reset role;
update public.admin_employees set roles=array['operations'] where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(exists(select 1 from storage.objects where name like '%/retained-avatar.jpg'),'authorized restricted reviewer can read original');
reset role;
update public.moderation_account_actions set action='warning' where decision_id='99999999-9999-4999-8999-999999999999';
-- Restricted queue wins even if another routine report points to the same photo.
select set_config('request.jwt.claims','{}',true);
insert into public.reports(id,reported_user_id,reporter_id,reason,target_kind)
values('12121212-1212-4212-8212-121212121212',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid,'other','profile_photo');
insert into public.admin_report_triage(report_id,queue) values('12121212-1212-4212-8212-121212121212','restricted_safety');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
update public.admin_employees set roles=array['moderator'] where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where name like '%/employee-test-avatar.jpg'),'routine duplicate cannot bypass restricted current avatar');
reset role;
update public.admin_report_triage set queue='moderation' where report_id='12121212-1212-4212-8212-121212121212';

-- Actual staff role/MFA/revocation gates must apply to Storage as well as the case RPC.
update public.admin_employees set status='disabled' where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='avatars'),'disabled employee denied');
reset role;
update public.admin_employees set status='active',roles=array['business_reviewer'] where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='avatars'),'unrelated role denied');
reset role;
update public.admin_employees set roles=array['legal_reviewer'] where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='avatars'),'legal-only without moderation denied');
reset role;
update public.admin_employees set roles=array['super_admin'] where id=auth.uid();
select set_config('request.jwt.claims',(current_setting('test.employee_claims')::jsonb||'{"aal":"aal1"}'::jsonb)::text,true);
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='avatars'),'AAL1 employee denied');
reset role;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);

-- No fabricated image after removal. Retained original survives detached member FKs,
-- but only if the object still exists; no file retention/cleanup policy is changed.
select set_config('request.jwt.claims','{}',true);
update public.profiles set avatar_url=null where id=current_setting('test.member_id')::uuid;
update public.moderation_decisions set affected_user_id=null where id='99999999-9999-4999-8999-999999999999';
update public.moderation_appeals set user_id=null,status='closed_account_deleted' where id='99999999-9999-4999-8999-999999999999';
update public.reports set reported_user_id=null where id in ('77777777-7777-4777-8777-777777777777','12121212-1212-4212-8212-121212121212');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select pg_temp.check_true(exists(select 1 from storage.objects where name like '%/retained-avatar.jpg'),'retained original available after member FKs detached');
select pg_temp.check_true(not exists(select 1 from storage.objects where name like '%/employee-test-avatar.jpg'),'unreferenced former current avatar denied');
select pg_temp.check_true(public.get_admin_appeal_case_v1('99999999-9999-4999-8999-999999999999')#>>'{original_evidence,availability}'='available','closed appeal retains exact original');
reset role;
update storage.objects set name=current_setting('test.member_id')||'/retained-avatar-missing.jpg' where name=current_setting('test.member_id')||'/retained-avatar.jpg';
set local role doji_employee;
select pg_temp.check_true(public.get_admin_appeal_case_v1('99999999-9999-4999-8999-999999999999')#>>'{original_evidence,availability}'='object_missing','missing retained object explicit');
reset role;

-- Member/anonymous callers retain the existing public-avatar read but cannot call
-- employee helpers. Capture the full ordered result for the rollback comparison.
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select set_config('test.member_avatar_rows',(select jsonb_agg(name order by name)::text from storage.objects where bucket_id='avatars'),true);
select pg_temp.check_true((select count(*)=3 from storage.objects where bucket_id='avatars'),'member avatar read unchanged');
select pg_temp.expect_denied($q$select public.employee_can_read_avatar_evidence_v1('anything')$q$,'member cannot call staff helper');
reset role;
set local role anon;
select pg_temp.check_true((select jsonb_agg(name order by name)::text from storage.objects where bucket_id='avatars')=current_setting('test.member_avatar_rows'),'anonymous baseline public-avatar access unchanged');
select pg_temp.expect_denied($q$select public.employee_can_read_avatar_evidence_v1('anything')$q$,'anonymous helper denied');
reset role;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
