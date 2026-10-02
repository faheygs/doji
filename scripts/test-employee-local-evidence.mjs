// Read-only production policy definitions were reviewed separately. All changes
// below target the synthetic local container and roll back, including fixtures.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { engine, container } from './database/owned-target.mjs';
const draft=readFileSync('docs/drafts/20260926011000_employee_portal_authorization.sql','utf8');
const start=draft.indexOf('create function public.employee_can_read_report_evidence_v1(');
const end=draft.indexOf('-- No client can turn off',start);
assert.ok(start>0 && end>start);
const definition=draft.slice(start,end).replace('create function','create or replace function');
const source=`begin;
${process.env.DOJI_CLEAN_ROOM_CONTAINER ? '-- Use the actual replayed Storage policies and evidence function.' : `
drop policy if exists employee_report_evidence_read on storage.objects;
drop policy if exists employee_report_evidence_boundary on storage.objects;
${definition}
-- Production's existing PUBLIC avatars policy, not a new production grant.
create policy avatars_read on storage.objects for select to public using(bucket_id='avatars');
`}
select set_config('test.member_id',id::text,true) from auth.users
 where email like 'member-%@test.invalid' and role='authenticated' limit 1;
update auth.users set raw_user_meta_data=raw_user_meta_data||jsonb_build_object(
 'terms_version','2026-08-20','privacy_version','2026-08-20',
 'terms_accepted_at',now(),'privacy_accepted_at',now()) where id=current_setting('test.member_id')::uuid;
insert into public.profiles(id,username,display_name)
 values(current_setting('test.member_id')::uuid,'evidence_test_member','Local evidence member');
create temp table evidence_fixtures(id uuid,object_name text,offset_seconds integer);
insert into evidence_fixtures values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','employee-test-routine.jpg',1),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','employee-test-restricted.jpg',2),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','employee-test-unreported.jpg',3);
insert into public.challenges(id,title,description,category)
 values('dddddddd-dddd-4ddd-8ddd-dddddddddddd','Local evidence fixture','Synthetic test only','creative');
insert into public.daily_events(id,challenge_id,fires_at)
 select id,'dddddddd-dddd-4ddd-8ddd-dddddddddddd',now()+offset_seconds*interval '1 second' from evidence_fixtures;
insert into public.user_events(id,user_id,daily_event_id,expires_at)
 select id,current_setting('test.member_id')::uuid,id,now()+interval '10 minutes' from evidence_fixtures;
insert into storage.buckets(id,name) values('avatars','avatars'),('post-media','post-media') on conflict do nothing;
insert into storage.objects(bucket_id,name) values('avatars','employee-test-avatar.jpg');
insert into storage.objects(bucket_id,name,owner_id)
 select 'post-media',object_name,current_setting('test.member_id') from evidence_fixtures;
insert into public.media_upload_intents(user_id,user_event_id,idempotency_key,slot,object_path,content_type)
 select current_setting('test.member_id')::uuid,id,id::text,'photo',object_name,'image/jpeg' from evidence_fixtures;
insert into public.posts(id,user_id,user_event_id,daily_event_id,idempotency_key,photo_url)
 select id,current_setting('test.member_id')::uuid,id,id,id::text,
 'https://test.invalid/storage/v1/object/public/post-media/'||object_name from evidence_fixtures;
insert into public.reports(id,post_id,reason,target_kind,reporter_id) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','spam','post',current_setting('test.member_id')::uuid),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','other','post',current_setting('test.member_id')::uuid);
insert into public.admin_report_triage(report_id,queue) values
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','restricted_safety')
 on conflict(report_id) do update set queue=excluded.queue;
select set_config('request.jwt.claims',jsonb_build_object('sub',id,'role','doji_employee','aal','aal2')::text,true)
 from public.admin_employees where status='active' and 'super_admin'=any(roles) limit 1;
set local role doji_employee;
do $$begin
 if (select count(*) from storage.objects)<>2 then raise exception 'Owner must see only two reported objects'; end if;
end$$;
reset role;
update public.admin_employees set roles=array['moderator'] where id=auth.uid();
set local role doji_employee;
do $$begin
 if (select count(*) from storage.objects)<>1 then raise exception 'Moderator must see only routine evidence'; end if;
 if not exists(select 1 from storage.objects where name='employee-test-routine.jpg') then raise exception 'Routine evidence missing'; end if;
end$$;
reset role;
update public.admin_employees set status='disabled' where id=auth.uid();
set local role doji_employee;
do $$begin
 if exists(select 1 from storage.objects) then raise exception 'Disabled employee must see no objects'; end if;
end$$;
reset role;
rollback;`;
export const employeeEvidenceSetup = source.slice(0,source.indexOf('set local role doji_employee;'));
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
try {
  execFileSync(engine,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],
    {input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']});
} catch(error) { console.error(String(error.stderr)); process.exitCode=1; }
if(!process.exitCode) console.log('Full-schema local evidence checks passed: owner reported-only, moderator no restricted media, disabled staff denied, PUBLIC avatars cannot widen employee access. All fixture changes rolled back.');
}
