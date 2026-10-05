// Offline synthetic PostgreSQL only. No hosted URL, credentials, sends or installs.
// Every schema change, fixture and audit entry rolls back, including on failure.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { offlineContainer, errorOutput } from './database/contracts.mts';
import { employeeEvidenceSetup } from './test-employee-local-evidence.mts';

const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const container = 'supabase_db_employee-cutover-verify';
const inspect = offlineContainer(
  JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })),
);
assert.equal(inspect.HostConfig.NetworkMode, 'none', 'Database must be offline');
assert.equal(Object.keys(inspect.HostConfig.PortBindings || {}).length, 0, 'No published ports');
const draft = readFileSync(
  'docs/drafts/20260927010000_portal_case_evidence_and_appeals.sql',
  'utf8',
);
const undo = readFileSync(
  'docs/drafts/20260927010000_portal_case_evidence_and_appeals.rollback.sql',
  'utf8',
);
const avatars = readFileSync('docs/drafts/20260927011000_employee_avatar_evidence.sql', 'utf8');
const undoAvatars = readFileSync(
  'docs/drafts/20260927011000_employee_avatar_evidence.rollback.sql',
  'utf8',
);
const avatarChecks = readFileSync('scripts/test-portal-avatar-evidence-local.sql', 'utf8');
// Reuse only synthetic data setup, NOT its temporary replacement Storage policy.
const fixtureStart = employeeEvidenceSetup.indexOf("select set_config('test.member_id'");
assert.ok(fixtureStart > 0);
const fixtures = employeeEvidenceSetup.slice(fixtureStart);
const snapshot = `
select jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl) order by p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname in ('public','storage') and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
   from pg_policies p where schemaname in ('public','storage')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage')),
 'triggers',(select jsonb_agg(pg_get_triggerdef(t.oid) order by t.oid) from pg_trigger t
   join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage'))
)`;
const psql = (input: string) =>
  execFileSync(
    podman,
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input, encoding: 'utf8', maxBuffer: 12 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] },
  );
const before = psql(`${snapshot};`).trim();
const sql = `begin;
set local statement_timeout='8s'; set local lock_timeout='2s';
do $$begin
 if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid')
 then raise exception 'Synthetic local database with empty Vault required'; end if;
 if to_regprocedure('public.get_admin_report_case_v3(uuid)') is not null
   or to_regprocedure('public.get_admin_appeal_case_v1(uuid)') is not null then raise exception 'Draft already installed'; end if;
end$$;
-- The recovered local public-schema fixture omitted the legacy Storage policies.
-- Recreate this exact checked-in PUBLIC avatar-read rule inside the rolled-back
-- test transaction, so permissive-policy leakage and unchanged member reads are tested.
create policy avatars_read on storage.objects for select using (bucket_id='avatars');
create temp table prior_functions as select p.oid,pg_get_functiondef(p.oid) as definition,p.proacl
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','storage') and p.prokind='f';
create temp table prior_policies as select * from pg_policies where schemaname in ('public','storage');
create temp table prior_relations as select c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','storage');
${avatars}
${draft}
create function pg_temp.check_true(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAIL: %',label; end if; end$$;
create function pg_temp.expect_denied(command text,label text) returns void language plpgsql as $$begin
 begin execute command; exception when insufficient_privilege then return;
 when raise_exception then
   if sqlerrm in ('Administrator MFA required','Moderation access required','Restricted safety authorization required') then return; end if;
   raise;
 end;
 raise exception 'FAIL: expected denial: %',label;
end$$;
${fixtures}
select set_config('test.employee_claims',current_setting('request.jwt.claims'),true);
select set_config('test.employee_id',auth.uid()::text,true);
select set_config('request.jwt.claims','{}',true);
update public.reports set reported_user_id=current_setting('test.member_id')::uuid
 where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
insert into storage.objects(bucket_id,name,owner_id) values
 ('post-media','employee-test-front.jpg',current_setting('test.member_id')),
 ('post-media','employee-test-video.mp4',current_setting('test.member_id'));
insert into public.media_upload_intents(user_id,user_event_id,idempotency_key,slot,object_path,content_type) values
 (current_setting('test.member_id')::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','front','employee-test-front.jpg','image/jpeg'),
 (current_setting('test.member_id')::uuid,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','video','employee-test-video.mp4','video/mp4');
update public.posts set front_photo_url='https://test.invalid/storage/v1/object/public/post-media/employee-test-front.jpg',
 video_url='https://test.invalid/storage/v1/object/public/post-media/employee-test-video.mp4'
 where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
insert into public.badges(id,name,emoji,description,criteria_type,criteria_value)
 values('first_one','Synthetic first completion','test','Local-only catalog fixture','completions',1) on conflict do nothing;
update public.user_events set status='completed' where id in (select id from evidence_fixtures);
update storage.objects set owner_id=current_setting('test.member_id'),name=current_setting('test.member_id')||'/employee-test-avatar.jpg' where bucket_id='avatars' and name='employee-test-avatar.jpg';
update public.profiles set avatar_url='https://test.invalid/storage/v1/object/public/avatars/'||current_setting('test.member_id')||'/employee-test-avatar.jpg' where id=current_setting('test.member_id')::uuid;
insert into public.comments(id,post_id,user_id,body) values
 ('44444444-4444-4444-8444-444444444444','cccccccc-cccc-4ccc-8ccc-cccccccccccc',current_setting('test.member_id')::uuid,'Synthetic comment evidence');
insert into public.poll_options(id,challenge_id,text,is_other) values
 ('55555555-5555-4555-8555-555555555555','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Other',true);
insert into public.poll_votes(id,user_id,challenge_id,option_id,custom_text,user_event_id,idempotency_key) values
 ('66666666-6666-4666-8666-666666666666',current_setting('test.member_id')::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
 '55555555-5555-4555-8555-555555555555','Synthetic poll evidence','cccccccc-cccc-4ccc-8ccc-cccccccccccc','portal-evidence-poll-test');
insert into public.reports(id,comment_id,poll_vote_id,reason,target_kind,reported_user_id,reporter_id) values
 ('44444444-4444-4444-8444-444444444444','44444444-4444-4444-8444-444444444444',null,'other','comment',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid),
 ('66666666-6666-4666-8666-666666666666',null,'66666666-6666-4666-8666-666666666666','other','poll_response',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid),
 ('77777777-7777-4777-8777-777777777777',null,null,'other','profile_photo',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid),
 ('88888888-8888-4888-8888-888888888888',null,null,'other','account',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid);
insert into public.moderation_decisions(id,report_id,affected_user_id,content_kind,content_id,action,policy_code,severity,rationale,user_notice,decided_by,original_payload,state,decided_at)
 values('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('test.member_id')::uuid,
 'post','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_content','spam_scam','level_1','Original synthetic rationale','Original synthetic member notice',
 current_setting('test.employee_id')::uuid,'{"moderation_status":"visible","private_extra":"never expose"}','superseded',now()-interval '1 hour'),
 ('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',current_setting('test.member_id')::uuid,
 'post','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','no_violation','no_violation','none','Different newer rationale','Different newer member notice',
 current_setting('test.employee_id')::uuid,'{}','active',now());
insert into public.moderation_account_actions(decision_id,user_id,action) values
 ('11111111-1111-4111-8111-111111111111',current_setting('test.member_id')::uuid,'warning');
insert into public.moderation_appeals(id,decision_id,user_id,statement) values
 ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111',current_setting('test.member_id')::uuid,'Please review this synthetic test decision');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
do $$declare result jsonb; begin
 result:=public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
 perform pg_temp.check_true(jsonb_array_length(result#>'{media_manifest,items}')=3,'three fixed media slots');
 perform pg_temp.check_true(result#>>'{media_manifest,items,1,slot}'='front_photo','front photo included');
 perform pg_temp.check_true(result#>>'{media_manifest,items,2,kind}'='video','video typed correctly');
 perform pg_temp.check_true(result#>>'{media_manifest,items,2,availability}'='available','stored object recognized');
 perform pg_temp.check_true(result#>>'{media_manifest,source}'='current_content','not called an original snapshot');
 perform pg_temp.check_true(public.get_admin_report_case_v3('44444444-4444-4444-8444-444444444444')#>>'{evidence,body}'='Synthetic comment evidence','comment evidence');
 perform pg_temp.check_true(public.get_admin_report_case_v3('66666666-6666-4666-8666-666666666666')#>>'{evidence,custom_text}'='Synthetic poll evidence','poll evidence');
 perform pg_temp.check_true(public.get_admin_report_case_v3('77777777-7777-4777-8777-777777777777')#>>'{media_manifest,items,0,availability}'='available','current reported avatar authorized');
 perform pg_temp.check_true(jsonb_array_length(public.get_admin_report_case_v3('88888888-8888-4888-8888-888888888888')#>'{media_manifest,items}')=0,'account has no invented media');
 result:=public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333');
 perform pg_temp.check_true(result#>>'{original_decision,id}'='11111111-1111-4111-8111-111111111111','appealed decision not latest');
 perform pg_temp.check_true(result#>>'{original_decision,rationale}'='Original synthetic rationale','original rationale');
 perform pg_temp.check_true(result#>>'{original_decision,member_notice}'='Original synthetic member notice','original notice');
 perform pg_temp.check_true(result#>>'{original_decision,account_action}'='warning','original account effect');
 perform pg_temp.check_true(not (result->'report_case' ? 'decision_summary') and not (result->'report_case' ? 'current_decision'),'no conflicting newer decision');
 perform pg_temp.check_true(result#>>'{original_evidence,availability}'='content_snapshot_not_retained','snapshot gap explicit');
 perform pg_temp.check_true(position('never expose' in result::text)=0,'opaque original payload withheld');
 perform pg_temp.check_true((result#>>'{review_eligibility,super_admin_override_required}')::boolean,'owner override disclosed');
end$$;
reset role;
select pg_temp.check_true((select count(*)=2 from public.admin_audit_log where action='report.evidence_viewed' and entity_id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'one report audit per successful read');
select pg_temp.check_true((select count(*)=1 from public.admin_audit_log where action='appeal.case_viewed' and entity_id='33333333-3333-4333-8333-333333333333'),'appeal access audited');
update public.admin_employees set roles=array['moderator'] where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')#>>'{review_eligibility,blocked_reason}'='independent_reviewer_required','ordinary moderator cannot decide own appeal');
select pg_temp.expect_denied($q$select public.get_admin_report_case_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$,'restricted report');
select pg_temp.check_true(not exists(select 1 from storage.objects where name='employee-test-unreported.jpg'),'no unrelated media');
select pg_temp.check_true(not exists(select 1 from storage.objects where name='employee-test-restricted.jpg'),'no restricted media');
select pg_temp.check_true((select count(*)=2 from storage.objects where name in ('employee-test-front.jpg','employee-test-video.mp4')),'existing policy authorizes both added slots');
reset role;
-- A different authorized reviewer is eligible; do not silently grant override.
update public.moderation_decisions set decided_by=current_setting('test.member_id')::uuid where id='11111111-1111-4111-8111-111111111111';
set local role doji_employee;
select pg_temp.check_true((public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')#>>'{review_eligibility,can_review}')::boolean,'different reviewer eligible');
reset role;
update public.moderation_decisions set decided_by=null where id='11111111-1111-4111-8111-111111111111';
set local role doji_employee;
select pg_temp.check_true((public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')#>>'{review_eligibility,can_review}')::boolean,'independent reviewer eligible with retained deleted actor');
reset role;
update public.moderation_decisions set decided_by=current_setting('test.employee_id')::uuid where id='11111111-1111-4111-8111-111111111111';
-- Restricted consequence is protected even if its report is still routine.
update public.moderation_account_actions set action='permanent_ban' where decision_id='11111111-1111-4111-8111-111111111111';
set local role doji_employee;
select pg_temp.expect_denied($q$select public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')$q$,'restricted appeal consequence');
reset role;
update public.admin_employees set roles=array['operations'] where id=auth.uid();
set local role doji_employee;
select pg_temp.check_true(public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')#>>'{original_decision,account_action}'='permanent_ban','authorized restriction detail');
reset role;
update public.admin_employees set status='disabled' where id=auth.uid();
set local role doji_employee;
select pg_temp.expect_denied($q$select public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'disabled report');
select pg_temp.expect_denied($q$select public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')$q$,'disabled appeal');
reset role;
update public.admin_employees set status='active',roles=array['super_admin'] where id=auth.uid();
update public.admin_employees set roles=array['business_reviewer'] where id=auth.uid();
set local role doji_employee;
select pg_temp.expect_denied($q$select public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'unrelated employee role');
reset role;
update public.admin_employees set roles=array['super_admin'] where id=auth.uid();
select set_config('request.jwt.claims',(current_setting('test.employee_claims')::jsonb||'{"aal":"aal1"}'::jsonb)::text,true);
set local role doji_employee;
select pg_temp.expect_denied($q$select public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'AAL1 report');
select pg_temp.expect_denied($q$select public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')$q$,'AAL1 appeal');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
select pg_temp.expect_denied($q$select public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'member report');
select pg_temp.expect_denied($q$select public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')$q$,'member appeal');
select pg_temp.check_true(public.get_own_profile() is not null,'member profile still readable');
select pg_temp.check_true(public.get_feed_page_snapshot_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','everyone',20,null,null) is not null,'member feed still readable');
select pg_temp.check_true(public.get_comment_thread_snapshot('cccccccc-cccc-4ccc-8ccc-cccccccccccc','everyone',null,null,20) is not null,'member comments still readable');
select pg_temp.check_true((select expires_at-created_at <= interval '10 minutes 1 second' from public.user_events where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'participation window unchanged');
reset role;
set local role anon;
select pg_temp.expect_denied($q$select public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$,'anonymous report');
select pg_temp.expect_denied($q$select public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')$q$,'anonymous appeal');
reset role;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
-- Loss of an object is not presented as a working preview.
update storage.objects set name='employee-test-front-missing.jpg' where bucket_id='post-media' and name='employee-test-front.jpg';
set local role doji_employee;
select pg_temp.check_true(public.get_admin_report_case_v3('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')#>>'{media_manifest,items,1,availability}'='object_missing','missing object explicit');
reset role;
update public.moderation_appeals set status='closed_account_deleted',user_id=null where id='33333333-3333-4333-8333-333333333333';
set local role doji_employee;
select pg_temp.check_true(public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')#>>'{review_eligibility,blocked_reason}'='appeal_closed','deleted-member closed appeal remains readable');
reset role;
-- Missing post and comment bodies must not masquerade as retained snapshots.
select set_config('request.jwt.claims','{}',true);
delete from public.comments where id='44444444-4444-4444-8444-444444444444';
delete from public.posts where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select pg_temp.check_true(not (public.get_admin_report_case_v3('44444444-4444-4444-8444-444444444444')#>>'{media_manifest,content_available}')::boolean,'deleted comment explicit');
select pg_temp.check_true(not (public.get_admin_report_case_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')#>>'{media_manifest,content_available}')::boolean,'deleted post explicit');
reset role;
-- Additive reads must not alter even a single prior function, grant or policy.
${avatarChecks}
-- Alternating real-role reads exercise a small mixed workload, not a scale test.
${Array.from(
  { length: 10 },
  () => `
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select pg_temp.check_true(public.get_admin_appeal_case_v1('33333333-3333-4333-8333-333333333333')->>'case_contract_version'='1','mixed staff read');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select pg_temp.check_true(public.get_own_profile() is not null,'mixed member profile');
select pg_temp.check_true(public.get_feed_page_snapshot_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','everyone',20,null,null) is not null,'mixed member feed');
select pg_temp.check_true(public.get_comment_thread_snapshot('cccccccc-cccc-4ccc-8ccc-cccccccccccc','everyone',null,null,20) is not null,'mixed member comments');
reset role;`,
).join('\n')}
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
select pg_temp.check_true(not exists(select 1 from prior_functions b join pg_proc p on p.oid=b.oid
 where b.definition is distinct from pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl),'all preexisting function bodies and grants unchanged');
select pg_temp.check_true(not exists((select * from prior_policies where policyname<>'employee_report_evidence_boundary'
 except select * from pg_policies where schemaname in ('public','storage') and policyname not in ('employee_report_evidence_boundary','employee_avatar_evidence_read'))
 union all (select * from pg_policies where schemaname in ('public','storage') and policyname not in ('employee_report_evidence_boundary','employee_avatar_evidence_read')
 except select * from prior_policies where policyname<>'employee_report_evidence_boundary')),'member and unrelated RLS policies unchanged');
select pg_temp.check_true(not exists(select 1 from prior_relations b join pg_class c on c.oid=b.oid
 where b.relacl is distinct from c.relacl or b.relrowsecurity<>c.relrowsecurity or b.relforcerowsecurity<>c.relforcerowsecurity),'all table privileges and RLS flags unchanged');
${undo}
${undoAvatars}
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select pg_temp.check_true((select jsonb_agg(name order by name)::text from storage.objects where bucket_id='avatars')=current_setting('test.member_avatar_rows'),'member Storage rows identical before and after explicit rollback');
reset role;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
select pg_temp.check_true(not exists((select * from prior_policies except select * from pg_policies where schemaname in ('public','storage'))
 union all (select * from pg_policies where schemaname in ('public','storage') except select * from prior_policies)),'explicit rollback restores all original policies');
select pg_temp.check_true(to_regprocedure('public.employee_can_read_avatar_evidence_v1(text)') is null and to_regclass('public.employee_avatar_decision_reference_idx') is null,'explicit avatar rollback removes helper and index');
select pg_temp.check_true(to_regprocedure('public.get_admin_report_case_v3(uuid)') is null and to_regprocedure('public.get_admin_appeal_case_v1(uuid)') is null,'explicit rollback removes only new reads');
set local role doji_employee;
select pg_temp.check_true(public.get_admin_report_case_v2('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'id'='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','old read remains available after rollback');
reset role;
rollback;`;
try {
  psql(sql);
  assert.equal(psql(`${snapshot};`).trim(), before, 'Schema fingerprint after rollback');
  console.log(
    'PASS: offline real-role media/avatar/appeal checks, exact-original decision, member grants/RLS fingerprints, apply/rollback and old-reader compatibility. All fixtures/audits rolled back.',
  );
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  assert.equal(psql(`${snapshot};`).trim(), before, 'Failure must also roll back schema');
  process.exitCode = 1;
}
