// Owner-approved removal of the existing test-account access deadline only.
// No provider mutation, email, account creation or reset of counters.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import type * as Pg from 'pg';
import { cli, cf, hash, inventory, account } from './prepare-safety-launch.mts';
import { database, functions, secrets, pages, health } from './business-disabled-release-reads.mts';
import { evidenceRecord as record, evidenceRows as rows } from './release-evidence.mts';
const root='test-results/business-existing-test-access-20261011';
const prior='test-results/business-password-release-20261011/site';
const ns='react-business/owned-20261010';
const origin='https://business.dojipro.com';
const mode=process.argv[2];
assert.equal(process.argv.length,3);
assert.ok(['prepare','database','database-verify','pages','verify'].includes(mode || ''));
const read=async(p:string)=>record(JSON.parse(await readFile(p,'utf8')));
const save=(name:string,value:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
const query=(sql:string)=>rows(cli(['db','query',sql,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
const state=()=>record(query(`begin read only;set local statement_timeout='4s';
 select jsonb_build_object(
 'acceptance',(select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton),
 'mail',(select to_jsonb(s) from business_session_private.owned_auth_mail_settings s where singleton),
 'settings',(select to_jsonb(s) from business_session_private.settings s where singleton),
 'enrollment',(select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton),
 'guard',(select to_jsonb(s) from business_session_private.owned_auth_settings s where singleton),
 'grants',(select proacl::text from pg_proc where oid='business_session_private.admit_owned_acceptance_v1(text,text,text,text,text)'::regprocedure)
 ) state;rollback;`)[0]?.state);
const json=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
async function boundaries(changedDb:boolean, changedPages:boolean) {
 const b=await read(`${root}/baseline.json`),d=database();
 assert.equal(d.event_window,false,'Protected challenge window');assert.equal(d.overdue_sample,0,'Delivery backlog');
 for(const k of ['contracts','policies','roles']) assert.equal(d[k],record(b.database)[k],k);
 assert.deepEqual(functions(),b.functions,'Edge drift');assert.deepEqual(secrets(),b.secrets,'Secret drift');
 const p=await pages();
 for(const name of changedPages?['doji-admin','doji-site']:['doji-admin','doji-business','doji-site']) assert.deepEqual(p[name],record(b.pages)[name]);
 const expected=structuredClone(record(b.state));
 if(changedDb) expected.acceptance={...record(expected.acceptance),existing_account_access:true};
 assert.deepEqual(state(),expected,'Business settings or reservation drift');
 assert.equal(hash(JSON.stringify(record(await cf('/pages/projects/doji-business')).deployment_configs)),b.pagesConfigHash);
}
if(mode==='prepare') {
 await assert.rejects(access(`${root}/baseline.json`));await mkdir(root,{recursive:true});
 const d=database();assert.equal(d.event_window,false);assert.equal(d.overdue_sample,0);
 const s=state(),a=record(s.acceptance);assert.equal(a.enabled,true);assert.ok(a.reserved_at);assert.ok(!Object.hasOwn(a,'existing_account_access'));
 assert.ok(Date.parse(String(a.expires_at))<Date.now());
 const secretList=secrets();
 const raw=(await readFile('.artifacts/business-recovery-acceptance-20261011/password-release-runtime.env','utf8')).trim().slice('BUSINESS_V2_CONFIG='.length);
 assert.equal(hash(raw),secretList.find(v=>v.name==='BUSINESS_V2_CONFIG')?.value);
 const cfg=record(JSON.parse(raw));assert.equal(cfg.signupEnabled,false);assert.equal(record(cfg.ownedAuth).acceptanceOnly,true);
 const email=(await readFile('.artifacts/business-recovery-acceptance-20261011/acceptance-email.txt','utf8')).trim();
 const url=new URL('https://api.workos.com/user_management/users');url.searchParams.set('email',email);url.searchParams.set('limit','2');
 const r=await fetch(url,{headers:{authorization:`Bearer ${cfg.apiKey}`},signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);const result=record(await r.json());assert.ok(Array.isArray(result.data));assert.equal(result.data.length,1,'Expected existing test identity');
 assert.equal(record(result.data[0]).email_verified,true,'Expected verified identity');assert.equal(record(result.list_metadata).after,null);
 const p=await pages();assert.equal(record(p['doji-business']).id,'0b207767-a256-4b39-9a36-fb4ac2bfbcbb');
 const project=record(await cf('/pages/projects/doji-business'));
 await save('baseline',{at:new Date().toISOString(),database:d,state:s,functions:functions(),secrets:secretList,pages:p,pagesConfigHash:hash(JSON.stringify(project.deployment_configs)),providerMatches:1});
 const ddl=String(query("select pg_get_functiondef('business_session_private.admit_owned_acceptance_v1(text,text,text,text,text)'::regprocedure) source")[0]?.source);
 await writeFile(`${root}/admission-before.sql`,ddl,{flag:'wx'});
 await cp(prior,`${root}/site`,{recursive:true,errorOnExist:true});
 execFileSync(process.execPath,[resolve('web/node_modules/vite/bin/vite.js'),'build','--config','vite.config.ts'],{cwd:resolve('web/apps/business'),env:{...process.env,DOJI_BUSINESS_ASSET_BASE:`/${ns}/`},stdio:'pipe',timeout:180000});
 await cp('web/apps/business/dist/assets',`${root}/site/${ns}/assets`,{recursive:true});
 const html=(await readFile('web/apps/business/dist/index.html','utf8')).replace('Doji for Business · Migration preview','Doji for Business').replace('<head>',`<head><script src="/${ns}/release-config.js"></script><script src="/business-portal/config.js"></script><link rel="icon" href="/doji-icon.png">`);
 for(const path of ['index.html','business-portal/access/index.html','business-portal/application/index.html']) await writeFile(`${root}/site/${path}`,html);
 const old=await readFile(`${prior}/${ns}/release-config.js`,'utf8');
 const config=record(JSON.parse(old.match(/Object\.freeze\((.+)\);/)![1]!));
 config.acceptanceExistingAccount=true;
 await writeFile(`${root}/site/${ns}/release-config.js`,`window.DOJI_REACT_BUSINESS_CONFIG = Object.freeze(${JSON.stringify(config)});\n`);
 for(const path of ['_worker.js','_headers','_routes.json','_redirects','business-portal/config.js','business-terms/index.html','business-privacy/index.html']) assert.equal(hash(await readFile(`${root}/site/${path}`)),hash(await readFile(`${prior}/${path}`)),path);
 await save('prepared',{site:await inventory(`${root}/site`),sql:hash(await readFile('docs/drafts/business_owned_existing_test_access_v1.sql'))});
 console.log('Prepared exact test-account-only release; provider identity verified; no live mutations.');
} else {
 const b=await read(`${root}/baseline.json`),prepared=await read(`${root}/prepared.json`);
 assert.deepEqual(await inventory(`${root}/site`),prepared.site);
 assert.equal(hash(await readFile('docs/drafts/business_owned_existing_test_access_v1.sql')),prepared.sql);
 if(mode==='database' || mode==='database-verify') {
  if(mode==='database') {
  await boundaries(false,false);
  await save('database-started',{at:new Date().toISOString()});
  const migration=(await readFile('docs/drafts/business_owned_existing_test_access_v1.sql','utf8')).replace(/^begin;|^commit;/gm,'');
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';
   do $$begin
    if not pg_try_advisory_xact_lock(hashtextextended('doji-business-owned-auth-v1',0)) then raise exception 'Concurrent business release';end if;
    if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1) or exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Protected member window';end if;
    if (select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton) is distinct from ${json(record(b.state).acceptance)} then raise exception 'Acceptance drift';end if;
   end$$;
   ${migration}
   update business_session_private.owned_auth_acceptance set existing_account_access=true where singleton;
   commit;`);
  }
  await boundaries(true,false);
  // Exercise real server-role admission in a rollback: no budget/ticket retained.
  const a=record(record(b.state).acceptance);
  const raw=(await readFile('.artifacts/business-recovery-acceptance-20261011/password-release-runtime.env','utf8')).trim().slice('BUSINESS_V2_CONFIG='.length);
  assert.equal(hash(raw),secrets().find(v=>v.name==='BUSINESS_V2_CONFIG')?.value);
  const db=record(record(JSON.parse(raw)).database);
  const pg:typeof Pg=createRequire(import.meta.url)('../infra/portal-identity-candidate/node_modules/pg/lib/index.js');
  const client=new pg.Client({host:String(db.host),port:Number(db.port),user:String(db.username),password:String(db.password),database:String(db.database),ssl:{rejectUnauthorized:true,ca:String(db.ca)},connectionTimeoutMillis:5000,statement_timeout:4000});
  let check:unknown;
  try {
   await client.connect();await client.query('begin;set local role doji_business_session');
   check=(await client.query(`select
    business_session_private.admit_owned_acceptance_v1($1,'signin',repeat('1',64),$2,repeat('2',64))->>'state' allowed,
    business_session_private.admit_owned_acceptance_v1($1,'signin',repeat('3',64),repeat('4',64),repeat('2',64))->>'state' other,
    business_session_private.admit_owned_acceptance_v1($1,'register',repeat('5',64),$2,repeat('2',64))->>'state' signup`,[a.scope_hash,a.identity_hmac])).rows[0];
  } catch {throw Error('Restricted-connection admission check failed; no secret output');}
  finally {await client.query('rollback').catch(()=>{});await client.end();}
  assert.deepEqual(check,{allowed:'allowed',other:'denied',signup:'denied'});
  await save('database-verified',{at:new Date().toISOString(),check});
  console.log('Persistent exact-account admission enabled; other identities and signup denied; member fingerprints unchanged.');
 } else if(mode==='pages') {
  await read(`${root}/database-verified.json`);await boundaries(true,false);
  await save('pages-started',{at:new Date().toISOString(),rollback:record(record(b.pages)['doji-business']).id});
  try {execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',resolve(root,'site'),'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Keep approved existing business test account accessible'],{env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account},stdio:'pipe',timeout:180000});} catch {throw Error('Pages outcome uncertain; inspect before retry');}
  await boundaries(true,true);await save('pages-deployed',{at:new Date().toISOString(),deployment:(await pages())['doji-business']});
  console.log('Business sign-in frontend deployed; Edge runtime and secrets unchanged.');
 } else {
  await read(`${root}/pages-deployed.json`);await boundaries(true,true);
  for(const path of ['business-portal/access/index.html',`${ns}/release-config.js`]) {
   const url=path.endsWith('index.html')?origin+'/business-portal/access/':origin+'/'+path;
   const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
   assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(await readFile(`${root}/site/${path}`)),path);
  }
  await save('verified',{at:new Date().toISOString(),health:await health(),memberContractsUnchanged:true,emailsSent:0,accountsCreated:0});
  console.log('Hosted release verified; saved account/reservation and independent email gates preserved.');
 }
}
