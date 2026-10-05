// Exact static-only overlay on the known live admin artifact. No login cutover.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,hash,inventory,account} from './prepare-safety-launch.mts';
import {employeeSetupReturn} from '../infra/portal-identity-candidate/employee-setup-return.mts';
import { readBrowserSource } from '../website/browser-source.mts';
import {evidenceRecord,evidenceAssets,type PagesReleaseProject} from './release-evidence.mts';
const root='test-results/employee-setup-page-20261001',site=root+'/site',base='test-results/business-release-20260930/admin-site';
const mode=process.argv[2];assert.ok(mode && ['prepare','deploy','verify'].includes(mode));
const read=async(p:string)=>evidenceRecord(JSON.parse(await readFile(p,'utf8')));
const save=(n:string,v:unknown)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
const old=await read('test-results/business-release-20260930/admin-candidate.json');
const previous=await read('test-results/business-release-20260930/admin-verified-1790783121515.json');
const url='https://admin.dojipro.com/identity/setup-complete';
async function pageIds(){const ids:Record<string,string>={};for(const n of ['doji-admin','doji-business','doji-site']){const page=await cf<PagesReleaseProject>('/pages/projects/'+n);assert.ok(page.canonical_deployment);ids[n]=page.canonical_deployment.id;}return ids;}
if(mode==='prepare'){
 const pages=await pageIds();assert.equal(pages['doji-admin'],previous.deployment);
 assert.deepEqual(await inventory(base),old.assets);await mkdir(root,{recursive:true});
 await cp(base,site,{recursive:true,errorOnExist:true,force:false});
 await mkdir(site+'/identity/setup-complete',{recursive:true});
 const setupResponse=employeeSetupReturn(new Request(url));assert.ok(setupResponse);
 await writeFile(site+'/identity/setup-complete/index.html',await setupResponse.text(),{flag:'wx'});
 await writeFile(site+'/identity/setup-return.js',readBrowserSource('identity/setup-return.js'),{flag:'wx'});
 const headers=await readFile(base+'/_headers','utf8');
 await writeFile(site+'/_headers',headers+'\n/identity/*\n  Cache-Control: no-store\n  Referrer-Policy: no-referrer\n');
 const oldAssets=evidenceAssets(old.assets);
 const assets=await inventory(site),changed=assets.filter(a=>oldAssets.find(o=>o.path===a.path)?.sha256!==a.sha256).map(a=>a.path);
 assert.deepEqual(changed,['_headers','identity/setup-complete/index.html','identity/setup-return.js']);
 await save('candidate',{at:new Date().toISOString(),pages,assets,changed,loginCutover:false});console.log('Prepared three-file setup landing overlay; every existing admin asset unchanged.');
}else{
 const candidate=await read(root+'/candidate.json');assert.deepEqual(await inventory(site),candidate.assets);
 const candidatePages=evidenceRecord(candidate.pages),candidateAssets=evidenceAssets(candidate.assets);
 if(mode==='deploy'){
  assert.deepEqual(await pageIds(),candidate.pages);await assert.rejects(access(root+'/started.json'));
  await save('started',{at:new Date().toISOString(),rollback:previous.deployment});
  try{execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Employee invitation return page only'],{stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});}catch{throw Error('Deployment response unavailable. Inspect current deployment before retrying.');}
 }
 const ids=await pageIds();assert.notEqual(ids['doji-admin'],candidatePages['doji-admin']);
 assert.equal(ids['doji-business'],candidatePages['doji-business']);assert.equal(ids['doji-site'],candidatePages['doji-site']);
 const project=await cf<PagesReleaseProject>('/pages/projects/doji-admin');assert.ok(project.canonical_deployment);assert.equal(project.canonical_deployment.latest_stage.status,'success');
 for(const path of ['identity/setup-complete/index.html','identity/setup-return.js','index.html','admin-portal/admin-app-20260930business1.js']){
  const r=await fetch('https://admin.dojipro.com/'+path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);
  const asset=candidateAssets.find(a=>a.path===path);assert.ok(asset);assert.equal(hash(Buffer.from(await r.arrayBuffer())),asset.sha256);
  // Pages merges global and path headers. W3C Referrer Policy uses the last
  // recognized comma-separated policy; require our no-referrer to be last.
  if(path.startsWith('identity/')){assert.match(r.headers.get('cache-control')||'',/no-store/);assert.equal(r.headers.get('referrer-policy')?.split(',').at(-1)?.trim(),'no-referrer');}
 }
 await save('verified-'+Date.now(),{at:new Date().toISOString(),ids,rollback:previous.deployment,url,loginCutover:false,existingLoginAssetsUnchanged:true});
 console.log('Employee setup return page live and byte-verified; existing login, business and public site unchanged.');
}
