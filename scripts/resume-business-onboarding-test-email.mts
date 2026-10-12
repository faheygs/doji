// One explicit reconciliation of the never-claimed acceptance job, not a retry loop.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHmac} from 'node:crypto';
import {cli,ref,hash,inventory} from './prepare-safety-launch.mts';
import {database,secrets} from './business-disabled-release-reads.mts';
import {evidenceRecord as record,evidenceRows as rows} from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011',secure='.artifacts/business-onboarding-release-20261011';
const id='be89b5ae-cd7a-4915-bae1-bc7fd4801cfc',app='9af16915-3c97-484e-ab93-69f58a464608';
const query=(sql:string)=>rows(cli(['db','query',sql,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
const save=(name:string,value:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
await assert.rejects(access(`${root}/email-reconcile-started.json`),'Never repeat reconciliation automatically');
const baseline=record(JSON.parse(await readFile(`${root}/baseline.json`,'utf8'))),d=database();
assert.equal(d.event_window,false);assert.equal(d.overdue_sample,0);
for(const k of ['contracts','policies'])assert.equal(d[k],record(baseline.database)[k]);
const capacity=record(JSON.parse(await readFile(`${root}/capacity.json`,'utf8')));
assert.ok(Date.now()-Date.parse(String(capacity.at))<3600000,'Capacity review expired');
const raw=await readFile(`${secure}/mail.json`,'utf8'),cfg=record(JSON.parse(raw));
assert.equal(hash(raw),secrets().find(s=>s.name==='BUSINESS_APPLICATION_MAIL_CONFIG')?.value);
assert.equal(cfg.allowedRecipient,'faheygs+doji-business-test@gmail.com');
// Verify the exact hosted repair, not just deployment acknowledgement.
const folder=`${root}/mail-repaired-download`;await mkdir(folder,{recursive:true});
cli(['functions','download','business-application-mail','--project-ref',ref,'--use-api','--workdir',resolve(folder)],false);
const files=(await inventory(folder)).filter(f=>f.path.endsWith('/index.ts'));assert.equal(files.length,1);
const actual=hash((await readFile(`${folder}/${files[0]!.path}`,'utf8')).replaceAll('\r\n','\n'));
assert.equal(actual,hash((await readFile(`${root}/mail-diagnostic/supabase/functions/business-application-mail/index.ts`,'utf8')).replaceAll('\r\n','\n')));
const q=query(`begin read only;set local statement_timeout='3s';
 select q.id,q.wake_nonce,q.status,q.provider_id,q.lease_token,q.dispatch_authorized,q.revision,a.state,a.revision current_revision,
 e.day_used,e.month_used,e.sending_enabled,e.capture_enabled,s.enabled wake_enabled,
 (e.capacity_verified_until>clock_timestamp()) capacity_current,
 (select status_code from net._http_response where id=q.wake_request_id) wake_status,
 (select timed_out from net._http_response where id=q.wake_request_id) wake_timeout,
 i.subject from business_private.email_outbox q join business_private.applications a on a.id=q.application_id
 join portal_identity_private.identities i on i.principal_id=q.applicant_id and i.realm='business' and not i.revoked
 cross join business_private.email_settings e cross join business_private.email_sender_settings s
 where q.id='${id}' and q.application_id='${app}';rollback;`)[0];
assert.ok(q);assert.equal(q.status,'queued');assert.equal(q.provider_id,null);assert.equal(q.lease_token,null);assert.equal(q.dispatch_authorized,false);
assert.equal(q.state,'approved');assert.equal(q.revision,6);assert.equal(q.current_revision,6);
for(const key of ['day_used','month_used'])assert.equal(q[key],0);
for(const key of ['sending_enabled','capture_enabled','wake_enabled'])assert.equal(q[key],false);
assert.equal(q.capacity_current,true);assert.equal(q.wake_status,503);assert.equal(q.wake_timeout,false);
assert.match(String(q.subject),/^user_[A-Za-z0-9]+$/);assert.match(String(q.wake_nonce),/^[a-f0-9-]{36}$/);
const r=await fetch(`https://api.workos.com/user_management/users/${q.subject}`,{headers:{authorization:`Bearer ${cfg.workosKey}`},redirect:'error',signal:AbortSignal.timeout(10000)});
assert.equal(r.status,200);const user=record(await r.json());assert.equal(user.id,q.subject);assert.equal(user.email_verified,true);assert.equal(user.email,cfg.allowedRecipient);
await save('email-reconcile-started',{at:new Date().toISOString(),id,sourceHash:actual,providerDashboard:'Exact recipient search: no results',previousWake:503,previousClaim:false});
try {
 query(`begin;set local lock_timeout='2s';set local statement_timeout='3s';
 do $$begin if not exists(select 1 from business_private.email_outbox where id='${id}' and status='queued' and lease_token is null and not dispatch_authorized and provider_id is null)
 or exists(select 1 from business_private.email_settings where sending_enabled or capture_enabled or day_used<>0 or month_used<>0 or daily_limit<>1 or monthly_limit<>1 or capacity_verified_until<=clock_timestamp())
 then raise exception 'Reconciliation changed';end if;end$$;
 update business_private.email_settings set sending_enabled=true where singleton;commit;`);
 const body={id,nonce:q.wake_nonce,expires:Math.floor(Date.now()/1000)+120};
 const signature=createHmac('sha256',String(cfg.signingKey)).update(`${body.id}|${body.nonce}|${body.expires}`).digest('hex');
 const sent=await fetch(`https://${ref}.supabase.co/functions/v1/business-application-mail`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,signature}),signal:AbortSignal.timeout(20000)});
 await save('email-reconcile-response',{at:new Date().toISOString(),status:sent.status,body:await sent.json()});
} finally {
 query(`begin;set local lock_timeout='2s';set local statement_timeout='3s';update business_private.email_settings set sending_enabled=false,capture_enabled=false where singleton;update business_private.email_sender_settings set enabled=false where singleton;commit;`);
 await save('email-reconcile-stopped',{at:new Date().toISOString(),sending:false,capture:false,wakeup:false});
}
const outcome=query(`begin read only;select id,status,provider_id,dispatch_authorized from business_private.email_outbox where id='${id}';rollback;`);
await save('email-reconcile-outcome',{at:new Date().toISOString(),outcome});console.log(JSON.stringify(outcome));
assert.equal(outcome[0]?.status,'accepted','Stop: inspect durable outcome, never automatically resend');
