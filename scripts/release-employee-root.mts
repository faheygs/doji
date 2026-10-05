// Owner-approved portal-only cutover from the verified employee acceptance page.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,hash,inventory,account} from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceAt,evidenceText,evidenceAssets} from './release-evidence.mts';
import type {PagesReleaseProject} from './release-evidence.mts';
type Project=PagesReleaseProject & {deployment_configs:unknown};
const root='test-results/employee-root-20261001',site=root+'/site';
const build='website/.business-admin-qa-20261001';
const preview='test-results/employee-preview-20261001/site';
const expected='6d01fb21-b4c7-48aa-9d2f-c3c94022ee1c';
const mode=process.argv[2];assert.ok(mode&&['prepare','deploy','verify'].includes(mode));
const read=async (p:string)=>evidenceRecord(JSON.parse(await readFile(p,'utf8')));
const save=(n:string,v:unknown)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
async function pages(){const ids:Record<string,string>={};for(const n of ['doji-admin','doji-business','doji-site']){const project=await cf<Project>('/pages/projects/'+n);assert.ok(project.canonical_deployment);ids[n]=project.canonical_deployment.id;}return ids;}
await mkdir(root,{recursive:true});
if(mode==='prepare'){
 const project=await cf<Project>('/pages/projects/doji-admin');assert.ok(project.canonical_deployment);assert.equal(project.canonical_deployment.id,expected);
 const candidate=await read('test-results/employee-preview-20261001/candidate.json');assert.deepEqual(await inventory(preview),candidate.assets);
 await cp(build,site,{recursive:true,errorOnExist:true,force:false});
 await cp(`${preview}/_routes.json`,`${site}/_routes.json`);
 // Keep the old acceptance bookmark usable, without a second login UI.
 await writeFile(`${site}/_redirects`,'/employee-setup/* / 302\n/identity/employee-preview/* / 302\n');
 // Existing hosted invitation completion asset remains available; no credential flow added.
 await mkdir(`${site}/identity`,{recursive:true});
 await cp(`${preview}/identity/setup-return.js`,`${site}/identity/setup-return.js`);
 const files=await inventory(site);
 const bundle=await readFile(`${site}/admin-portal/admin-app-20260925ap.js`,'utf8');
 const oldBundle=await readFile(`${preview}/identity/employee-preview/admin-portal/admin-app-20260925ap.js`,'utf8');
 assert.equal(bundle,oldBundle.replaceAll("import('/identity/employee-preview/admin-portal/","import('/admin-portal/"),'Only dynamic import base may change');
 for(const f of files){
  if(['index.html','admin-portal/index.html','_routes.json','_redirects','identity/setup-return.js','_headers','robots.txt','admin-portal/admin-app-20260925ap.js'].includes(f.path))continue;
  const old=f.path==='_worker.js'?`${preview}/_worker.js`:`${preview}/identity/employee-preview/${f.path}`;
  assert.equal(f.sha256,hash(await readFile(old)),f.path+' differs from accepted implementation');
 }
 const config=await read('.artifacts/employee-runtime/runtime.json');
 for(const f of files){
  if(!/\.(js|html|css|json)$/.test(f.path))continue;
  const text=await readFile(`${site}/${f.path}`,'utf8');
  for(const secret of [config.apiKey,evidenceAt(config,'database').password,config.proxyKey,config.encryptionKey,evidenceAt(config,'monitoring').token])assert.ok(!text.includes(evidenceText(secret)),'Secret in artifact');
 }
 for(const entry of ['index.html','admin-portal/index.html']){
  const html=await readFile(`${site}/${entry}`,'utf8');
  assert.ok(html.includes('Forgot employee password?'));assert.ok(!html.includes('/employee-setup/return.js'));
  for(const m of html.matchAll(/(?:src|href)="(\/[^"?#]+)[^"#]*"/g))await access(`${site}${m[1]}`);
 }
 assert.ok(bundle.includes('"independentEmployeeIdentity": true'));
 await save('candidate',{at:new Date().toISOString(),pages:await pages(),configDigest:hash(JSON.stringify(project.deployment_configs)),assets:files,
  acceptance:{ownerLoginMfa:true,ownerExistingSuperAdmin:true,rolesRead:true,businessRead:true,ideasRead:true,healthRead:true,recoveryPage:true,passwordResetPerformed:false},
  rollback:expected,legacyRollback:'a64aeea7-63d6-431d-ab09-24bdb48db756'});
 console.log('Root cutover prepared: same accepted implementation; recovery link added; no provider/database/config changes.');
}else{
 const c=await read(`${root}/candidate.json`);assert.deepEqual(await inventory(site),c.assets);
 if(mode==='deploy'){
  assert.deepEqual(await pages(),c.pages);
  assert.equal(hash(JSON.stringify((await cf<Project>('/pages/projects/doji-admin')).deployment_configs)),c.configDigest);
  await assert.rejects(access(`${root}/deploy-started.json`));await save('deploy-started',{at:new Date().toISOString(),rollback:c.rollback});
  try{execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Independent employee login at admin root; owner accepted'],{stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});}catch{throw Error('Deployment response unavailable; inspect actual cloud status before retrying.');}
 }
 const ids=await pages();assert.notEqual(ids['doji-admin'],evidenceAt(c,'pages')['doji-admin']);
 for(const n of ['doji-business','doji-site'])assert.equal(ids[n],evidenceAt(c,'pages')[n]);
 const project=await cf<Project>('/pages/projects/doji-admin');assert.ok(project.canonical_deployment);assert.equal(project.canonical_deployment.latest_stage.status,'success');assert.equal(hash(JSON.stringify(project.deployment_configs)),c.configDigest);
 for(const path of ['index.html','admin-portal/admin-app-20260925ap.js']){
  const r=await fetch('https://admin.dojipro.com/'+path,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const asset=evidenceAssets(c.assets).find(f=>f.path===path);assert.ok(asset);assert.equal(hash(Buffer.from(await r.arrayBuffer())),asset.sha256);
 }
 for(const [origin,status] of [['https://admin.dojipro.com',401],['https://business.dojipro.com',403]] as const){
  const r=await fetch('https://admin.dojipro.com/api/session',{headers:{origin},signal:AbortSignal.timeout(20000)});assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 const r=await fetch('https://admin.dojipro.com/identity/employee-preview/',{redirect:'manual',signal:AbortSignal.timeout(20000)});assert.equal(r.status,302);assert.ok(['/','https://admin.dojipro.com/'].includes(r.headers.get('location')??''));
 await save('verified-'+Date.now(),{at:new Date().toISOString(),deployment:ids['doji-admin'],businessAndPublicUnchanged:true,configurationUnchanged:true,rootHtmlAndBundleVerified:true,unauthenticated401:true,crossOrigin403:true,rollback:c.rollback});
 console.log(JSON.stringify({deployment:ids['doji-admin'],url:'https://admin.dojipro.com/',verified:true}));
}
