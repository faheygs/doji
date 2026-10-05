// Isolated PostgreSQL contract fixture. Never points at production.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type {MemorySql} from './database/contracts.mts';
import {evidenceRecord,evidenceAt,evidenceText} from './release-evidence.mts';
const { PGlite } = await import(pathToFileURL(evidenceText(process.argv[2])).href) as {PGlite:new()=>MemorySql};
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create schema auth;
alter default privileges revoke execute on functions from public;
create table auth.users(id uuid primary key,email text unique);
create table profiles(id uuid primary key references auth.users(id) on delete cascade,username text);
create table posts(id uuid primary key,user_id uuid references profiles on delete cascade);
create table reports(id uuid primary key,reporter_id uuid not null,reported_user_id uuid,post_id uuid,
  constraint reports_reporter_fkey foreign key(reporter_id) references profiles on delete cascade,
  constraint reports_reported_fkey foreign key(reported_user_id) references profiles on delete set null,
  constraint reports_post_fkey foreign key(post_id) references posts on delete set null);
create table moderation_decisions(id uuid primary key, report_id uuid not null references reports on delete restrict,
  affected_user_id uuid not null references profiles on delete restrict,decided_by uuid not null references profiles on delete restrict,
  reversed_by uuid references profiles on delete restrict, rationale text, state text);
create table moderation_account_actions(id uuid primary key, decision_id uuid references moderation_decisions on delete restrict,
  user_id uuid not null references profiles on delete restrict, state text);
create table moderation_notices(id uuid primary key,decision_id uuid references moderation_decisions on delete restrict,
  user_id uuid not null references profiles on delete restrict,body text);
create table moderation_appeals(id uuid primary key,decision_id uuid references moderation_decisions on delete restrict,
  user_id uuid not null references profiles on delete restrict,reviewed_by uuid references profiles on delete restrict,
  status text not null check(status in ('pending','upheld','reversed')),review_reason text);
create table challenge_suggestions(id uuid primary key,reviewed_by uuid references profiles);
create table admin_audit_log(id uuid primary key default gen_random_uuid(), actor_id uuid references profiles on delete set null,
  actor_role text,action text,entity_type text,entity_id text,reason text,metadata jsonb);
create table test_events(channel text,event text,entity_id uuid,payload jsonb);
create function enqueue_domain_event(text,text,uuid,jsonb,text) returns uuid language sql as $$
  insert into public.test_events values($1,$2,$3,$4) returning gen_random_uuid() $$;
create function get_admin_report_case_v2(uuid) returns jsonb language plpgsql security definer as $$ begin
  if current_setting('test.aal',true) is distinct from 'aal2' then raise exception 'MFA required'; end if;
  return jsonb_build_object('id',$1,'history','unchanged'); end $$;
grant select on profiles to authenticated;
insert into auth.users select md5('member'||i)::uuid, 'member'||i||'@example.test' from generate_series(1,7)i;
insert into profiles select id,email from auth.users;
insert into posts select md5('post'||i)::uuid,md5('member'||i)::uuid from generate_series(1,4)i;
insert into reports values(md5('report1')::uuid,md5('member3')::uuid,md5('member1')::uuid,md5('post1')::uuid),
 (md5('report2')::uuid,md5('member3')::uuid,md5('member2')::uuid,md5('post2')::uuid);
insert into moderation_decisions select md5('decision'||i)::uuid,md5('report'||i)::uuid,md5('member'||i)::uuid,
 md5('member4')::uuid,null,'Retained rationale '||i,'active' from generate_series(1,2)i;
insert into moderation_account_actions select md5('action'||i)::uuid,md5('decision'||i)::uuid,md5('member'||i)::uuid,'active' from generate_series(1,2)i;
insert into moderation_notices select md5('notice'||i)::uuid,md5('decision'||i)::uuid,md5('member'||i)::uuid,'Retained notice '||i from generate_series(1,2)i;
insert into moderation_appeals values(md5('appeal1')::uuid,md5('decision1')::uuid,md5('member1')::uuid,null,'pending',null),
 (md5('appeal2')::uuid,md5('decision2')::uuid,md5('member2')::uuid,md5('member4')::uuid,'upheld','Original review reason');
insert into challenge_suggestions values(md5('suggestion')::uuid,md5('member4')::uuid);
insert into admin_audit_log(actor_id,action,metadata) values(md5('member4')::uuid,'original.review','{"original":true}');
`);
const scalar = async (sql:string):Promise<unknown> => {const row=(await db.query(sql)).rows[0];assert.ok(row);return row.value;};
const deletion = (i:number) => db.exec(`delete from auth.users where id=md5('member${i}')::uuid`);
await assert.rejects(deletion(1),/foreign key/,'reproduces current moderated account deletion failure');
await assert.rejects(deletion(3),/foreign key/,'reporter cascade cannot destroy a decided case');
await db.exec(await readFile(new URL('../supabase/migrations/20260926020000_delete_members_retain_moderation_history.sql',import.meta.url),'utf8'));
await db.exec("set test.aal='aal1'; set role authenticated;");
await assert.rejects(scalar('select count(*) value from admin_deleted_member_references'),/permission denied/);
await assert.rejects(scalar("select get_admin_report_case_v2(md5('report1')::uuid) value"),/MFA required/);
assert.equal(await scalar('select count(*)::int value from profiles'),7,'member read grant unchanged');
await db.exec('reset role');
await deletion(5); // clean account
await deletion(1); // dirty pending appeal
await deletion(2); // dirty resolved appeal
await deletion(3); // reporter, preserve reports
await deletion(4); // historical staff actor, preserve case/suggestion/audit
for (const table of ['moderation_decisions','moderation_account_actions','moderation_notices','moderation_appeals','reports']) {
  assert.equal(await scalar(`select count(*)::int value from ${table}`),2,`${table} history retained`);
}
assert.equal(await scalar("select status value from moderation_appeals where id=md5('appeal1')::uuid"),'closed_account_deleted');
assert.equal(await scalar("select status value from moderation_appeals where id=md5('appeal2')::uuid"),'upheld');
assert.equal(await scalar("select review_reason value from moderation_appeals where id=md5('appeal2')::uuid"),'Original review reason');
assert.equal(await scalar("select count(*)::int value from moderation_decisions where affected_user_id is null and decided_by is null"),2);
assert.equal(await scalar("select (deleted_member_refs->>'affected_user_id'=md5('member1')::uuid::text) value from moderation_decisions where id=md5('decision1')::uuid"),true);
assert.equal(await scalar("select metadata->>'original' value from admin_audit_log where action='original.review'"),'true');
assert.equal(await scalar("select metadata->>'pendingAppealsClosed' value from admin_audit_log where action='account.deleted' and entity_id=md5('member1')::uuid::text"),'1');
assert.equal(await scalar("select metadata->>'pendingAppealsClosed' value from admin_audit_log where action='account.deleted' and entity_id=md5('member2')::uuid::text"),'0');
assert.equal(await scalar("select (deleted_member_refs->>'reviewed_by'=md5('member4')::uuid::text) value from challenge_suggestions"),true);
const auditCount = await scalar('select count(*)::int value from admin_audit_log');
await deletion(1);
assert.equal(await scalar('select count(*)::int value from admin_audit_log'),auditCount,'repeat deletion cannot duplicate retained history');
assert.equal(await scalar('select count(*)::int value from posts'),0,'member posts deleted normally');
assert.equal(await scalar('select count(*)::int value from auth.users'),2,'unrelated users untouched');
await db.exec("set test.aal='aal2'; set role authenticated;");
const detail=evidenceRecord(await scalar("select get_admin_report_case_v2(md5('report1')::uuid) value"));
assert.equal(detail.history,'unchanged'); assert(evidenceAt(detail,'deleted_member_refs').reported_user_id);
await db.exec('reset role');
// Failure after BEFORE DELETE must roll back profile/history/audit mutations.
await db.exec(`create function fail_test_delete() returns trigger language plpgsql as $$ begin raise exception 'Simulated downstream failure'; end $$;
create trigger z_fail_test_delete before delete on profiles for each row execute function fail_test_delete();
insert into reports values(md5('rollback-report')::uuid,md5('member6')::uuid,null,null,'{}');`);
await assert.rejects(deletion(6),/Simulated downstream failure/);
assert.equal(await scalar("select count(*)::int value from auth.users where id=md5('member6')::uuid"),1);
assert.equal(await scalar("select count(*)::int value from admin_deleted_member_references where member_id=md5('member6')::uuid"),0);
assert.deepEqual(await scalar("select deleted_member_refs value from reports where id=md5('rollback-report')::uuid"),{});
await db.close();
console.log('Deletion regression passed: reproduces FK failure; clean, warned, pending/resolved appeal, reporter and actor deletion; retained history, restricted reads, unchanged member grants, unrelated accounts and atomic rollback.');
