// Read-only metadata capture for the approved employee preview. No apply mode.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { cli, ref } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
import { linkedWorkspace, functions } from './business-disabled-release-reads.mts';

assert.equal(process.argv.length, 2, 'No arbitrary target or SQL is accepted');
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
const sql = `begin read only;set local statement_timeout='8s';
 select jsonb_build_object('at',clock_timestamp(),
 'candidate_present',to_regnamespace('staff_workflow_private') is not null,
 'event_window',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes'
   and fires_at+interval '15 minutes'>clock_timestamp() limit 1),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'estimated_rows',c.reltuples,
   'bytes',pg_total_relation_size(c.oid),'rls',c.relrowsecurity,'acl',c.relacl::text) order by c.oid)
   from pg_class c where c.oid in('public.reports'::regclass,'public.admin_report_triage'::regclass,
   'public.moderation_appeals'::regclass,'public.moderation_decisions'::regclass,'public.moderation_account_actions'::regclass,
   'public.challenge_suggestions'::regclass,'business_private.applications'::regclass,'business_private.submissions'::regclass,
   'business_private.privacy_cases'::regclass,'public.safety_removal_cases'::regclass)),
 'indexes',(select jsonb_agg(jsonb_build_object('table',i.indrelid::regclass::text,'definition',pg_get_indexdef(i.indexrelid),
   'valid',i.indisvalid,'ready',i.indisready) order by i.indexrelid) from pg_index i
   where i.indrelid in('business_private.applications'::regclass,'business_private.privacy_cases'::regclass,'public.safety_removal_cases'::regclass)),
 'dependencies',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),
   'acl',p.proacl::text)) from pg_proc p where p.oid in(
   'public.admin_user_has_permission(text)'::regprocedure,'public.admin_editorial_authorize_v1(boolean)'::regprocedure,
   'business_private.staff_actor(boolean)'::regprocedure,'business_private.privacy_actor()'::regprocedure,
   'portal_identity_private.employee_actor_v1(text,text,text,text,boolean)'::regprocedure,
   'portal_identity_private.employee_rpc_v1(text,text,text,text,boolean,text,jsonb)'::regprocedure)),
 'member_contracts',(select md5(jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid)::text)
   from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace)),
 'policies',(select md5(jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)::text) from pg_policies p
   where schemaname in('public','auth','storage')),
 'overdue_sample',(select count(*) from (select 1 from public.domain_event_outbox where published_at is null
   and available_at<clock_timestamp()-interval '60 seconds' limit 1000) q)
 ) state;rollback;`;
const state = evidenceRecord(
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  )[0]?.state,
);
const employee = functions().find((f) => f.slug === 'employee-portal-v2');
assert.ok(employee);
const output = 'test-results/staff-workflow-release';
await mkdir(output, { recursive: true });
const file = `${output}/preflight-${Date.now()}.json`;
await writeFile(file, JSON.stringify({ state, employee }, null, 2), { flag: 'wx' });
console.log(
  JSON.stringify({
    file,
    candidatePresent: state.candidate_present,
    eventWindow: state.event_window,
    overdueSample: state.overdue_sample,
    employeeVersion: employee.version,
    relations: state.relations,
  }),
);
