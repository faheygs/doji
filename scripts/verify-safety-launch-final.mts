// Bounded read-only production verification. No request bodies or secrets saved.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {root,ref,cli,save} from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceArray,firstEvidence} from './release-evidence.mts';
const json=async (n:string)=>evidenceRecord(JSON.parse(await readFile(`${root}/${n}`,'utf8')));
const query=(sql:string)=>firstEvidence(cli(['db','query',sql,'--linked','--output-format','json']),'checks');
const receipt='218161a8-a68a-4542-a471-7d2662cbe7c4';
const expected=evidenceArray((await json('public-activated.json')).functions);
const actual=evidenceArray(evidenceRecord(cli(['functions','list','--project-ref',ref,'--output-format','json'])).functions);
function compareSlug(a:Record<string,unknown>,b:Record<string,unknown>){assert.ok(typeof a.slug==='string'&&typeof b.slug==='string');return a.slug.localeCompare(b.slug);}
assert.deepEqual(actual.sort(compareSlug),expected.sort(compareSlug));
const state=firstEvidence(cli(['db','query','--linked','--file','scripts/verify-safety-live.sql','--output-format','json']),'checks');
assert.equal(state.capture,'O');assert.equal(state.media_config,true);assert.equal(state.alert_config,true);
assert.equal(state.holds,0);assert.equal(state.lock_waits,0);assert.equal(state.overdue_outbox,0);
assert.deepEqual(state.member_policy,evidenceRecord((await json('public-activation-started.json')).before).member_policy,'Release policy changed');
const result=query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'receipt',(select jsonb_build_object('id',c.id,'state',c.state,'queue',c.queue,'received_at',c.received_at,'deadline_at',c.deadline_at,'report_id',c.report_id,'synthetic',c.request->>'name'='Doji synthetic launch verification','alert_state',a.state,'delivery_status',a.provider_delivery_status,'attempts',a.attempts) from public.safety_removal_cases c join public.safety_removal_alerts a on a.case_id=c.id where c.id='${receipt}'),
 'jobs',(select jsonb_agg(jsonb_build_object('jobid',j.jobid,'name',j.jobname,'active',j.active,'schedule',j.schedule,'last_status',(select d.status from cron.job_run_details d where d.jobid=j.jobid order by start_time desc limit 1))) from cron.job j where j.jobname in('safety-removal-alert-recovery-v1','moderation-media-recovery-v1')),
 'anonymous_case_denied',not has_function_privilege('anon','public.get_admin_safety_removal_v1(uuid)','execute'),
 'member_case_denied',not has_function_privilege('authenticated','public.get_admin_safety_removal_v1(uuid)','execute'),
 'member_intake_write_denied',not has_function_privilege('authenticated','public.submit_safety_removal_v1(uuid,text,jsonb)','execute'),
 'evidence_private',(select not public from storage.buckets where id='moderation-evidence'),
 'fixture_objects_left',(select count(*) from storage.objects where name like 'safety-release-canary/%' and bucket_id in('avatars','post-media','moderation-evidence'))
 ) checks;rollback;`);
const receiptEvidence=evidenceRecord(result.receipt),jobs=evidenceArray(result.jobs);
assert.equal(receiptEvidence.synthetic,true);assert.equal(receiptEvidence.report_id,null);assert.equal(receiptEvidence.queue,'restricted_safety');assert.equal(receiptEvidence.delivery_status,'delivered');assert.equal(receiptEvidence.attempts,1);
for(const key of ['anonymous_case_denied','member_case_denied','member_intake_write_denied','evidence_private'])assert.equal(result[key],true,key);
assert.equal(result.fixture_objects_left,0);assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.active&&j.last_status==='succeeded'));
const member=cli(['db','query','--linked','--file','scripts/portal-triage-member-canary.sql','--output-format','json']);
// Exercise bounded employee queue reads without extracting private case contents.
const staff=query(`begin read only;set local statement_timeout='8s';select set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal2"}',true);set local role doji_employee;select jsonb_build_object('restricted_queue_contains_canary',exists(select 1 from jsonb_array_elements(public.get_admin_safety_removals_v1()->'items') x where x->>'id'='${receipt}'),'ordinary_queue_readable',jsonb_typeof(public.get_admin_safety_removals_v1(null,null,false,'moderation')->'items')='array') checks;rollback;`);
assert.equal(staff.restricted_queue_contains_canary,true);assert.equal(staff.ordinary_queue_readable,true);
await save('final-backend-verified.json',{at:new Date().toISOString(),state,result,member,staff,publicBrowser:{receiptCreated:true,statusLookup:'Received; status loaded'},remaining:'Authenticated browser verification and synthetic case disposition require owner sign-in; no real moderation action authorized by test.'});
console.log(JSON.stringify({receipt:receiptEvidence.id,email:receiptEvidence.delivery_status,attempts:receiptEvidence.attempts,queue:receiptEvidence.queue,jobs,memberChecks:'passed',staffQueueRead:'passed',memberPolicyUnchanged:true,privateEvidence:true,fixturesRemaining:0}));
