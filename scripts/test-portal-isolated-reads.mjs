// Runs only against an ephemeral in-memory PostgreSQL instance, never production.
// Pass the local @electric-sql/pglite module path as argv[2].
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const { PGlite } = await import(pathToFileURL(process.argv[2]).href);
const db = new PGlite();
const read = (name) => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');
const fn = (source, name) => {
  const start = source.indexOf(`create or replace function public.${name}(`);
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('$$;', source.indexOf('as $$', start)) + 3);
};
await db.exec(`
  create role anon; create role authenticated;
  create schema auth;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true),'')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',current_setting('test.aal',true)) $$;
  grant usage on schema auth to authenticated,anon;
  create table profiles(id uuid primary key, username text, display_name text, avatar_url text, is_admin boolean default false, is_banned boolean default false);
  create table admin_operator_roles(user_id uuid, role text, revoked_at timestamptz);
  create table reports(id uuid primary key, created_at timestamptz, status text, target_kind text, reason text, reason_detail text);
  create table admin_report_triage(report_id uuid primary key, queue text, priority text, assigned_to uuid);
  create table challenge_suggestions(id uuid primary key, user_id uuid, created_at timestamptz, status text, kind text, body text, options jsonb);
  create table moderation_decisions(id uuid primary key, report_id uuid, policy_code text, severity text, content_kind text, decided_by uuid);
  create table moderation_appeals(id uuid primary key, decision_id uuid, user_id uuid, status text, statement text, submitted_at timestamptz);
  -- Health dependencies are replaced ONLY in this fixture. Real health SQL is
  -- independently source-checked as read-only; full deployed-schema test remains required.
  create function get_operational_health() returns jsonb language sql stable as $$ select '{"healthy":true}'::jsonb $$;
  revoke all on function get_operational_health() from public,anon,authenticated;
`);
await db.exec(fn(await read('20260924120000_admin_moderation_workflow.sql'), 'admin_user_has_permission'));
await db.exec(fn(await read('20260924000000_admin_portal_read_model.sql'), 'get_admin_portal_session'));
await db.exec(fn(await read('20260924170000_restricted_safety_dispositions.sql'), 'get_admin_portal_session_v2'));
await db.exec(await read('20260926000000_admin_portal_isolated_reads.sql'));
const uid = '11111111-1111-4111-8111-111111111111';
await db.exec(`insert into profiles(id,username) values ('${uid}','tester');
  insert into admin_operator_roles values ('${uid}','moderator',null);
  insert into reports select md5('report'||i)::uuid, '2026-09-24T12:00:00Z'::timestamptz, 'pending','post','restricted_goods','drugs' from generate_series(1,63) i;
  insert into challenge_suggestions select md5('idea'||i)::uuid,'${uid}','2026-09-24T12:00:00Z','pending','photo_idea','Idea '||i,'[]' from generate_series(1,52) i;
  insert into moderation_decisions values(md5('decision')::uuid,md5('report1')::uuid,'restricted_goods','level_2','post','${uid}');
  insert into moderation_appeals select md5('appeal'||i)::uuid,md5('decision')::uuid,'${uid}','pending','Test appeal','2026-09-24T12:00:00Z' from generate_series(1,51) i;
  insert into admin_report_triage values(md5('report1')::uuid,'restricted_safety','critical','${uid}');
  set test.uid='${uid}'; set test.aal='aal2'; set role authenticated;`);
async function call(sql, params = []) { return (await db.query(sql, params)).rows[0].value; }
const session = () => call('select get_admin_portal_session_v3() as value');
const page = (queue='all',filter='all',search=null,cursor=null) => call('select get_admin_work_queue_page_v1(25,$1,$2,$3,$4,$5) as value', [queue,filter,search,cursor?.at || null,cursor?.id || null]);
async function allPages() {
  const ids = []; let cursor = null; let loops = 0;
  do { const result = await page('all','all',null,cursor); ids.push(...result.items.map((x) => x.id)); cursor = result.next_cursor; assert(++loops < 20); } while(cursor);
  assert.equal(ids.length,new Set(ids).size,'tied timestamps must not duplicate rows');
  return ids;
}
assert.equal((await session()).capabilities.operations_read,false);
assert.equal((await allPages()).length,114,'moderator sees all 63 reports + 51 appeals, no suggestions');
assert.equal((await page('all','mine')).items.length,1);
assert((await page('safety','urgent')).items.every((item) => ['high','critical'].includes(item.priority)));
assert.equal((await page('moderation','all','not present')).items.length,0);
assert.equal((await page('all','all','%')).items.length,0,'search wildcard is literal');
const reportId = (await call("select md5('report63') as value"));
assert.equal((await page('all','all',`${reportId.slice(0,8)}-${reportId.slice(8,12)}`)).items.length,1,'search beyond first page');
await assert.rejects(call('select get_admin_operational_health_read_v1() as value'),/access required/);
await assert.rejects(call('select get_operational_health() as value'),/permission denied/);
for (const role of ['legal_reviewer','business_reviewer','operations','super_admin']) {
  await db.exec(`reset role; update admin_operator_roles set role='${role}'; set role authenticated;`);
  assert.equal((await session()).roles[0],role);
  const ids = await allPages();
  assert.equal(ids.length,['operations','super_admin'].includes(role)?166:0,`scope for ${role}`);
  if (role==='operations') assert.equal((await call('select get_admin_operational_health_read_v1() as value')).healthy,true);
}
await assert.rejects(call('select get_admin_work_queue_page_v1(500) as value'),/Invalid/);
await db.exec("set test.aal='aal1'");
await assert.rejects(page(),/MFA/);
await assert.rejects(session(),/MFA/);
await db.exec("set test.aal='aal2'; reset role; update profiles set is_banned=true; set role authenticated;");
await assert.rejects(page(),/access required/);
await db.exec('reset role; update profiles set is_banned=false; delete from admin_operator_roles; set role authenticated;');
await assert.rejects(page(),/access required/);
await db.exec('reset role; set role anon;');
await assert.rejects(page(),/permission denied/);
console.log(JSON.stringify((await db.query("select proname, md5(regexp_replace(regexp_replace(prosrc, '--[^\\n]*', '', 'g'), '\\s', '', 'g')) as body_hash from pg_proc where proname in ('get_admin_portal_session_v3','get_admin_operational_health_read_v1','get_admin_work_queue_page_v1') order by proname")).rows));
await db.close();
console.log('Ephemeral PostgreSQL: role scopes, AAL2, banned/revoked/member denial, grants, 166-item keyset traversal, ties, literal search, and read-only health wrapper passed.');
