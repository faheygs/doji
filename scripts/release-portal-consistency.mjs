// Exact admin-only static overlay; no shared deployment or remote command tests.
import assert from 'node:assert/strict';
import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,hash,inventory,account} from './prepare-safety-launch.mjs';
const root='test-results/portal-consistency-20260929',site=`${root}/site`;
const baseline='test-results/safety-portal-ui-20260929-v3/site';
const baseId='7026a54c-fa7d-4c5d-b0f1-44b9e5f05e86';
const save=(name,value)=>writeFile(`${root}/${name}`,JSON.stringify(value,null,2),{flag:'wx'});
const mode=process.argv[2];assert.ok(['prepare','deploy','verify'].includes(mode));
if(mode==='prepare'){
 const recorded=JSON.parse(await readFile('test-results/safety-portal-ui-20260929-v3/candidate.json','utf8'));
 assert.deepEqual(await inventory(baseline),recorded.assets);
 await mkdir(root,{recursive:true});
 await cp(baseline,site,{recursive:true});
 const old=await readFile(`${baseline}/admin-portal/admin-app-20260929safety2.js`,'utf8');
 const source=await readFile('website/portal.js','utf8');
 const start=old.indexOf(source.slice(0,150));assert.ok(start>0);
 const oldRuntime=old.slice(start).trimEnd();
 const boundary="  if (portalType === 'admin')";
 assert.ok(source.includes(boundary));
 assert.equal(source.slice(0,source.indexOf(boundary)),oldRuntime.slice(0,oldRuntime.indexOf(boundary)),'Business/public runtime changed');
 await writeFile(`${root}/runtime-before.js`,oldRuntime);
 await writeFile(`${root}/runtime-after.js`,source);
 await writeFile(`${site}/admin-portal/admin-app-20260929consistency1.js`,old.slice(0,start)+source.trimEnd()+'\n');
 await cp('website/admin-portal/admin.css',`${site}/admin-portal/admin.css`);
 for(const path of ['index.html','admin-portal/index.html']){
  const html=await readFile(`${baseline}/${path}`,'utf8');
  assert.equal(html.split('admin-app-20260929safety2.js').length,2);
  await writeFile(`${site}/${path}`,html.replace('admin-app-20260929safety2.js','admin-app-20260929consistency1.js').replace('admin.css?v=20260929safety2','admin.css?v=20260929consistency1'));
 }
 const assets=await inventory(site),changed=assets.filter(a=>recorded.assets.find(b=>b.path===a.path)?.sha256!==a.sha256).map(a=>a.path);
 assert.deepEqual(changed.sort(),['admin-portal/admin-app-20260929consistency1.js','admin-portal/admin.css','admin-portal/index.html','index.html'].sort());
 // Re-preparation is allowed only locally before publication and replaces test candidates.
 await writeFile(`${root}/candidate.json`,JSON.stringify({at:new Date().toISOString(),baseline:baseId,assets,changed},null,2));
 console.log(JSON.stringify({site,changed}));
}else{
 const candidate=JSON.parse(await readFile(`${root}/candidate.json`,'utf8'));assert.deepEqual(await inventory(site),candidate.assets);
 const project=await cf('/pages/projects/doji-admin');
 if(mode==='deploy'){
  const tests=JSON.parse(await readFile(`${root}/browser-results.json`,'utf8'));
  assert.equal(tests.stats.unexpected,0);assert.equal(tests.stats.flaky,0);assert.ok(tests.stats.expected>=150);
  assert.equal(process.argv[3],'--publish-reviewed-artifact');assert.equal(project.canonical_deployment.id,baseId,'Concurrent deployment; stop');
  assert.equal(project.production_branch,'main');
  const original=JSON.parse(await readFile('test-results/safety-portal-ui-20260929-v3/candidate.json','utf8'));
  for(const a of original.assets.filter(a=>!a.path.startsWith('_'))){const r=await fetch(`${project.canonical_deployment.url}/${a.path}`,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),a.sha256,a.path);}
  const publicSite=await cf('/pages/projects/doji-site');
  await save('started.json',{at:new Date().toISOString(),baseline:baseId,domains:project.domains,publicDeployment:publicSite.canonical_deployment.id});
  const output=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Portal theme, record drawer, keyboard and export feedback consistency'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
  await save('command.json',{at:new Date().toISOString(),output});
 }
 const now=await cf('/pages/projects/doji-admin'),deployment=now.canonical_deployment;
 assert.notEqual(deployment.id,baseId);assert.equal(deployment.latest_stage.status,'success');
 const before=JSON.parse(await readFile(`${root}/started.json`,'utf8'));assert.deepEqual(now.domains,before.domains);
 assert.equal((await cf('/pages/projects/doji-site')).canonical_deployment.id,before.publicDeployment);
 for(const path of candidate.changed){const r=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),candidate.assets.find(a=>a.path===path).sha256,path);}
 await save('verified.json',{at:new Date().toISOString(),deployment:deployment.id,url:deployment.url,rollback:baseId,verified:candidate.changed,domainsAndPublicSiteUnchanged:true});
 console.log(JSON.stringify({deployment:deployment.id,url:deployment.url,verified:candidate.changed}));
}
