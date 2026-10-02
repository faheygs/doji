// Exact owner-approved business-only release. Never pushes the dirty migration tree.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {cli,cf,hash,ref} from './prepare-safety-launch.mjs';
export const folder='test-results/business-release-20260930';
const sources=['business_applications_v1.sql','business_auth_v1.sql','business_public_admission_v1.sql','business_signup_legal_v1.sql','business_privacy_v1.sql'];
const mode=process.argv[2];
assert.ok(['capture','assemble','rehearse','install-disabled','verify'].includes(mode));
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),ref);
await mkdir(folder,{recursive:true});
const save=(name,value)=>writeFile(`${folder}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
const read=name=>readFile(`${folder}/${name}.json`,'utf8').then(JSON.parse);
const query=q=>cli(['db','query',q,'--linked','--output-format','json']).rows;
const baselineSql=`select jsonb_build_object(
 'business_installed',to_regnamespace('business_private') is not null,
 'role_installed',exists(select 1 from pg_roles where rolname='doji_business'),
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('definition',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','storage')),
 'relations',(select jsonb_object_agg(c.oid::regclass::text,jsonb_build_object('acl',c.relacl::text,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity)) from pg_class c where c.relnamespace in('public'::regnamespace,'storage'::regnamespace) and c.relkind in('r','p','v','m')),
 'auth_triggers',(select jsonb_object_agg(t.tgname,md5(pg_get_triggerdef(t.oid))) from pg_trigger t where tgrelid='auth.users'::regclass and not tgisinternal),
 'jobs',(select jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'schedule',schedule,'active',active,'command',md5(command)) order by jobid) from cron.job),
 'release_policy',(select jsonb_agg(to_jsonb(p) order by platform) from public.mobile_release_policy p),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
) checks;`;
const snapshot=()=>query(`begin read only; set local statement_timeout='8s'; ${baselineSql} rollback;`)[0].checks;
const compare=(before,after)=>{
 for(const [key,value] of Object.entries(before.functions))assert.deepEqual(after.functions[key],value,`Existing function changed: ${key}`);
 for(const [key,value] of Object.entries(before.relations))assert.deepEqual(after.relations[key],value,`Existing relation changed: ${key}`);
 for(const [key,value] of Object.entries(before.auth_triggers))assert.equal(after.auth_triggers[key],value,`Existing Auth trigger changed: ${key}`);
 for(const key of ['policies','jobs','release_policy'])assert.deepEqual(after[key],before[key],key);
};
if(mode==='capture'){
 const database=snapshot();assert.equal(database.business_installed,false);assert.equal(database.role_installed,false);
 assert.equal(database.active_events,0);assert.equal(database.lock_waits,0);
 const pages={};for(const name of ['doji-business','doji-admin','doji-site']){const p=await cf(`/pages/projects/${name}`);pages[name]={deployment:p.canonical_deployment.id,url:p.canonical_deployment.url,domains:p.domains,branch:p.production_branch};}
 await save('baseline',{at:new Date().toISOString(),database,pages,functions:cli(['functions','list','--project-ref',ref,'--output-format','json']).functions,secrets:cli(['secrets','list','--project-ref',ref,'--output-format','json'])});
 console.log('Saved fresh existing-contract hashes, provider deployments and secret digests; no credentials or member content.');
} else if(mode==='assemble'){
 const contents=await Promise.all(sources.map(name=>readFile(`docs/drafts/${name}`,'utf8')));
 const body=contents.map(source=>source.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')).join('\n');
 const sql=`begin;\nset local lock_timeout='2s';set local statement_timeout='8s';\nselect pg_advisory_xact_lock(hashtextextended('doji-business-release-20260930',0));\ndo $$begin if to_regnamespace('business_private') is not null or exists(select 1 from pg_roles where rolname='doji_business') then raise exception 'Business release already installed or conflicting'; end if; end$$;\ncreate temp table business_prior_functions on commit drop as select oid,pg_get_functiondef(oid) definition,proacl from pg_proc where pronamespace='public'::regnamespace and prokind='f';\n${body}\ndo $$begin if exists(select 1 from business_prior_functions f left join pg_proc p using(oid) where p.oid is null or f.definition is distinct from pg_get_functiondef(p.oid) or f.proacl is distinct from p.proacl) then raise exception 'Member/staff contract drift'; end if; end$$;\ncommit;\n`;
 await writeFile(`${folder}/install-disabled.sql`,sql,{flag:'wx'});
 await save('candidate',{at:new Date().toISOString(),sources:sources.map((name,i)=>({name,sha256:hash(contents[i])})),sha256:hash(sql),mode:'business-only-disabled',memberChanges:false});
 console.log('Exact additive disabled SQL assembled; no authenticator grant, signup, realtime, jobs or member edits.');
} else if(mode==='rehearse'||mode==='install-disabled'){
 const before=(await read('baseline')).database,candidate=await read('candidate');
 const sql=await readFile(`${folder}/install-disabled.sql`,'utf8');assert.equal(hash(sql),candidate.sha256);
 for(const source of candidate.sources)assert.equal(hash(await readFile(`docs/drafts/${source.name}`)),source.sha256);
 const fresh=snapshot();compare(before,fresh);assert.equal(fresh.business_installed,false);assert.equal(fresh.role_installed,false);assert.equal(fresh.active_events,0);assert.equal(fresh.lock_waits,0);
 if(mode==='install-disabled')assert.equal((await read('rehearsal')).passed,true);
 await save(mode==='rehearse'?`rehearse-started-${Date.now()}`:`${mode}-started`,{at:new Date().toISOString(),sha256:candidate.sha256});
 const filename=`${folder}/${mode==='rehearse'?'rehearsal':'install-disabled'}.sql`;
 if(mode==='rehearse')await writeFile(filename,sql.replace(/commit;\s*$/,'rollback;'));
 cli(['db','query','--file',filename,'--linked','--output-format','json']);
 const after=snapshot();compare(before,after);assert.equal(after.business_installed,mode==='install-disabled');
 await save(mode==='rehearse'?'rehearsal':'installed-disabled',{at:new Date().toISOString(),sha256:candidate.sha256,passed:true,existingContractsUnchanged:true});
 console.log(`${mode} verified. Existing member/staff functions, grants, RLS, schedules and release policies unchanged.`);
} else {
 const before=(await read('baseline')).database,after=snapshot();compare(before,after);
 console.log(JSON.stringify({businessInstalled:after.business_installed,existingContractsUnchanged:true,activeEvents:after.active_events,lockWaits:after.lock_waits}));
}
