// Assemble only the owner-approved portal changes, preserving the deployed site.
import assert from 'node:assert/strict';
import {readFile,writeFile,cp} from 'node:fs/promises';
import {root,cf,hash,inventory,save} from './prepare-safety-launch.mts';
import {readBrowserSource} from '../website/browser-source.mts';
import { evidenceRecord, evidenceAssets, type PagesReleaseProject } from './release-evidence.mts';
const baseline='test-results/editorial-drawer-release-20260927/site';
const recorded={assets:evidenceAssets(evidenceRecord(JSON.parse(await readFile('test-results/editorial-drawer-release-20260927/candidate.json','utf8'))).assets)};
assert.deepEqual(await inventory(baseline),recorded.assets.sort((a,b)=>a.path.localeCompare(b.path)));
const pages=evidenceRecord(JSON.parse(await readFile(`${root}/pages-before.json`,'utf8')));
const current=await cf<PagesReleaseProject>('/pages/projects/doji-admin');
assert.ok(current.canonical_deployment);
assert.equal(current.canonical_deployment.id,evidenceRecord(evidenceRecord(pages['doji-admin']).canonical_deployment).id);
for(const path of ['index.html','admin-portal/admin-app-20260927ideas4.js','portal.css','admin-portal/admin.css','employee-setup/config.js']){
 const r:Response=await fetch(`${current.canonical_deployment.url}/${path}`,{signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(await readFile(`${baseline}/${path}`)),path);
}
await cp(baseline,`${root}/admin`,{recursive:true,force:false,errorOnExist:true});
const old=await readFile(`${baseline}/admin-portal/admin-app-20260927ideas4.js`,'utf8');
const configMatch=old.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\((\{[\s\S]*?\})\);/);
assert.ok(configMatch?.[1], 'Missing preserved portal config');
const config=evidenceRecord(JSON.parse(configMatch[1]));
assert.equal(config.mode,'live');assert.equal(config.employeeAccountsEnabled,true);
config.safetyRemovalEnabled=true;
const sources=['admin-portal/health-model.js','admin-portal/live-client.js','admin-portal/contextual-help.js','admin-portal/editorial.js','admin-portal/safety-removal.js','portal-select.js','portal.js'];
const bundle=`window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify(config,null,2)});\n`+sources.map(readBrowserSource).join('\n')+'\n';
await writeFile(`${root}/admin/admin-portal/admin-app-20260929safety1.js`,bundle,{flag:'wx'});
for(const path of ['index.html','admin-portal/index.html']){
 let html=await readFile(`${baseline}/${path}`,'utf8');
 assert.equal(html.split('admin-app-20260927ideas4.js').length,2);
 html=html.replace('admin-app-20260927ideas4.js','admin-app-20260929safety1.js').replace(/(portal\.css|admin\.css)\?v=[^"\s]+/g,'$1?v=20260929safety1');
 await writeFile(`${root}/admin/${path}`,html);
}
for(const path of ['portal.css','admin-portal/admin.css'])await cp(`website/${path}`,`${root}/admin/${path}`);
const assets=await inventory(`${root}/admin`);
const changed=assets.filter(v=>recorded.assets.find(b=>b.path===v.path)?.sha256!==v.sha256).map(v=>v.path);
assert.deepEqual(changed.sort(),['index.html','admin-portal/index.html','admin-portal/admin-app-20260929safety1.js','portal.css','admin-portal/admin.css'].sort());
await save('admin-candidate.json',{at:new Date().toISOString(),baseline:current.canonical_deployment.id,assets,changed,sourceHashes:sources.map(path=>({path,sha256:hash(readBrowserSource(path))})),preservedConfig:{...config,supabaseAnonKey:'public key preserved'},deploymentReady:true});
console.log('Exact portal candidate assembled; only five approved assets differ; old assets and setup preserved.');
