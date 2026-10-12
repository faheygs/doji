// ONE owner-approved exact-alias approval notification. No account/approval/MFA changes.
import assert from 'node:assert/strict';
import {readFile,writeFile,access} from 'node:fs/promises';
import {cli,ref,hash} from './prepare-safety-launch.mts';
import {database,secrets} from './business-disabled-release-reads.mts';
import {evidenceRecord as record,evidenceRows as rows} from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011',secure='.artifacts/business-onboarding-release-20261011';
const app='9af16915-3c97-484e-ab93-69f58a464608';
const mode=process.argv[2];assert.ok(['send','check','stop'].includes(mode||''));
const query=(sql:string)=>rows(cli(['db','query',sql,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
const save=(name:string,value:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
await access(`${root}/setup-enabled.json`);
const baseline=record(JSON.parse(await readFile(`${root}/baseline.json`,'utf8'))),d=database();
assert.equal(d.event_window,false);assert.equal(d.overdue_sample,0);
for(const key of ['contracts','policies'])assert.equal(d[key],record(baseline.database)[key]);
if(mode==='send') {
 await assert.rejects(access(`${root}/test-email-started.json`),'Never automatically repeat this send');
 const raw=await readFile(`${secure}/mail.json`,'utf8'),mail=record(JSON.parse(raw));
 assert.equal(hash(raw),secrets().find(s=>s.name==='BUSINESS_APPLICATION_MAIL_CONFIG')?.value);
 assert.equal(mail.allowedRecipient,'faheygs+doji-business-test@gmail.com');
 const current=query(`begin read only;set local statement_timeout='3s';select a.revision,a.state,i.subject,r.issuer,r.audience
 from business_private.applications a join portal_identity_private.identities i on i.principal_id=a.applicant_id and i.realm='business' and not i.revoked
 join portal_identity_private.realms r on r.realm=i.realm and r.enabled where a.id='${app}';rollback;`)[0];
 assert.ok(current);assert.equal(current.state,'approved');assert.equal(current.audience,mail.clientId);
 assert.equal(current.issuer,`https://api.workos.com/user_management/${mail.clientId}`);assert.match(String(current.subject),/^user_[A-Za-z0-9]+$/);
 const r=await fetch(`https://api.workos.com/user_management/users/${current.subject}`,{headers:{authorization:`Bearer ${mail.workosKey}`},redirect:'error',signal:AbortSignal.timeout(10000)});
 assert.equal(r.status,200);const user=record(await r.json());assert.equal(user.id,current.subject);assert.equal(user.email_verified,true);assert.equal(user.email,mail.allowedRecipient);
 const capacity=record(JSON.parse(await readFile(`${root}/capacity.json`,'utf8')));assert.ok(Date.now()-Date.parse(String(capacity.at))<3600000,'Capacity review expired');
 await save('test-email-started',{at:new Date().toISOString(),application:app,revision:current.revision,recipient:mail.allowedRecipient,maximumEmails:1});
 const result=query(`begin;set local lock_timeout='2s';set local statement_timeout='5s';
 do $$begin
  if exists(select 1 from business_private.email_outbox) then raise exception 'Existing mail requires reconciliation';end if;
  if not exists(select 1 from business_private.applications where id='${app}' and state='approved' and revision=${Number(current.revision)}) then raise exception 'Approval changed';end if;
  if exists(select 1 from business_private.email_settings where day_used<>0 or month_used<>0 or capture_enabled or sending_enabled) then raise exception 'Mail budget already used';end if;
 end$$;
 update business_private.email_settings set sending_enabled=true,capture_enabled=false,capacity_verified_until=clock_timestamp()+interval '1 hour',daily_limit=1,monthly_limit=1 where singleton;
 update business_private.email_sender_settings set enabled=true where singleton;
 insert into business_private.email_outbox(application_id,applicant_id,revision,kind,occurred_at)
 select a.id,a.applicant_id,a.revision,'approve',h.occurred_at from business_private.applications a
 join business_private.history h on h.application_id=a.id and h.revision=a.revision and h.action='approve'
 where a.id='${app}' and a.state='approved' and h.occurred_at>clock_timestamp()-interval '24 hours';
 do $$begin if (select count(*) from business_private.email_outbox)<>1 then raise exception 'Expected one exact approval job';end if;end$$;
 select id,status,wake_request_id,wake_failed from business_private.email_outbox where application_id='${app}';commit;`);
 await save('test-email-queued',{at:new Date().toISOString(),result});console.log(JSON.stringify({queued:result,notYetDeliveryConfirmed:true}));
} else if(mode==='check') {
 const result=query(`begin read only;set local statement_timeout='3s';select q.id,q.status,q.provider_id,q.dispatch_authorized,q.wake_failed,
  (select status_code from net._http_response where id=q.wake_request_id) wake_status,
  (select timed_out from net._http_response where id=q.wake_request_id) wake_timeout
 from business_private.email_outbox q where application_id='${app}';rollback;`);
 await save(`test-email-check-${Date.now()}`,{at:new Date().toISOString(),result});console.log(JSON.stringify(result));
} else {
 const result=query(`begin;set local lock_timeout='2s';set local statement_timeout='3s';
 update business_private.email_settings set sending_enabled=false,capture_enabled=false where singleton;
 update business_private.email_sender_settings set enabled=false where singleton;
 select status,count(*) from business_private.email_outbox group by status;commit;`);
 await save('test-email-stopped',{at:new Date().toISOString(),result});console.log('Acceptance sending stopped; exact outcome and consumed budget retained.');
}
