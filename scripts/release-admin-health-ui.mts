// Admin presentation only. The shared health-event release is separately gated.
import assert from 'node:assert/strict';
import {access,cp,mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,account,hash,inventory} from './prepare-safety-launch.mts';
import {pages,functions,database} from './business-disabled-release-reads.mts';
import {evidenceRecord,evidenceAssets} from './release-evidence.mts';
import {readBrowserSource} from '../website/browser-source.mts';
assert.ok(process.argv[3] === undefined || ['--case-footer','--case-actions','--case-claim','--case-assignee','--record-pages'].includes(process.argv[3]));
const recordPages=process.argv[3] === '--record-pages';
const caseAssignee=process.argv[3] === '--case-assignee';
const caseClaim=process.argv[3] === '--case-claim';
const caseActions=process.argv[3] === '--case-actions';
const caseFooter=caseAssignee || caseClaim || caseActions || process.argv[3] === '--case-footer';
const root=recordPages?'test-results/admin-record-pages-20261006':caseAssignee?'test-results/admin-case-assignee-20261006':caseClaim?'test-results/admin-case-claim-20261006':caseActions?'test-results/admin-case-actions-20261006':caseFooter?'test-results/admin-case-footer-20261006':'test-results/admin-health-ui-20261006',output=`${root}/site`;
const prior=recordPages?'test-results/admin-case-assignee-20261006':caseAssignee?'test-results/admin-case-claim-20261006':caseClaim?'test-results/admin-case-actions-20261006':caseActions?'test-results/admin-case-footer-20261006':caseFooter?'test-results/admin-health-ui-20261006':'test-results/admin-unified-safety-cache-20261006-v2';
const bundle='admin-portal/admin-app-20261002d.js',buildDir=recordPages?'.business-admin-qa-20261021':caseAssignee?'.business-admin-qa-20261020':caseClaim?'.business-admin-qa-20261019':caseActions?'.business-admin-qa-20261018':caseFooter?'.business-admin-qa-20261017':'.business-admin-qa-20261016';
const configPattern=/window\.DOJI_PORTAL_CONFIG = Object\.freeze\((\{[\s\S]*?\})\);/;
const read=async(p:string)=>evidenceRecord(JSON.parse(await readFile(p,'utf8')));
const save=(name:string,value:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
const normalize=(s:string)=>s.replace(/((?:workflow-[a-z-]+|business-applications|business-privacy)\.js)\?v=[a-f0-9]{16}/g,'$1');
async function configHash(){return hash(JSON.stringify(evidenceRecord(await cf('/pages/projects/doji-admin')).deployment_configs));}
const mode=process.argv[2];assert.ok(['prepare','test','deploy','verify'].includes(String(mode)));
await mkdir(root,{recursive:true});
if(mode==='prepare'){
 await assert.rejects(access(`${root}/prepared.json`));
 const last=await read(`${prior}/verified.json`), baseline=await read(`${prior}/prepared.json`);
 assert.deepEqual(await pages(),last.pages,'Newer release exists');
 assert.deepEqual(await inventory(`${prior}/site`),baseline.assets,'Rollback artifact changed');
 const oldBundle=await readFile(`${prior}/site/${bundle}`,'utf8');
 const match=oldBundle.match(configPattern);assert.ok(match?.[1]);const config=evidenceRecord(JSON.parse(match[1]));
 assert.equal(config.independentEmployeeIdentity,true);assert.equal(config.unifiedSafetyEnabled,true);
 const env:Record<string,string|undefined>={...process.env,DOJI_ADMIN_OUTPUT_DIR:buildDir,DOJI_ADMIN_ASSET_PREFIX:'',
 DOJI_ADMIN_SUPABASE_URL:String(config.supabaseUrl),DOJI_ADMIN_SUPABASE_ANON_KEY:String(config.supabaseAnonKey),DOJI_ADMIN_API_BASE_URL:String(config.apiBaseUrl),DOJI_ADMIN_HEALTH_EVENTS_ENABLED:'false'};
 for(const [key,name] of Object.entries({employeeAccountsEnabled:'EMPLOYEE_ACCOUNTS',independentEmployeeIdentity:'INDEPENDENT_EMPLOYEE',staffWorkflowEnabled:'STAFF_WORKFLOW_ENABLED',unifiedSafetyEnabled:'UNIFIED_SAFETY_ENABLED',editorialEnabled:'EDITORIAL_ENABLED',businessApplicationsEnabled:'BUSINESS_APPLICATIONS_ENABLED',safetyRemovalEnabled:'SAFETY_REMOVAL_ENABLED',businessPrivacyEnabled:'BUSINESS_PRIVACY_ENABLED',campaignsEnabled:'CAMPAIGNS_ENABLED'}))env[`DOJI_ADMIN_${name}`]=String(config[key]);
 execFileSync(process.execPath,['website/build-admin.mts'],{env,stdio:'pipe',timeout:60000});
 const built=`website/${buildDir}`;
 const next=(await readFile(`${built}/${bundle}`,'utf8')).match(configPattern);assert.ok(next?.[1]);
 assert.deepEqual(JSON.parse(next[1]),{...config,healthEventsEnabled:false});
 if(recordPages){
  const nextBundle=await readFile(`${built}/${bundle}`,'utf8');
  const boundary=readBrowserSource('admin-portal/contextual-help.js');
  for(const source of [oldBundle,nextBundle])assert.equal(source.split(boundary).length,2);
  // Config, independent auth transport, health and live reads are frozen byte-for-byte.
  assert.equal(hash(normalize(nextBundle.slice(0,nextBundle.indexOf(boundary)+boundary.length))),hash(normalize(oldBundle.slice(0,oldBundle.indexOf(boundary)+boundary.length))),'Auth, health or live-read code changed beyond asset versioning');
  for(const asset of ['portal-select.js','admin-portal/auth-journey.js']){
   const source=readBrowserSource(asset);assert.ok(oldBundle.includes(source));assert.ok(nextBundle.includes(source));
  }
  // Controller delta is limited to record presentation and close/Back cleanup.
  const oldPortal=normalize(await readFile(`${prior}/site/portal.js`,'utf8'));
  const nextPortal=normalize(await readFile(`${built}/portal.js`,'utf8'));
  const reverted=nextPortal
   .replace('      byId("auditDetailModal").addEventListener("close", () => window.DojiRecordPages?.hide(byId("auditDetailModal")));\n','')
   .replace(/        const auditPage = byId\("auditDetailModal"\);\n[\s\S]*?        if \(!auditPage.open\) auditPage.showModal\(\);/, '        byId("auditDetailModal").showModal();')
   .replace('if (!window.DojiRecordPages) drawerBackdrop.classList.add("open");','drawerBackdrop.classList.add("open");')
   .replace('        window.DojiRecordPages?.show(drawer, { close: closeDrawer, busy: () => moderationSubmitting || triageSubmitting });\n','')
   .replace('        window.DojiRecordPages?.hide(drawer);\n','');
  assert.equal(hash(reverted),hash(oldPortal),'Unapproved controller change');
  assert.equal(normalize(await readFile(`${built}/admin-portal/live-client.js`,'utf8')),normalize(await readFile(`${prior}/site/admin-portal/live-client.js`,'utf8')));
 }
 if(caseFooter){
  const start=readBrowserSource('admin-portal/editorial.js'),end=readBrowserSource('portal-select.js');
  const splitSafety=(source:string)=>{
   assert.equal(source.split(start).length,2);assert.equal(source.split(end).length,2);
   const a=source.indexOf(start)+start.length,b=source.indexOf(end);assert.ok(b>a);
   const safety=source.slice(a,b);assert.ok(safety.includes('window.DojiSafetyRemoval'));
   return [normalize(source.slice(0,a)),normalize(source.slice(b))];
  };
  // Only the safety presentation module may change inside the production bundle.
  assert.deepEqual(splitSafety(await readFile(`${built}/${bundle}`,'utf8')),splitSafety(oldBundle));
 }
 const paths=['index.html','admin-portal/index.html',bundle,'portal.js','admin-portal/admin.css','admin-portal/live-client.js',
 ...(recordPages?['admin-portal/business-applications.js','admin-portal/business-privacy.js']:[]),
 ...['contracts','case','workspace','view','review','events'].map(n=>`admin-portal/workflow-${n}.js`)];
 // Lazy workflow modules must differ only in their cache-versioned import URLs.
 for(const path of paths.filter(p=>p.includes('/workflow-')))assert.equal(normalize(await readFile(`${built}/${path}`,'utf8')),normalize(await readFile(`${prior}/site/${path}`,'utf8')),path);
 // Preserve the existing proxy, headers, routing and every unrelated static file.
 await cp(`${prior}/site`,output,{recursive:true,force:false,errorOnExist:true});
 for(const path of paths)await cp(`${built}/${path}`,`${output}/${path}`);
 const assets=await inventory(output),old=evidenceAssets(baseline.assets);
 assert.deepEqual(assets.map(a=>a.path),old.map(a=>a.path));
 const changed=assets.filter(a=>old.find(b=>b.path===a.path)?.sha256!==a.sha256).map(a=>a.path);
 assert.ok(changed.every(p=>paths.includes(p)));
 assert.equal(hash(await readFile(`${output}/_worker.js`)),hash(await readFile(`${prior}/site/_worker.js`)));
 const revision=(await readFile(`${output}/index.html`,'utf8')).match(/admin-app-20261002d\.js\?v=([a-f0-9]{16})/)?.[1];assert.ok(revision);
 await save('prepared',{at:new Date().toISOString(),pages:last.pages,assets,changed,revision,configHash:await configHash(),functions:functions(),database:database(),rollback:`${prior}/site`,healthEventsEnabled:false});
 console.log(JSON.stringify({root,changed,revision,sharedFeed:false}));
}else{
 const p=await read(`${root}/prepared.json`);assert.deepEqual(await inventory(output),p.assets);
 if(mode==='test'){
  execFileSync(process.execPath,['node_modules/@playwright/test/cli.js','test','--config=website/admin-portal/playwright.workflow.config.mts','workflow-integration.spec.mts'],{stdio:'inherit',timeout:120000,env:{...process.env,DOJI_WORKFLOW_RELEASE_DIR:output}});
  await save('tested',{at:new Date().toISOString(),assets:p.assets});
 }else{
  assert.deepEqual(functions(),p.functions);assert.equal(await configHash(),p.configHash);
  const db=database();for(const key of ['contracts','roles','policies'])assert.equal(db[key],evidenceRecord(p.database)[key]);
  assert.equal(db.event_window,false,'Doji release exclusion window');
  if(mode==='deploy'){
   assert.deepEqual((await read(`${root}/tested.json`)).assets,p.assets);assert.deepEqual(await pages(),p.pages);
   await save('deploy-started',{at:new Date().toISOString()});
   try{execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',output,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message',recordPages?'Replace admin review drawers with full workspace record pages':caseFooter?'Keep safety case actions in a fixed review footer':'Clarify platform operations health, freshness and coverage'],{stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});}catch{throw Error('Unknown deployment outcome; inspect without retry');}
   await save('deployed',{at:new Date().toISOString(),pages:await pages()});console.log('Admin UI deployed; verification pending.');
  }else{
   const actual=await pages();assert.deepEqual(actual,(await read(`${root}/deployed.json`)).pages);
   assert.notDeepEqual(actual['doji-admin'],evidenceRecord(p.pages)['doji-admin']);
   for(const name of ['doji-business','doji-site'])assert.deepEqual(actual[name],evidenceRecord(p.pages)[name]);
   for(const asset of evidenceAssets(p.assets).filter(a=>Array.isArray(p.changed)&&p.changed.includes(a.path))){
    const response=await fetch(`https://admin.dojipro.com/${asset.path}?v=${String(p.revision)}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
    assert.equal(response.status,200);assert.equal(hash(Buffer.from(await response.arrayBuffer())),asset.sha256,asset.path);
   }
   await save('verified',{at:new Date().toISOString(),pages:actual,revision:p.revision,sharedFeed:false,backendUnchanged:true});console.log(JSON.stringify({verified:true,pages:actual,sharedFeed:false}));
  }
 }
}
