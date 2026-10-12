// Owner-approved gated onboarding rollout. Never enables public registration,
// billing, campaigns, automatic email, or changes member/employee deployments.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cli, cf, ref, hash, inventory } from './prepare-safety-launch.mts';
import { database, functions, secrets, pages, health } from './business-disabled-release-reads.mts';
import { evidenceRecord as record, evidenceRows as rows } from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011';
const secure='.artifacts/business-onboarding-release-20261011';
const previous='test-results/business-existing-test-access-20261011/site';
const mode=process.argv[2];
assert.ok(['prepare','rehearse','database','verify-database'].includes(mode || ''));
const query=(sql:string)=>rows(cli(['db','query',sql,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
const read=async(p:string)=>record(JSON.parse(await readFile(p,'utf8')));
const save=(name:string,value:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
const drafts=['business_setup_v1.sql','business_setup_privacy_v1.sql','business_email_outbox_v1.sql','business_email_dispatch_v1.sql'];
const memberState=`jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace)),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c where c.relnamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace)),
 'realms',(select jsonb_agg(to_jsonb(r) order by realm) from portal_identity_private.realms r),
 'business_settings',(select to_jsonb(s) from business_private.settings s where singleton),
 'session_settings',(select to_jsonb(s) from business_session_private.settings s where singleton),
 'acceptance',(select to_jsonb(s) from business_session_private.owned_auth_acceptance s where singleton),
 'enrollment',(select to_jsonb(s) from portal_identity_private.business_enrollment_settings s where singleton))`;
const guard=`do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-business-onboarding-v1',0)) then raise exception 'Concurrent release';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1) or exists(select 1 from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds' limit 1) then raise exception 'Protected member window';end if;
end$$;`;
async function unchanged() {
 const b=await read(`${root}/baseline.json`),d=database();
 assert.equal(d.event_window,false);assert.equal(d.overdue_sample,0);
 for(const key of ['contracts','policies']) assert.equal(d[key],record(b.database)[key],key);
 assert.deepEqual(functions(),b.functions);assert.deepEqual(secrets(),b.secrets);assert.deepEqual(await pages(),b.pages);
 const actual=record(query(`begin read only;set local statement_timeout='5s';select ${memberState} state;rollback;`)[0]?.state);
 assert.deepEqual(actual,b.memberState,'Member, realm or admission state changed');
}
if(mode==='prepare') {
 await assert.rejects(access(`${root}/baseline.json`));await mkdir(root,{recursive:true});
 execFileSync('git',['check-ignore',`${secure}/runtime-before.json`],{stdio:'pipe'});
 await mkdir(secure,{recursive:false});
 const owner=execFileSync('whoami',[],{encoding:'utf8'}).trim();
 execFileSync('icacls',[secure,'/inheritance:r','/grant:r',`${owner}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'pipe'});
 const raw=(await readFile('.artifacts/business-recovery-acceptance-20261011/password-release-runtime.env','utf8')).trim().slice('BUSINESS_V2_CONFIG='.length);
 const secretList=secrets();assert.equal(hash(raw),secretList.find(s=>s.name==='BUSINESS_V2_CONFIG')?.value);
 const config=record(JSON.parse(raw));assert.equal(config.signupEnabled,false);assert.equal(record(config.ownedAuth).acceptanceOnly,true);
 await writeFile(`${secure}/runtime-before.json`,raw,{flag:'wx'});
 const project=record(await cf('/pages/projects/doji-business'));
 await writeFile(`${secure}/pages-before.json`,JSON.stringify(project),{flag:'wx'});
 const d=database();assert.equal(d.event_window,false);assert.equal(d.overdue_sample,0);
 const p=await pages();assert.equal(record(p['doji-business']).id,'4803a3ed-269c-414f-96ec-f504050ddfaf');
 const old=await read('test-results/business-existing-test-access-20261011/prepared.json');
 assert.deepEqual(await inventory(previous),old.site);
 const state=record(query(`begin read only;set local statement_timeout='5s';select ${memberState} state;rollback;`)[0]?.state);
 const installed=query(`begin read only;select to_regclass('business_private.setup_settings')::text setup,to_regclass('business_private.email_settings')::text mail;rollback;`)[0];
 assert.deepEqual(installed,{setup:null,mail:null});
 await save('baseline',{at:new Date().toISOString(),database:d,pages:p,functions:functions(),secrets:secretList,memberState:state,health:await health()});
 await cp(previous,`${root}/pages-before`,{recursive:true,errorOnExist:true});
 await mkdir(`${root}/edge-before`);
 cli(['functions','download','business-portal-v2','--project-ref',ref,'--use-api','--workdir',resolve(root,'edge-before')],false);
 await save('rollback-manifest',{pages:await inventory(`${root}/pages-before`),edge:await inventory(`${root}/edge-before`)});
 let body='';const sourceHashes:Record<string,string>={};
 for(const name of drafts) {
  const sql=(await readFile(`docs/drafts/${name}`,'utf8')).replaceAll('\r\n','\n');
  sourceHashes[name]=hash(sql);body+=sql.replace(/^begin;|^commit;/gm,'')+'\n';
 }
 const expected=JSON.stringify(state).replaceAll("'","''");
 const sql=`begin;set local lock_timeout='2s';set local statement_timeout='8s';${guard}
 do $$begin if ${memberState} is distinct from '${expected}'::jsonb then raise exception 'Release baseline drift';end if;end$$;
 create temp table onboarding_functions_before as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc where prokind='f';
 create temp table onboarding_roles_before as select oid,rolname,rolcanlogin,rolsuper,rolinherit,rolbypassrls from pg_roles;
 ${body}
 do $$begin
 if exists(select 1 from onboarding_functions_before b left join pg_proc p on p.oid=b.oid where p.oid is null or b.definition is distinct from pg_get_functiondef(p.oid) or b.proacl is distinct from p.proacl) then raise exception 'Existing function changed';end if;
 if exists(select 1 from onboarding_roles_before b left join pg_roles r on r.oid=b.oid where r.oid is null or (b.rolcanlogin,b.rolsuper,b.rolinherit,b.rolbypassrls) is distinct from (r.rolcanlogin,r.rolsuper,r.rolinherit,r.rolbypassrls)) then raise exception 'Existing role changed';end if;
 if ${memberState} is distinct from '${expected}'::jsonb then raise exception 'Member/admission state changed';end if;
 if exists(select 1 from business_private.setup_settings where enabled) or exists(select 1 from business_private.email_settings where capture_enabled or sending_enabled) then raise exception 'Expected closed gates';end if;
 end$$;
 commit;`;
 await writeFile(`${root}/install.sql`,sql,{flag:'wx'});
 await writeFile(`${root}/rehearse.sql`,sql.replace(/commit;$/,'rollback;'),{flag:'wx'});
 await save('prepared',{sourceHashes,install:hash(sql),rehearse:hash(await readFile(`${root}/rehearse.sql`))});
 console.log('Rollback packages/config preserved; private onboarding installation prepared with all new gates disabled.');
} else {
 const prepared=await read(`${root}/prepared.json`);
 for(const [file,expected] of Object.entries(record(prepared.sourceHashes))) assert.equal(hash((await readFile(`docs/drafts/${file}`,'utf8')).replaceAll('\r\n','\n')),expected,file);
 await unchanged();
 if(mode==='rehearse'||mode==='database') {
  if(mode==='database') await read(`${root}/rehearsed.json`);
  const file=mode==='rehearse'?'rehearse':'install';assert.equal(hash(await readFile(`${root}/${file}.sql`)),prepared[file]);
  await save(`${mode}-started`,{at:new Date().toISOString()});
  cli(['db','query','--file',resolve(root,`${file}.sql`),'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']);
  await unchanged();
  await save(mode==='rehearse'?'rehearsed':'database-installed',{at:new Date().toISOString(),hash:prepared[file]});
  console.log(mode==='rehearse'?'Production transaction rehearsal rolled back; member contracts unchanged.':'Private onboarding/privacy/mail contracts installed DISABLED; existing member and portal contracts unchanged.');
 } else {
  const state=query(`begin read only;select (select enabled from business_private.setup_settings where singleton) setup_enabled,(select capture_enabled or sending_enabled from business_private.email_settings where singleton) mail_enabled,(select count(*) from business_private.brand_profiles) profiles,(select count(*) from business_private.email_outbox) mail_jobs;rollback;`)[0];
  assert.deepEqual(state,{setup_enabled:false,mail_enabled:false,profiles:0,mail_jobs:0});
  await save('database-verified',{at:new Date().toISOString(),state});console.log(JSON.stringify(state));
 }
}
