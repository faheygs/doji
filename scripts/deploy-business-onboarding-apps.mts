// Explicit phase-by-phase rollout, with immutable artifacts and retaining rollback.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {cli,cf,ref,account,hash,inventory} from './prepare-safety-launch.mts';
import {database,functions,secrets,pages,health} from './business-disabled-release-reads.mts';
import {evidenceRecord as record,evidenceRows as rows,evidenceArray as array} from './release-evidence.mts';
import {createBusinessMailSql,type MailDatabase} from '../infra/business-email/restricted-sql.mts';
const root='test-results/business-onboarding-release-20261011',secure='.artifacts/business-onboarding-release-20261011';
const mode=process.argv[2];
assert.ok(['mail-rehearse','mail-database','mail-connection','configure','edge','pages','enable','verify'].includes(mode||''));
const read=async(p:string)=>record(JSON.parse(await readFile(p,'utf8')));
const save=(n:string,v:unknown)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
const query=(sql:string)=>rows(cli(['db','query',sql,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
const b=await read(`${root}/baseline.json`),a=await read(`${root}/apps.json`);
assert.deepEqual(await inventory(`${root}/site`),a.site);
assert.deepEqual((await inventory(`${root}/edge`)).filter(f=>!f.path.includes('/.temp/')),a.edge);
assert.equal(hash(await readFile(`${secure}/runtime-after.json`)),a.runtimeHash);
assert.equal(hash(await readFile(`${secure}/mail.json`)),a.mailHash);
assert.equal(hash(await readFile(`${secure}/mail-install.sql`)),a.mailInstallHash);
assert.equal(hash(await readFile('supabase/overlays/business_email_hosted_v1.sql')),a.mailSourceHash);
async function boundaries() {
 const d=database();assert.equal(d.event_window,false);assert.equal(d.overdue_sample,0);
 for(const key of ['contracts','policies']) assert.equal(d[key],record(b.database)[key],key);
 const p=await pages();for(const name of ['doji-admin','doji-site'])assert.deepEqual(p[name],record(b.pages)[name]);
 const all=functions();
 for(const old of array(b.functions).filter(f=>f.slug!=='business-portal-v2')) {
  const f=all.find(f=>f.id===old.id);assert.ok(f);
  assert.equal(f.ezbr_sha256,old.ezbr_sha256,`Unrelated code: ${old.slug}`);assert.equal(f.verify_jwt,old.verify_jwt);assert.equal(f.status,old.status);
 }
 const s=secrets();for(const old of array(b.secrets).filter(s=>s.name!=='BUSINESS_V2_CONFIG'))assert.equal(s.find(s=>s.name===old.name)?.value,old.value,`Unrelated secret: ${old.name}`);
 const gate=query(`begin read only;set local statement_timeout='3s';select (select registration_enabled from business_session_private.settings where singleton) registration_gate,(select existing_account_access from business_session_private.owned_auth_acceptance where singleton) existing_access,(select capture_enabled from business_private.email_settings where singleton) automatic_mail;rollback;`)[0];
 // The retained lower-level registration gate is not public admission: owned auth
 // uses the consumed exact-account reservation and runtime signupEnabled=false.
 assert.equal(gate?.registration_gate,record(record(b.memberState).session_settings).registration_enabled);
 assert.equal(gate?.existing_access,true);assert.equal(gate?.automatic_mail,false);
 const runtime=await read(`${secure}/runtime-after.json`);assert.equal(runtime.signupEnabled,false);assert.equal(record(runtime.ownedAuth).acceptanceOnly,true);
}
await boundaries();
if(mode==='mail-rehearse'||mode==='mail-database') {
 if(mode==='mail-database')await access(`${root}/mail-rehearsed.json`);
 const ext=query("begin read only;select extname from pg_extension where extname in ('pg_net','pgcrypto') order by extname;rollback;");
 assert.deepEqual(ext.map(e=>e.extname),['pg_net','pgcrypto']);
 await save(`${mode}-started`,{at:new Date().toISOString()});
 cli(['db','query','--file',resolve(secure,mode==='mail-rehearse'?'mail-rehearse.sql':'mail-install.sql'),'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']);
 await boundaries();await save(mode==='mail-rehearse'?'mail-rehearsed':'mail-installed',{at:new Date().toISOString()});
 console.log(mode==='mail-rehearse'?'Sender SQL and restricted login rehearsal rolled back.':'Hosted sender contracts/login installed; wakeup, capture and sending remain disabled.');
} else if(mode==='mail-connection') {
 await access(`${root}/mail-installed.json`);
 const pg=createRequire(new URL('../infra/portal-identity/package.json',import.meta.url))('pg') as typeof import('pg');
 const mail=await read(`${secure}/mail.json`);
 const sql=createBusinessMailSql(mail.database as MailDatabase,o=>new pg.Client(o));
 assert.equal(await sql('select business_private.claim_application_email($1::uuid,$2::uuid) as result',['11000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002']),null);
 await save('mail-connection-verified',{at:new Date().toISOString(),disabledClaim:null});console.log('Exact restricted sender login and verified TLS connection passed; no job claimed.');
} else if(mode==='configure') {
 await access(`${root}/mail-connection-verified.json`);await access(`${root}/package-tests.json`);
 assert.equal(secrets().find(s=>s.name==='BUSINESS_V2_CONFIG')?.value,hash(await readFile(`${secure}/runtime-before.json`)));
 await save('configure-started',{at:new Date().toISOString()});
 cli(['secrets','set','--env-file',resolve(secure,'release.env'),'--project-ref',ref],false);
 const s=secrets();assert.equal(s.find(s=>s.name==='BUSINESS_V2_CONFIG')?.value,a.runtimeHash);assert.equal(s.find(s=>s.name==='BUSINESS_APPLICATION_MAIL_CONFIG')?.value,a.mailHash);
 await boundaries();await save('configured',{at:new Date().toISOString(),health:await health()});console.log('Business-only configuration installed; private setup and mail gates remain closed.');
} else if(mode==='edge') {
 await access(`${root}/configured.json`);await save('edge-started',{at:new Date().toISOString()});
 for(const slug of ['business-portal-v2','business-application-mail']) {
  cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'edge')],false);
  const folder=`${root}/edge-after/${slug}`;await mkdir(folder,{recursive:true});
  cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(folder)],false);
  const matches=(await inventory(folder)).filter(f=>f.path.endsWith('/index.ts'));assert.equal(matches.length,1);
  assert.equal(hash((await readFile(`${folder}/${matches[0]!.path}`,'utf8')).replaceAll('\r\n','\n')),hash((await readFile(`${root}/edge/supabase/functions/${slug}/index.ts`,'utf8')).replaceAll('\r\n','\n')),slug);
 }
 await boundaries();await save('edge-deployed',{at:new Date().toISOString(),functions:functions(),health:await health()});console.log('Business runtime and isolated mail endpoint deployed; downloaded source hashes match.');
} else if(mode==='pages') {
 await access(`${root}/edge-deployed.json`);
 const project=record(await cf('/pages/projects/doji-business')),before=record(project.deployment_configs),production=record(before.production),env=record(production.env_vars);
 assert.ok(!Object.hasOwn(env,'BUSINESS_SETUP_ENABLED'));
 await save('pages-started',{at:new Date().toISOString(),rollback:record(record(b.pages)['doji-business']).id});
 // API reads deliberately redact secret_text values. Restore only the known
 // business proxy secret from protected hash-verified config; never write blanks.
 assert.deepEqual(Object.entries(env).filter(([,v])=>record(v).type==='secret_text').map(([k])=>k),['BUSINESS_V2_PROXY_KEY']);
 const runtime=await read(`${secure}/runtime-after.json`);assert.match(String(runtime.proxyKey),/^[a-f0-9]{64}$/);
 await cf('/pages/projects/doji-business',{method:'PATCH',body:JSON.stringify({deployment_configs:{production:{env_vars:{...env,BUSINESS_V2_PROXY_KEY:{type:'secret_text',value:runtime.proxyKey},BUSINESS_SETUP_ENABLED:{type:'plain_text',value:'true'}}}}})});
 const actual=record(record(await cf('/pages/projects/doji-business')).deployment_configs);
 assert.deepEqual(actual.preview,before.preview);
 const actualProduction=record(actual.production),actualEnv=record(actualProduction.env_vars);
 const expectedEnv={...env,BUSINESS_SETUP_ENABLED:{type:'plain_text',value:'true'}};
 assert.deepEqual(actualEnv,expectedEnv);assert.deepEqual({...actualProduction,env_vars:env},production);
 try {execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',resolve(root,'site'),'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Approved business branding and MFA onboarding','--no-bundle'],{env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account},stdio:'pipe',timeout:180000});}
 catch {throw Error('Pages result uncertain; inspect live deployment before retry.');}
 await boundaries();await save('pages-deployed',{at:new Date().toISOString(),deployment:(await pages())['doji-business']});console.log('Business Pages deployed; public signup remains closed and setup database gate remains disabled.');
} else if(mode==='enable') {
 await access(`${root}/pages-deployed.json`);await access(`${root}/hosted-package-verified.json`);
 await save('setup-enable-started',{at:new Date().toISOString()});
 query(`begin;set local lock_timeout='2s';set local statement_timeout='5s';
 do $$begin if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1) then raise exception 'Protected window';end if;end$$;
 update business_private.setup_settings set enabled=true where singleton and not enabled;
 commit;`);
 await boundaries();await save('setup-enabled',{at:new Date().toISOString()});console.log('Approved-owner branding/setup enabled. Sending and capture remain disabled pending exact-email acceptance.');
} else {
 const expected=array(a.site);
 for(const path of ['business-portal/setup/index.html','react-business/onboarding-20261011/release-config.js',...expected.filter(f=>String(f.path).startsWith('react-business/onboarding-20261011/assets/')).map(f=>String(f.path))]) {
  const route=path==='business-portal/setup/index.html'?'/business-portal/setup/':'/'+path;
  const r=await fetch('https://business.dojipro.com'+route,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200,route);
  assert.equal(hash(Buffer.from(await r.arrayBuffer())),expected.find(f=>f.path===path)?.sha256,route);
 }
 for(const route of ['/api/setup','/api/workspace']) {
  const r=await fetch('https://business.dojipro.com'+route,{headers:{origin:'https://business.dojipro.com'},signal:AbortSignal.timeout(15000)});await r.body?.cancel();assert.equal(r.status,401,route);
 }
 const bad=await fetch(`https://${ref}.supabase.co/functions/v1/business-application-mail`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(bad.status,401);await bad.body?.cancel();
 await boundaries();await save('hosted-package-verified',{at:new Date().toISOString(),health:await health(),unauthenticatedSetup:401,unsignedMail:401});console.log('Hosted package hashes, unauthorized setup/workspace and signed-mail boundary checks passed.');
}
