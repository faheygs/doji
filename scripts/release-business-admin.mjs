// Overlay only the qualified business admin integration on the exact live site.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,hash,inventory,account} from './prepare-safety-launch.mjs';
const root='test-results/business-release-20260930',site=`${root}/admin-site`,base='test-results/portal-consistency-20260929/site';
const oldName='admin-app-20260929consistency1.js',name='admin-app-20260930business1.js';
const read=p=>readFile(p,'utf8');
const save=(n,v)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
const baseline=JSON.parse(await read(`${root}/baseline.json`));
const mode=process.argv[2];assert.ok(['prepare','deploy','verify'].includes(mode));
if(mode==='prepare'){
 const original=JSON.parse(await read('test-results/portal-consistency-20260929/candidate.json'));
 assert.deepEqual(await inventory(base),original.assets);
 await cp(base,site,{recursive:true,errorOnExist:true,force:false});
 const old=await read(`${base}/admin-portal/${oldName}`),source=await read('website/portal.js');
 const clientStart=old.indexOf("(() => {\n  const storageKey = 'doji-admin-session-v1';");
 // Source-controlled files may retain CRLF, so locate markers independently.
 const normalized=old.replaceAll('\r\n','\n');
 const a=normalized.indexOf("(() => {\n  const storageKey = 'doji-admin-session-v1';");
 const b=normalized.indexOf('/* Portal-only progressive disclosure. Help never participates in field layout. */');
 const c=normalized.indexOf("(() => {\n  const portalType = document.body.dataset.portal;");
 assert.ok(a>0&&b>a&&c>b);
 const boundary="  if (portalType === 'admin')",liveRuntime=normalized.slice(c),newRuntime=source.replaceAll('\r\n','\n');
 assert.equal(liveRuntime.split(boundary).length,2);assert.equal(newRuntime.split(boundary).length,2);
 const configEnd=normalized.indexOf('});')+3,oldConfig=JSON.parse(normalized.slice(normalized.indexOf('Object.freeze(')+14,configEnd-2));
 const config={...oldConfig,businessApplicationsEnabled:true,businessPrivacyEnabled:true};
 const result=`window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify(config,null,2)});`+normalized.slice(configEnd,a)+(await read('website/admin-portal/live-client.js')).trimEnd()+'\n'+normalized.slice(b,c)+liveRuntime.slice(0,liveRuntime.indexOf(boundary))+newRuntime.slice(newRuntime.indexOf(boundary));
 await writeFile(`${site}/admin-portal/${name}`,result);
 await cp('website/admin-portal/admin.css',`${site}/admin-portal/admin.css`);
 for(const path of ['admin-portal/business-applications.js','admin-portal/business-privacy.js','business-portal/application-form.js']){await mkdir(`${site}/${path.slice(0,path.lastIndexOf('/'))}`,{recursive:true});await cp(`website/${path}`,`${site}/${path}`);}
 for(const path of ['index.html','admin-portal/index.html'])await writeFile(`${site}/${path}`,(await read(`${base}/${path}`)).replace(oldName,name).replace('admin.css?v=20260929consistency1','admin.css?v=20260930business1'));
 const assets=await inventory(site),changed=assets.filter(x=>original.assets.find(o=>o.path===x.path)?.sha256!==x.sha256).map(x=>x.path);
 assert.equal(changed.length,7);
 await save('admin-candidate',{at:new Date().toISOString(),assets,changed,baseline:baseline.pages['doji-admin'].deployment,preservedConfig:oldConfig});
 console.log(JSON.stringify({site,changed}));
}else{
 const candidate=JSON.parse(await read(`${root}/admin-candidate.json`));assert.deepEqual(await inventory(site),candidate.assets);
 if(mode==='deploy'){
  const tests=JSON.parse(await read(`${root}/admin-browser-results.json`));assert.equal(tests.stats.unexpected,0);assert.equal(tests.stats.flaky,0);assert.ok(tests.stats.expected>=121);
  const p=await cf('/pages/projects/doji-admin');assert.equal(p.canonical_deployment.id,candidate.baseline);assert.equal(p.production_branch,'main');
  await save('admin-deploy-started',{at:new Date().toISOString(),rollback:candidate.baseline});
  execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Business application review and privacy operations'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
 }
 const p=await cf('/pages/projects/doji-admin');assert.notEqual(p.canonical_deployment.id,candidate.baseline);assert.equal(p.canonical_deployment.latest_stage.status,'success');
 assert.deepEqual(p.domains,baseline.pages['doji-admin'].domains);
 assert.equal((await cf('/pages/projects/doji-site')).canonical_deployment.id,baseline.pages['doji-site'].deployment);
 for(const path of candidate.changed){const r=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),candidate.assets.find(x=>x.path===path).sha256,path);}
 await save(`admin-verified-${Date.now()}`,{at:new Date().toISOString(),deployment:p.canonical_deployment.id,url:p.canonical_deployment.url,rollback:candidate.baseline,exactLiveAssets:true,publicSiteUnchanged:true});
 console.log('Exact business admin integration is live; public site unchanged.');
}
