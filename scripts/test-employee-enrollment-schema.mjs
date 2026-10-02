import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const podman='C:/Program Files/RedHat/Podman/podman.exe';
const container='supabase_db_employee-enrollment-check';
function sql(source){return execFileSync(podman,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();}
assert.equal(sql('select count(*) from auth.users;'),'0');
assert.equal(sql("select count(*) from vault.secrets;"),'0');
sql('create extension if not exists pg_trgm with schema extensions; create extension if not exists pg_net with schema extensions; create extension if not exists pg_cron;');
if(sql("select to_regclass('public.profiles') is null;")==='t') sql(readFileSync('test-results/employee-sandbox/public-schema.sql','utf8'));
const snapshot=`select jsonb_build_object('functions',(select jsonb_agg(x order by signature) from
 (select p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) body,
 has_function_privilege('authenticated',p.oid,'EXECUTE') member,has_function_privilege('anon',p.oid,'EXECUTE') anon
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f') x),
 'policies',(select jsonb_agg(x order by schemaname,tablename,policyname) from pg_policies x where schemaname in ('public','storage')));`;
const before=JSON.parse(sql(snapshot));
const source=readFileSync('test-results/employee-enrollment-release/enrollment.sql','utf8');
// Unsafe inherited PUBLIC access aborts the entire additive release.
assert.throws(()=>sql(source.replace('begin;', () => 'begin; create function public.enrollment_test_leak() returns boolean language sql as $$select true$$; grant execute on function public.enrollment_test_leak() to public;')), error=>/Employee isolation preflight: unexpected RPC access/.test(String(error.stderr)));
assert.equal(sql("select exists(select 1 from pg_roles where rolname='doji_employee');"),'f');
sql(source);
const after=JSON.parse(sql(snapshot));
for(const original of before.functions)assert.deepEqual(after.functions.find(f=>f.signature===original.signature),original);
assert.deepEqual(after.policies,before.policies);
assert.equal(sql("select to_regclass('public.admin_employee_cutover') is null;"),'t');
assert.equal(sql("select has_function_privilege('doji_employee','public.get_own_profile()','EXECUTE');"),'f');
console.log(`PASS: enrollment-only migration; ${before.functions.length} existing function definitions/member grants and RLS policies unchanged; unsafe grant rolls back; no portal cutover`);
