// Local artifact assembly only. Deployment requires separate explicit commands.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {dirname} from 'node:path';
import {root,save,hash,inventory} from './prepare-safety-launch.mjs';
import {addReportingNavigation,candidateHeaders,publicPages} from '../website/prepare-safety-site.mjs';
const before=JSON.parse(await readFile(`${root}/database-before.json`,'utf8'));
if(process.argv.includes('--complete-edge-dependencies')){
 assert.equal(await readFile(`${root}/edge-deploy-started.json`).then(()=>true,()=>false),false);
 await cp('supabase/functions/_shared/json-body.ts',`${root}/edge/supabase/functions/_shared/json-body.ts`,{force:false,errorOnExist:true});
 const assets=await inventory(`${root}/edge`);
 for(const file of assets.filter(f=>f.path.endsWith('.ts'))){
  const body=await readFile(`${root}/edge/${file.path}`,'utf8');
  for(const m of body.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g)){
   const target=new URL(m[1],new URL(`file:///${file.path}`)).pathname.slice(1);
   assert.ok(assets.some(f=>f.path===target),`Missing relative dependency ${target}`);
  }
 }
 await writeFile(`${root}/edge-manifest.json`,JSON.stringify(assets,null,2));
 console.log('Exact Edge artifact includes and verifies every relative dependency.');process.exit(0);
}
const changed=['trg_enforce_write_rate_limit()','publish_reporter_visibility_change()','trg_report_notify_admin()',
 'enforce_owned_profile_avatar()','get_admin_report_case_v3(uuid)','get_admin_appeal_case_v1(uuid)'];
const q=s=>`'${s.replaceAll("'","''")}'`;
const guards=changed.map(s=>{const f=before.functions[s]??before.functions[`public.${s}`];assert.ok(f,s);return `if md5(pg_get_functiondef('public.${s}'::regprocedure))<>${q(f.md5)} then raise exception 'Release drift: ${s}'; end if;`;}).join('\n');
const drafts=['external_takedown_intake_v1.sql','external_takedown_alerts_v1.sql','external_takedown_alert_wakeup_v1.sql','external_takedown_staff_bridge_v1.sql',
 'moderation_media_ledger_v1.sql','moderation_media_restoration_v1.sql','moderation_media_cleanup_v1.sql','moderation_media_evidence_v1.sql','moderation_media_closure_v1.sql','moderation_media_wakeup_v1.sql'];
const sql=`begin;
set local lock_timeout='2s';set local statement_timeout='15s';
select pg_advisory_xact_lock(hashtextextended('doji:safety-launch-v1',0));
do $$begin
 if to_regclass('public.safety_removal_cases') is not null then raise exception 'Intake already installed; do not reapply'; end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()) then raise exception 'Active participation window; defer release'; end if;
 ${guards}
end$$;
create temporary table safety_release_functions on commit drop as select p.oid,pg_get_functiondef(p.oid) definition,p.proacl from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
create temporary table safety_release_relations on commit drop as select c.oid,c.relacl,c.relrowsecurity,c.relforcerowsecurity from pg_class c where c.relnamespace in('public'::regnamespace,'storage'::regnamespace) and c.relkind in('r','p','v','m');
create temporary table safety_release_policies on commit drop as select * from pg_policies where schemaname in('public','storage');
${(await Promise.all(drafts.map(async n=>(await readFile(`docs/drafts/${n}`,'utf8')).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')))).join('\n')}
-- Cleanup guards must be deployed/enabled and older Edge invocations drained
-- before any new media holds are captured. Public intake remains disabled.
alter table public.moderation_decisions disable trigger capture_decision_media;
insert into public.moderation_media_delivery_config(singleton,enabled,endpoint) values(true,false,'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/moderation-media');
insert into public.safety_removal_delivery_config(singleton,enabled,endpoint) values(true,false,'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/safety-removal-alerts');
do $$begin
 if exists(select 1 from safety_release_functions f left join pg_proc p on p.oid=f.oid where p.oid is null or f.proacl is distinct from p.proacl or (f.definition is distinct from pg_get_functiondef(p.oid) and p.oid not in(${changed.map(s=>`'public.${s}'::regprocedure`).join(',')}))) then raise exception 'Unrelated function/grant drift'; end if;
 if exists(select 1 from safety_release_relations r left join pg_class c on c.oid=r.oid where c.oid is null or r.relacl is distinct from c.relacl or r.relrowsecurity<>c.relrowsecurity or r.relforcerowsecurity<>c.relforcerowsecurity) then raise exception 'Existing relation/grant drift'; end if;
 if exists(select * from safety_release_policies where not(schemaname='storage' and tablename='objects' and policyname='employee_report_evidence_boundary') except select * from pg_policies where schemaname in('public','storage')) then raise exception 'Existing policy changed'; end if;
end$$;
notify pgrst,'reload schema';
commit;\n`;
const databaseArtifact={sha256:hash(sql),drafts:await Promise.all(drafts.map(async path=>({path,sha256:hash(await readFile(`docs/drafts/${path}`))}))),changed,publicEnabled:false,captureEnabled:false};
if(process.argv.includes('--refresh-sql')){
 assert.equal(await readFile(`${root}/database-deploy-started.json`).then(()=>true,()=>false),false,'Cannot rewrite a release already attempted');
 await writeFile(`${root}/database.sql`,sql);await writeFile(`${root}/database-artifact.json`,JSON.stringify(databaseArtifact,null,2));
 console.log('Refreshed unattempted SQL artifact only.');process.exit(0);
}
await writeFile(`${root}/database.sql`,sql,{flag:'wx'});
// A retained-data hold is the safe rollback after the first removal. Do not
// restore raw cleanup, drop ledgers/cases, remove fences or republish content.
await writeFile(`${root}/hold.sql`,`begin;set local lock_timeout='2s';set local statement_timeout='8s';
update public.safety_removal_delivery_config set enabled=false;
update public.moderation_media_delivery_config set enabled=false;
alter table public.moderation_decisions disable trigger capture_decision_media;
-- Keep existing case access, evidence, cleanup fences and restoration contracts.
-- Edge public acceptance must be disabled first. Existing deadlines require
-- manual operator coverage; inspect exact cron IDs before unscheduling.
commit;\n`,{flag:'wx'});
const slugs=['delete-account','run-data-maintenance','moderation-media','safety-removal'];
const files=['deno.d.ts',...slugs.map(s=>`${s}/index.ts`),...['moderation-media','moderation-media-storage','moderation-media-dispatch','moderation-media-cleanup','moderation-media-cleanup-client','employee-service-headers','safety-removal','json-body'].map(s=>`_shared/${s}.ts`)];
for(const path of files){const dest=`${root}/edge/supabase/functions/${path}`;await mkdir(dirname(dest),{recursive:true});await cp(`supabase/functions/${path}`,dest,{force:false,errorOnExist:true});}
await writeFile(`${root}/edge/supabase/config.toml`,['project_id = "safety-launch-20260929"',...slugs.map(s=>`[functions.${s}]\nverify_jwt = ${s==='delete-account'}`)].join('\n')+'\n',{flag:'wx'});
await save('edge-manifest.json',await inventory(`${root}/edge`));
await save('edge-before-manifest.json',await inventory(`${root}/edge-before`));
await save('database-artifact.json',databaseArtifact);
// Use actual live public documents, not the working-tree's unreleased business
// marketing. Every existing legal body stays byte-for-byte unchanged.
await cp(`${root}/public-before`,`${root}/public`,{recursive:true,errorOnExist:true,force:false});
for(const path of publicPages){
 const html=await readFile(path==='safety-removal/index.html'?`website/${path}`:`${root}/public-before/${path}`,'utf8');
 await mkdir(dirname(`${root}/public/${path}`),{recursive:true});await writeFile(`${root}/public/${path}`,addReportingNavigation(html,path));
}
const css=await readFile(`${root}/public-before/styles.css`,'utf8');
await writeFile(`${root}/public/styles.css`,css+'\n/* Scoped accessible reporting links; no business/portal theme changes. */\n.safetyLinkedPage { --orange-dark: #b33a20; }\n[hidden] { display: none !important; }\n');
for(const path of ['portal.css','portal-select.js','safety-removal/config.js','safety-removal/form.js','safety-removal/taxonomy.js','safety-removal/safety.css'])await cp(`website/${path}`,`${root}/public/${path}`);
await writeFile(`${root}/public/_headers`,candidateHeaders());
await save('public-candidate.json',{deploymentReady:false,enabled:false,assets:await inventory(`${root}/public`),preservedBusinessRoutes:'No business/admin routes exist on the pinned public deployment; no unreleased business assets included.'});
console.log('Prepared disabled SQL, exact Edge and public site artifacts with live-source guards; no deployment.');
