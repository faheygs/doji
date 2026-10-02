import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {root,ref,cli,save} from './prepare-safety-launch.mjs';
const json=async n=>JSON.parse(await readFile(`${root}/${n}`,'utf8'));
const query=sql=>cli(['db','query',sql,'--linked','--output-format','json']);
const mode=process.argv[2];assert.ok(['cleanup','processing','public'].includes(mode));assert.equal(process.argv[3],'--activate-reviewed-stage');
await json('disabled-release-verified.json');
const functions=()=>cli(['functions','list','--project-ref',ref,'--output-format','json']).functions;
const original=await json('functions-before-edge.json');
const expected=await Promise.all(original.map(async f=>['delete-account','run-data-maintenance'].includes(f.slug)?(await json(`edge-${f.slug}-deployed.json`)).function:f));
for(const slug of ['safety-removal','moderation-media'])expected.push((await json(`edge-${slug}-deployed.json`)).function);
const current=functions();
const activationExpected=mode==='cleanup'?expected:(await json(mode==='processing'?'cleanup-activated.json':'processing-activated.json')).functions;
assert.deepEqual(current.sort((a,b)=>a.slug.localeCompare(b.slug)),activationExpected.sort((a,b)=>a.slug.localeCompare(b.slug)),'Unexpected function changes before activation');
if(mode==='cleanup'){
 const check=query("begin read only;select (select count(*) from public.moderation_media_objects) holds,(select tgenabled from pg_trigger where tgname='capture_decision_media' and tgrelid='public.moderation_decisions'::regclass) capture;rollback;").rows[0];
 assert.equal(check.holds,0);assert.equal(check.capture,'D');
 await save('cleanup-activation-started.json',{at:new Date().toISOString()});
 cli(['secrets','set','MODERATION_MEDIA_CLEANUP_ENABLED=true','--project-ref',ref],false);
 const after=functions();for(const f of after){const prior=current.find(v=>v.slug===f.slug);assert.deepEqual({...f,version:prior.version},prior);assert.equal(f.version,prior.version+1);}
 await save('cleanup-activated.json',{at:new Date().toISOString(),minimumDrainSeconds:420,captureEnabled:false,publicEnabled:false,functions:after});
 console.log('Guarded cleanup enabled; media capture remains disabled during the seven-minute old-invocation drain.');
}
if(mode==='public'){
 await json('admin-pages-verified.json');await json('hosted-storage-verified.json');
 assert.ok((await json('hosted-storage-cleanup.json')).cleanup.every(v=>v.removed));
 const prior=await json('processing-activated.json');assert.equal(prior.endpoints['safety-removal-alerts'].status,200);
 const check=cli(['db','query','--linked','--file','scripts/verify-safety-live.sql','--output-format','json']).rows[0].checks;
 assert.equal(check.capture,'O');assert.equal(check.media_config,true);assert.equal(check.alert_config,true);assert.equal(check.lock_waits,0);assert.equal(check.active_events,0);
 await save('public-activation-started.json',{at:new Date().toISOString(),before:check});
 cli(['secrets','set','SAFETY_REMOVAL_ENABLED=true','--project-ref',ref],false);
 const after=functions();for(const f of after){const prior=current.find(v=>v.slug===f.slug);assert.deepEqual({...f,version:prior.version},prior);assert.equal(f.version,prior.version+1);}
 const url=`https://${ref}.supabase.co/functions/v1/safety-removal`;
 const denied=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000)});assert.equal(denied.status,403);await denied.body?.cancel();
 const preflight=await fetch(url,{method:'OPTIONS',headers:{origin:'https://dojipro.com','access-control-request-method':'POST','access-control-request-headers':'content-type'},signal:AbortSignal.timeout(15000)});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://dojipro.com');
 const invalid=await fetch(url,{method:'POST',headers:{origin:'https://dojipro.com','content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});assert.equal(invalid.status,400);await invalid.body?.cancel();
 await save('public-activated.json',{at:new Date().toISOString(),functions:after,originGuard:403,corsPreflight:204,invalidForm:400,publicEnabled:true});
 console.log('Public intake activated with canonical-origin, preflight and invalid-request checks; no case created by these checks.');
}
if(mode==='processing'){
 const cleanup=await json('cleanup-activated.json');
 assert.ok(Date.now()-Date.parse(cleanup.at)>=cleanup.minimumDrainSeconds*1000,'Older cleanup invocations must drain first');
 const before=query(`begin read only;select jsonb_build_object('active',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),'cases',(select count(*) from public.safety_removal_cases),'holds',(select count(*) from public.moderation_media_objects),'capture',(select tgenabled from pg_trigger where tgname='capture_decision_media' and tgrelid='public.moderation_decisions'::regclass),'bucket_private',(select not public from storage.buckets where id='moderation-evidence'),'jobs',(select count(*) from cron.job where jobname in('safety-removal-alert-recovery-v1','moderation-media-recovery-v1')),'configs',(select count(*) from (select enabled from public.moderation_media_delivery_config union all select enabled from public.safety_removal_delivery_config)v where enabled)) checks;rollback;`).rows[0].checks;
 assert.deepEqual(before,{active:0,cases:0,holds:0,capture:'D',bucket_private:true,jobs:0,configs:0});
 await save('processing-activation-started.json',{at:new Date().toISOString(),before});
 cli(['secrets','set','MODERATION_MEDIA_ENABLED=true','SAFETY_REMOVAL_ALERTS_ENABLED=true','--project-ref',ref],false);
 const after=functions();for(const f of after){const prior=current.find(v=>v.slug===f.slug);assert.deepEqual({...f,version:prior.version},prior);assert.equal(f.version,prior.version+1);}
 // Qualify dedicated authenticated endpoints with empty queues before capture.
 const credentials=query("begin read only;select name,decrypted_secret from vault.decrypted_secrets where name in('moderation_media_dispatch_secret','safety_removal_dispatch_secret');rollback;").rows;
 const endpoints={};
 for(const [slug,name] of [['moderation-media','moderation_media_dispatch_secret'],['safety-removal-alerts','safety_removal_dispatch_secret']]){
  const url=`https://${ref}.supabase.co/functions/v1/${slug}`;
  const denied=await fetch(url,{method:'POST',signal:AbortSignal.timeout(15000)});assert.equal(denied.status,401);await denied.body?.cancel();
  const secret=credentials.find(c=>c.name===name)?.decrypted_secret;assert.ok(secret?.length>=32);
  const response=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${secret}`,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200,`${slug} empty-queue authentication`);const body=await response.json();assert.equal(body.claimed,0);endpoints[slug]={status:200,claimed:0};
 }
 const result=query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';select pg_advisory_xact_lock(hashtextextended('doji:safety-launch-v1',0));do $$begin
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()) then raise exception 'Active participation window';end if;
 if exists(select 1 from cron.job where jobname in('safety-removal-alert-recovery-v1','moderation-media-recovery-v1')) then raise exception 'Existing recovery job';end if;
 if (select count(*) from vault.secrets where name in('safety_removal_dispatch_secret','moderation_media_dispatch_secret'))<>2 then raise exception 'Missing dispatch credentials';end if;
 end$$;
 update public.moderation_media_delivery_config set enabled=true where singleton and not enabled;
 update public.safety_removal_delivery_config set enabled=true where singleton and not enabled;
 alter table public.moderation_decisions enable trigger capture_decision_media;
 select cron.schedule('safety-removal-alert-recovery-v1','*/5 * * * *','select public.wake_safety_removal_alerts_v1()');
 select cron.schedule('moderation-media-recovery-v1','*/5 * * * *','select public.wake_moderation_media_v1()');commit;`);
 const jobs=query("begin read only;select jobid,jobname,schedule,command,active from cron.job where jobname in('safety-removal-alert-recovery-v1','moderation-media-recovery-v1');rollback;").rows;assert.equal(jobs.length,2);
 const checks=cli(['db','query','--linked','--file','scripts/portal-triage-member-canary.sql','--output-format','json']);
 await save('processing-activated.json',{at:new Date().toISOString(),functions:after,endpoints,jobs,memberChecks:checks,publicEnabled:false});
 console.log('Dedicated processing, capture, and two idle-safe recovery jobs activated; member canaries passed; public intake still disabled.');
}
