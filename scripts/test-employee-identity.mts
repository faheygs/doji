// Ephemeral PostgreSQL contract fixture; NOT a full deployed-schema/Auth test.
// node scripts/test-employee-identity.mts <absolute path to @electric-sql/pglite/dist/index.js>
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import type {MemorySql} from './database/contracts.mts';
import {evidenceRecord,evidenceText} from './release-evidence.mts';
const { PGlite } = await import(pathToFileURL(evidenceText(process.argv[2])).href) as {PGlite:new()=>MemorySql};
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role; create role authenticator;
create schema auth; create schema storage;
alter default privileges revoke execute on functions from public;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('role',current_setting('test.role',true),'aal',current_setting('test.aal',true)) $$;
create table auth.users(id uuid primary key, email text unique, role text, raw_app_meta_data jsonb, raw_user_meta_data jsonb, email_confirmed_at timestamptz);
create table auth.mfa_factors(user_id uuid, status text);
create table profiles(id uuid primary key references auth.users(id) on delete cascade, username text, display_name text, avatar_url text);
create table command_receipts(user_id uuid references profiles on delete cascade, idempotency_key text, result jsonb, created_at timestamptz default clock_timestamp(), primary key(user_id,idempotency_key));
create table admin_deleted_member_references(member_id uuid primary key, deleted_at timestamptz default now());
alter table admin_deleted_member_references enable row level security;
create table admin_audit_log(actor_id uuid references profiles, actor_role text, action text, entity_type text, entity_id text, reason text, request_id text, metadata jsonb, deleted_member_refs jsonb not null default '{}');
create table admin_report_triage(report_id uuid, queue text, assigned_to uuid references profiles, resolved_by uuid references profiles);
create table posts(id uuid primary key, photo_url text, front_photo_url text, video_url text);
create table reports(id uuid primary key, post_id uuid references posts, status text);
create table moderation_decisions(decided_by uuid references profiles, reversed_by uuid references profiles, deleted_member_refs jsonb not null default '{}');
create table moderation_appeals(reviewed_by uuid references profiles, deleted_member_refs jsonb not null default '{}');
create table storage.objects(bucket_id text, name text);
alter table storage.objects enable row level security;
create policy existing_public_avatars on storage.objects for select to public using (bucket_id='avatars');
create function public_storage_object_path(text,text) returns text language sql immutable as $$ select $1 $$;
create function admin_user_has_permission(text) returns boolean language sql stable security definer as $$ select true $$;
create function admin_current_operator_role() returns text language sql stable security definer as $$ select 'super_admin'::text $$;
create function get_admin_portal_session() returns jsonb language sql stable security definer as $$ select '{"legacy":true}'::jsonb $$;
create function can_read_post_media(text,uuid) returns boolean language sql stable security definer as $$ select true $$;
create function enqueue_domain_event(text,text,uuid,jsonb,text) returns uuid language sql as $$ select gen_random_uuid() $$;
create function get_admin_fixture_actor() returns jsonb language sql stable security definer as $$ select to_jsonb(actor) from admin_report_triage t join public.profiles actor on actor.id=t.assigned_to limit 1 $$;
grant usage on schema auth, public to authenticated;
grant execute on function auth.uid(), auth.jwt(), admin_user_has_permission(text) to authenticated;
grant select on profiles to authenticated;
`);
const member = '11111111-1111-4111-8111-111111111111';
const owner = '22222222-2222-4222-8222-222222222222';
const worker = '33333333-3333-4333-8333-333333333333';
await db.exec(`insert into auth.users values('${member}','personal@test.invalid','authenticated','{}','{}',now()),
('${owner}','owner@test.invalid','doji_employee','{"account_type":"employee"}','{"display_name":"Owner"}',now()),
('${worker}','worker@test.invalid','doji_employee','{"account_type":"employee"}','{"display_name":"Worker"}',now());
insert into profiles values('${member}','member','Member',null);
insert into posts(id,photo_url) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','routine.jpg'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','restricted.jpg'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','unreported.jpg');
insert into reports values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','pending'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','pending');
insert into admin_report_triage(report_id,queue) values('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','restricted_safety');
insert into storage.objects values('post-media','routine.jpg'),('post-media','restricted.jpg'),('post-media','unreported.jpg'),('avatars','avatar.jpg');
insert into admin_audit_log(actor_id) values('${member}');`);
for (const file of ['20260926010000_employee_identity_foundation.sql','20260926011000_employee_portal_authorization.sql']) {
  if (process.argv.includes('--public-grant-probe') && file.includes('authorization')) {
    await db.exec('create function public.accidental_member_access() returns boolean language sql as $$ select true $$; grant execute on function public.accidental_member_access() to public;');
    await assert.rejects(db.exec(await readFile(new URL(`../docs/drafts/${file}`, import.meta.url), 'utf8')), /unexpected RPC access.*accidental_member_access/);
    await db.exec('rollback');
    await db.close();
    console.log('Employee migration correctly refuses inherited PUBLIC access and rolls back.');
    process.exit(0);
  }
  await db.exec(await readFile(new URL(`../docs/drafts/${file}`, import.meta.url), 'utf8'));
}
async function call(sql:string, params:unknown[]=[]):Promise<unknown> { return (await db.query(sql,params)).rows[0]?.value; }
async function as(role:string,id:string,aal='aal2') { await db.exec(`reset role; set test.uid='${id}'; set test.role='${role}'; set test.aal='${aal}'; set role ${role};`); }
await as('doji_employee', owner, 'aal1');
assert.equal(evidenceRecord(await call('select get_employee_registration_status_v1() value')).status,'pending');
assert.equal(await call('select count(*)::int value from storage.objects'),0,'Pending employee sees no evidence');
await assert.rejects(call('select * from profiles'),/permission denied/);
await assert.rejects(call('select get_admin_portal_session() value'),/Approved employee/);
await assert.rejects(call(`select bootstrap_employee_owner_v1('${owner}','A verified owner request')`),/permission denied/);
await as('service_role',owner);
await call(`select bootstrap_employee_owner_v1('${owner}','A verified owner request') value`);
await assert.rejects(call('select activate_employee_portal_v1() value'),/verified MFA/);
await as('doji_employee',owner,'aal1');
assert.equal(await call("select admin_user_has_permission('admin.manage') value"),false);
await as('doji_employee',owner);
assert.equal(evidenceRecord(await call('select get_admin_portal_session() value')).account_type,'employee');
assert.equal(await call('select count(*)::int value from storage.objects'),2,'Owner sees reported evidence only, not PUBLIC avatars/unreported posts');
await as('doji_employee',worker,'aal1');
await call('select get_employee_registration_status_v1() value');
await as('doji_employee',owner);
const grant = () => call("select admin_set_employee_role_v1('worker@test.invalid','moderator',true,'Approve test worker','request-00000001') value");
assert.deepEqual(evidenceRecord(await grant()).roles,['moderator']);
assert.deepEqual(evidenceRecord(await grant()).roles,['moderator'],'retry is idempotent');
await assert.rejects(call("select admin_set_employee_role_v1('worker@test.invalid','super_admin',true,'Approve test worker','request-00000001') value"),/Request ID already used/);
await assert.rejects(call("select admin_set_employee_role_v1('owner@test.invalid','super_admin',false,'Remove test owner','request-00000002') value"),/must remain/);
await as('doji_employee',worker);
assert.equal(await call("select admin_user_has_permission('moderation.write') value"),true);
assert.equal(await call("select admin_user_has_permission('admin.manage') value"),false);
assert.equal(await call('select count(*)::int value from storage.objects'),1,'Moderator cannot see restricted evidence');
await assert.rejects(call('select get_admin_employee_directory_v1() value'),/super administrator/);
await as('doji_employee',owner);
await call("select admin_set_employee_role_v1('worker@test.invalid','moderator',false,'Disable test worker','request-00000003') value");
await as('doji_employee',worker);
assert.equal(await call("select admin_user_has_permission('portal.session') value"),false);
await db.exec(`reset role; insert into auth.mfa_factors values('${owner}','verified');
insert into admin_report_triage(assigned_to) values('${owner}');`);
assert.equal(evidenceRecord(await call('select get_admin_fixture_actor() value')).display_name,'Owner');
assert.equal(await call(`select count(*)::int value from admin_audit_log where actor_id='${member}'`),1,'historical member actor preserved');
assert.equal(await call(`select count(*)::int value from admin_audit_log where actor_id='${owner}'`),2,'replay did not duplicate audit');
await as('service_role',owner);
await call('select activate_employee_portal_v1() value');
await as('authenticated',member);
assert.equal(await call("select admin_user_has_permission('portal.session') value"),false);
assert.equal(await call('select count(*)::int value from profiles'),1,'member table access preserved');
await assert.rejects(call('select get_employee_registration_status_v1() value'),/permission denied/);
await as('service_role',owner);
assert.equal(await call("select claim_employee_verification_v1('personal@test.invalid') value"),false,'No member verification email');
assert.equal(await call("select claim_employee_verification_v1('owner@test.invalid') value"),false,'No confirmed employee verification email');
await db.exec(`reset role; insert into auth.users values('44444444-4444-4444-8444-444444444444','unconfirmed@test.invalid','doji_employee','{"account_type":"employee"}','{}',null);`);
await as('service_role',owner);
assert.equal(await call("select claim_employee_verification_v1('unconfirmed@test.invalid') value"),true,'Unconfirmed employee may recover email');
await db.exec('reset role; truncate admin_employee_registration_budget;');
await as('service_role',owner);
for(let i=0;i<5;i++) assert.equal(await call('select claim_employee_registration_v1() value'),true);
assert.equal(await call('select claim_employee_registration_v1() value'),false);
assert.equal(await call("select claim_employee_verification_v1('unconfirmed@test.invalid') value"),false,'Recovery cannot evade registration budget');
assert.equal(await call("select employee_login_allowed_v1('personal@test.invalid') value"),false);
assert.equal(await call("select employee_login_allowed_v1('owner@test.invalid') value"),true);
// Existing member deletion remains possible even when the member was an actor.
// Auth-side references must not race profile-cascade history preservation.
await db.exec(`reset role;
insert into moderation_decisions(decided_by,reversed_by) values('${member}','${member}');
insert into moderation_appeals(reviewed_by) values('${member}');
insert into admin_report_triage(assigned_to,resolved_by) values('${member}','${member}');
delete from auth.users where id='${member}';`);
assert.equal(await call(`select count(*)::int value from profiles where id='${member}'`),0);
assert.equal(await call(`select count(*)::int value from moderation_decisions where decided_by is null and reversed_by is null and deleted_member_refs->>'decided_by'='${member}' and deleted_member_refs->>'reversed_by'='${member}'`),1);
assert.equal(await call(`select count(*)::int value from moderation_appeals where reviewed_by is null and deleted_member_refs->>'reviewed_by'='${member}'`),1);
assert.equal(await call(`select count(*)::int value from admin_audit_log where actor_id is null and deleted_member_refs->>'actor_id'='${member}'`),1);
assert.equal(await call(`select count(*)::int value from admin_report_triage where assigned_to is null and resolved_by is null and deleted_member_refs->>'assigned_to'='${member}' and deleted_member_refs->>'resolved_by'='${member}'`),1);
await db.close();
console.log('Employee PostgreSQL fixture passed: pending approval, AAL2, grants, role scope, idempotency, last owner, actor history, member access, cutover, registration/login budgets and legacy-member deletion with retained actor attribution. Full-schema and hosted Auth tests remain required.');
