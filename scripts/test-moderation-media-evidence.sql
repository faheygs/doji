-- Synthetic Storage metadata only, inside the network-isolated rollback test.
reset role;
select set_config('test.employee_claims',jsonb_build_object('role','doji_employee','aal','aal2','sub',current_setting('test.employee'))::text,true);
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
insert into storage.buckets(id,name,public) values('moderation-evidence','moderation-evidence',false);
insert into storage.objects(bucket_id,name,version,metadata) values
 ('moderation-evidence',current_setting('test.object')||'/original','archive-v1','{"size":7,"mimetype":"image/jpeg"}'),
 ('moderation-evidence',gen_random_uuid()::text||'/original','unrelated-v1','{"size":7,"mimetype":"image/jpeg"}');
update public.moderation_media_objects m set archive_proof=jsonb_build_object('sha256',repeat('a',64),'size',7,
 'evidenceIdentity',jsonb_build_object('id',o.id,'version',o.version,'size',7,'mime','image/jpeg'))
 from storage.objects o where m.id=current_setting('test.object')::uuid and o.bucket_id='moderation-evidence' and o.name=m.id::text||'/original';
-- Deliberately permissive unrelated policy proves the restrictive boundaries win.
create policy test_permissive_evidence on storage.objects for select to public using(bucket_id='moderation-evidence');
select pg_temp.check_true(not has_function_privilege('doji_employee','public.preserved_media_manifest_v1(uuid)','EXECUTE'),'internal manifest not exposed as arbitrary employee RPC');
update public.admin_employees set roles=array['moderator'],status='active' where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true((select count(*)=1 from storage.objects where bucket_id='moderation-evidence'),'only exact verified archive visible despite PUBLIC policy');
select pg_temp.check_true(not public.employee_can_read_preserved_media_v1('../original'),'archive traversal denied');
select pg_temp.check_true(not public.employee_can_read_preserved_media_v1(current_setting('test.object')||'/%6friginal'),'encoded archive path denied');
select pg_temp.check_true(public.get_admin_report_case_v3((current_setting('test.report')::jsonb->>'id')::uuid)#>>'{preserved_media_manifest,decision_id}'=current_setting('test.decision'),'report manifest tied to actual decision');
select pg_temp.check_true(public.get_admin_report_case_v3((current_setting('test.report')::jsonb->>'id')::uuid)#>>'{preserved_media_manifest,source}'='preserved_decision_media','preserved bytes explicitly distinct from current content');
select pg_temp.check_true(public.get_admin_appeal_case_v1(current_setting('test.appeal')::uuid)#>>'{original_evidence,preserved_media_manifest,decision_id}'=current_setting('test.decision'),'appeal archive is tied to appealed decision');
reset role;
select set_config('test.newer_decision',gen_random_uuid()::text,true);
insert into public.moderation_decisions select (jsonb_populate_record(null::public.moderation_decisions,to_jsonb(d)||jsonb_build_object(
 'id',current_setting('test.newer_decision'),'state','active','action','no_violation','policy_code','no_violation','severity','none',
 'decided_at',clock_timestamp(),'reversed_at',null,'reversal_reason',null))).*
 from public.moderation_decisions d where id=current_setting('test.decision')::uuid;
set local role doji_employee;
select pg_temp.check_true(public.get_admin_report_case_v3((current_setting('test.report')::jsonb->>'id')::uuid)#>>'{preserved_media_manifest,decision_id}'=current_setting('test.newer_decision'),'report uses newest decision without borrowing older media');
select pg_temp.check_true(public.get_admin_appeal_case_v1(current_setting('test.appeal')::uuid)#>>'{original_evidence,preserved_media_manifest,decision_id}'=current_setting('test.decision'),'newer report decision cannot replace appealed archive');
reset role;
-- An unlinked restricted duplicate is enough to deny routine access.
select set_config('test.restricted_duplicate',gen_random_uuid()::text,true);
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.viewer'))::text,true);
insert into public.reports select (jsonb_populate_record(null::public.reports,to_jsonb(r)||jsonb_build_object('id',current_setting('test.restricted_duplicate'),'status','pending'))).*
 from public.reports r where id=(current_setting('test.report')::jsonb->>'id')::uuid;
insert into public.admin_report_triage(report_id,queue) values(current_setting('test.restricted_duplicate')::uuid,'restricted_safety')
 on conflict(report_id) do update set queue='restricted_safety';
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'restricted duplicate defeats routine access');
select pg_temp.check_true(not exists(select 1 from jsonb_array_elements(public.get_admin_appeal_case_v1(current_setting('test.appeal')::uuid)#>'{original_evidence,preserved_media_manifest,items}') item where item->>'path' is not null),'unauthorized archive paths omitted from appeal');
reset role;
update public.admin_employees set roles=array['operations'] where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true((select count(*)=1 from storage.objects where bucket_id='moderation-evidence'),'authorized restricted reviewer can read exact archive');
reset role;
update storage.objects set version='unexpected-replacement' where bucket_id='moderation-evidence' and name=current_setting('test.object')||'/original';
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'replaced archive fails closed');
reset role;
update storage.objects set version='archive-v1' where bucket_id='moderation-evidence' and name=current_setting('test.object')||'/original';
update storage.buckets set public=true where id='moderation-evidence';
set local role doji_employee;
select pg_temp.check_true(not public.employee_can_read_preserved_media_v1(current_setting('test.object')||'/original'),'private bucket required by staff authorization');
reset role;
update storage.buckets set public=false where id='moderation-evidence';
update public.admin_employees set roles=array['legal_reviewer'] where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'legal-only role cannot read moderation evidence');
reset role;
update public.admin_employees set roles=array['super_admin'],status='disabled' where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'disabled employee archive access revoked');
reset role;
update public.admin_employees set status='active' where id=current_setting('test.employee')::uuid;
select set_config('request.jwt.claims',(current_setting('test.employee_claims')::jsonb||'{"aal":"aal1"}')::text,true);
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'AAL1 archive access denied');
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',current_setting('test.author'))::text,true);
set local role authenticated;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'member cannot read private archive even with PUBLIC allow policy');
select pg_temp.expect_error('select public.employee_can_read_preserved_media_v1(''anything'')','permission denied');
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'anonymous cannot read archive');
reset role;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
-- Real cascades must not block deletion or declassify a restricted duplicate.
select set_config('request.jwt.claims','{"role":"service_role"}',true);
update public.moderation_media_objects set desired='restored',phase='archived',lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
 where id=current_setting('test.object')::uuid;
select set_config('test.cancel_lease',(select lease_id::text from public.moderation_media_objects where id=current_setting('test.object')::uuid),true);
delete from auth.users where id=current_setting('test.author')::uuid;
select pg_temp.check_true(not exists(select 1 from public.profiles where id=current_setting('test.author')::uuid),'account deletion remains available with media holds');
select pg_temp.check_true(exists(select 1 from public.moderation_media_objects where id=current_setting('test.object')::uuid),'account deletion preserves exact media ledger');
select pg_temp.check_true((select restore_cancelled and desired='restored' and lease_id::text=current_setting('test.cancel_lease') from public.moderation_media_objects where id=current_setting('test.object')::uuid),'account deletion cancels restoration without stealing its in-flight lease');
select pg_temp.check_true(not public.check_moderation_media_lease_v1(current_setting('test.object')::uuid,current_setting('test.cancel_lease')::uuid,(select revision from public.moderation_media_objects where id=current_setting('test.object')::uuid)),'deleted member cannot pass restoration authorization');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
update public.admin_employees set roles=array['moderator'] where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true(not exists(select 1 from storage.objects where bucket_id='moderation-evidence'),'account deletion cannot declassify restricted evidence');
reset role;
update public.admin_employees set roles=array['super_admin'] where id=current_setting('test.employee')::uuid;
set local role doji_employee;
select pg_temp.check_true((select count(*)=1 from storage.objects where bucket_id='moderation-evidence'),'authorized archive access survives member deletion');
reset role;
