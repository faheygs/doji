// Portal-only exact-baseline patch. No backend, Worker, public-site or member release.
import assert from 'node:assert/strict';
import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,hash,inventory,account} from './prepare-safety-launch.mts';
import {readBrowserSource} from '../website/browser-source.mts';
import {evidenceRecord,evidenceAssets,evidenceStrings,type PagesReleaseProject} from './release-evidence.mts';
const root='test-results/safety-portal-ui-20260929-v3',site=`${root}/site`;
const baseline='test-results/safety-launch-20260929/admin';
const baseId='56346977-c2c5-4053-924a-4332c1a402c3';
const save=async(name:string,value:unknown)=>writeFile(`${root}/${name}`,JSON.stringify(value,null,2),{flag:'wx'});
const mode=process.argv[2];assert.ok(mode && ['prepare','deploy','verify'].includes(mode));
if(mode==='prepare'){
 const recorded=evidenceRecord(JSON.parse(await readFile('test-results/safety-launch-20260929/admin-candidate.json','utf8')));
 const recordedAssets=evidenceAssets(recorded.assets);
 assert.deepEqual(await inventory(baseline),recorded.assets);
 await mkdir(root,{recursive:true});await cp(baseline,site,{recursive:true,force:false,errorOnExist:true});
 const old=await readFile(`${baseline}/admin-portal/admin-app-20260929safety1.js`,'utf8');
 const start=old.indexOf('/* Restricted intake, separately enabled only after backend qualification. */');
 const end=old.indexOf('window.DojiSafetyRemoval = { create };',start);
 const stop=old.indexOf('})();',end)+5;assert.ok(start>0&&end>start&&stop>end);
 const source=readBrowserSource('admin-portal/safety-removal.js');
 const bundle=old.slice(0,start)+source.trimEnd()+old.slice(stop);
 await writeFile(`${site}/admin-portal/admin-app-20260929safety2.js`,bundle,{flag:'wx'});
 const cssOld=await readFile(`${baseline}/admin-portal/admin.css`,'utf8');
 const css=await readFile('website/admin-portal/admin.css','utf8');
 const additions=css.split(/\r?\n/).filter(line=>line.startsWith('.adminPortalPage .safetyHistory')||line.startsWith('.adminPortalPage .safetyRemovalDialog .editorialActions')||line.startsWith('.adminPortalPage .safetyRemovalDialog .detailBlock label'));
 assert.equal(additions.length,5);
 assert.equal(css.replaceAll('\r\n','\n').split('\n').filter(line=>!additions.includes(line)).join('\n'),cssOld.replaceAll('\r\n','\n'),'Unrelated CSS change');
 await writeFile(`${site}/admin-portal/admin.css`,css);
 for(const path of ['index.html','admin-portal/index.html']){
  let html=await readFile(`${baseline}/${path}`,'utf8');assert.equal(html.split('admin-app-20260929safety1.js').length,2);
  html=html.replace('admin-app-20260929safety1.js','admin-app-20260929safety2.js').replace('admin.css?v=20260929safety1','admin.css?v=20260929safety2');
  await writeFile(`${site}/${path}`,html);
 }
 const assets=await inventory(site),changed=assets.filter(a=>recordedAssets.find(b=>b.path===a.path)?.sha256!==a.sha256).map(a=>a.path);
 assert.deepEqual(changed.sort(),['admin-portal/admin-app-20260929safety2.js','admin-portal/admin.css','admin-portal/index.html','index.html'].sort());
 await save('candidate.json',{at:new Date().toISOString(),baseline:baseId,assets,changed,unchangedAppBundleOutsideSafetyModule:true});
 console.log(JSON.stringify({site,changed}));
}else{
 const candidate=evidenceRecord(JSON.parse(await readFile(`${root}/candidate.json`,'utf8')));assert.deepEqual(await inventory(site),candidate.assets);
 const candidateAssets=evidenceAssets(candidate.assets),changed=evidenceStrings(candidate.changed);
 const project=await cf<PagesReleaseProject>('/pages/projects/doji-admin');assert.ok(project.canonical_deployment);
 if(mode==='deploy'){
  const tests=JSON.parse(await readFile(`${root}/browser-results.json`,'utf8'));assert.equal(tests.stats.unexpected,0);assert.equal(tests.stats.flaky,0);assert.ok(tests.stats.expected>=144);
  assert.equal(process.argv[3],'--publish-reviewed-artifact');assert.equal(project.canonical_deployment.id,baseId,'Concurrent deployment; stop');
  assert.equal(project.production_branch,'main');
  const original=evidenceRecord(JSON.parse(await readFile('test-results/safety-launch-20260929/admin-candidate.json','utf8')));
  // Prove every retained file against the actual pinned live deployment.
  for(const asset of evidenceAssets(original.assets).filter(a=>!a.path.startsWith('_'))){const r:Response=await fetch(`${project.canonical_deployment.url}/${asset.path}`,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),asset.sha256,asset.path);}
  await save('started.json',{at:new Date().toISOString(),baseline:baseId,domains:project.domains});
  const output=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Portal safety drawer theme and revision notice repair'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
  await save('command.json',{at:new Date().toISOString(),output});
 }
 const now=await cf<PagesReleaseProject>('/pages/projects/doji-admin'),deployment=now.canonical_deployment;assert.ok(deployment);
 assert.notEqual(deployment.id,baseId);assert.equal(deployment.latest_stage.status,'success');
 const before=JSON.parse(await readFile(`${root}/started.json`,'utf8'));assert.deepEqual(now.domains,before.domains);
 for(const path of changed){const r=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);const asset=candidateAssets.find(a=>a.path===path);assert.ok(asset);assert.equal(hash(Buffer.from(await r.arrayBuffer())),asset.sha256,path);}
 await save('verified.json',{at:new Date().toISOString(),deployment:deployment.id,url:deployment.url,rollback:baseId,verified:candidate.changed,domainsUnchanged:true});
 console.log(JSON.stringify({deployment:deployment.id,url:deployment.url,verified:candidate.changed}));
}
