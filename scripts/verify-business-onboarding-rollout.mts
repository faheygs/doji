// Read-only final deployment/isolation check; does not exercise authenticated writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {cli,hash} from './prepare-safety-launch.mts';
import {database,functions,secrets,pages,health} from './business-disabled-release-reads.mts';
import {evidenceRecord as record,evidenceArray as array,evidenceRows as rows} from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011';
const b=record(JSON.parse(await readFile(`${root}/baseline.json`,'utf8'))),d=database();
for(const k of ['contracts','policies'])assert.equal(d[k],record(b.database)[k]);
assert.equal(d.overdue_sample,0);
const p=await pages();for(const name of ['doji-admin','doji-site'])assert.deepEqual(p[name],record(b.pages)[name]);
const all=functions();
for(const old of array(b.functions).filter(f=>f.slug!=='business-portal-v2')) {
 const f=all.find(f=>f.id===old.id);assert.ok(f);assert.equal(f.ezbr_sha256,old.ezbr_sha256);assert.equal(f.verify_jwt,old.verify_jwt);assert.equal(f.status,old.status);
}
const s=secrets();for(const old of array(b.secrets).filter(s=>s.name!=='BUSINESS_V2_CONFIG'))assert.equal(s.find(s=>s.name===old.name)?.value,old.value);
const raw=await readFile('.artifacts/business-onboarding-release-20261011/runtime-after.json','utf8');
assert.equal(s.find(s=>s.name==='BUSINESS_V2_CONFIG')?.value,hash(raw));const cfg=record(JSON.parse(raw));
assert.equal(cfg.signupEnabled,false);assert.equal(record(cfg.ownedAuth).acceptanceOnly,true);assert.equal(cfg.setupEnabled,true);
const q=rows(cli(['db','query',`begin read only;set local statement_timeout='3s';
 select (select enabled from business_private.setup_settings where singleton) setup,
 e.sending_enabled,e.capture_enabled,e.day_used,e.month_used,s.enabled wakeup,
 q.status,q.provider_id from business_private.email_settings e cross join business_private.email_sender_settings s
 cross join business_private.email_outbox q where q.id='be89b5ae-cd7a-4915-bae1-bc7fd4801cfc';rollback;`,
 '--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
assert.equal(q.length,1);assert.equal(q[0]!.setup,true);
for(const k of ['sending_enabled','capture_enabled','wakeup'])assert.equal(q[0]![k],false);
assert.equal(q[0]!.day_used,1);assert.equal(q[0]!.month_used,1);assert.equal(q[0]!.status,'accepted');
assert.equal(q[0]!.provider_id,'01a12e25-cbcc-7501-9768-7095280afdf2');
for(const path of ['/api/session','/api/setup','/api/workspace']) {
 const r=await fetch('https://business.dojipro.com'+path,{headers:{origin:'https://business.dojipro.com'},signal:AbortSignal.timeout(10000)});
 assert.equal(r.status,401,path);await r.body?.cancel();
}
await writeFile(`${root}/final-boundaries-${Date.now()}.json`,JSON.stringify({at:new Date().toISOString(),memberContractsUnchanged:true,memberPoliciesUnchanged:true,unrelatedFunctionsAndSecretsUnchanged:true,adminAndWebsiteUnchanged:true,gatesAndEmail:q,health:await health(),providerDashboardDelivery:'Delivered',hostedSignedInAcceptance:'pending owner login'},null,2),{flag:'wx'});
console.log('Final isolation/auth checks pass; setup enabled, one accepted test email, all further mail gates OFF. Hosted signed-in acceptance still requires owner login.');
