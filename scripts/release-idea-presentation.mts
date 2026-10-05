import {readBrowserSource} from '../website/browser-source.mts';
// Portal-only release: exact prior live artifact plus editorial presentation.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import type {BinaryLike} from 'node:crypto';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceAssets,evidenceText} from './release-evidence.mts';
const form=process.argv.includes('--form');
const drawer=process.argv.includes('--drawer');
assert.ok(!(form&&drawer));
const root=drawer?'test-results/editorial-drawer-release-20260927':form?'test-results/idea-form-release-20260927':'test-results/idea-presentation-release-20260927';
const prior=drawer?'test-results/idea-form-release-20260927':form?'test-results/idea-presentation-release-20260927':'test-results/idea-retriage-release-20260927';
const priorManifest=form||drawer?'candidate.json':'site-candidate.json';
const mode=process.argv[2];
assert.ok(mode&&['prepare','deploy','verify'].includes(mode));
const hash=(b:BinaryLike)=>createHash('sha256').update(b).digest('hex');
const read=(p:string)=>readFile(p,'utf8');
const json=async (p:string)=>evidenceRecord(JSON.parse(await read(p)));
const save=(p:string,v:unknown)=>writeFile(`${root}/${p}`,JSON.stringify(v,null,2),{flag:'wx'});
const account='04eab92db3126696f42644ede0943a09';
async function api(path:string){
 const token=(await read('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(20000)});assert.ok(r.ok,`${path}: ${r.status}`);return r;
}
async function infrastructure():Promise<Record<string,unknown>>{
 const worker='/workers/scripts/doji-orchestrator';
 const settings=evidenceAt(await(await api(worker+'/settings')).json(),'result');
 for(const b of evidenceArray(settings.bindings??[]))if(b.type==='secret_text')assert.equal(b.text,undefined);
 const schedules=(await(await api(worker+'/schedules')).json()).result;
 const deployments=(await(await api(worker+'/deployments')).json()).result;
 return {settings,schedules,deployments};
}
async function pageState(){const p=evidenceAt(await(await api('/pages/projects/doji-admin')).json(),'result','canonical_deployment');return {id:evidenceText(p.id),url:evidenceText(p.url)};}
async function verifyAssets(manifest:Record<string,unknown>){for(const a of evidenceAssets(manifest.assets).filter(a=>a.path!=='_headers')){const r=await fetch('https://admin.dojipro.com/'+a.path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),a.sha256,a.path);if(a.path==='index.html')for(const[k,v]of Object.entries(evidenceRecord(manifest.headers)))assert.equal(r.headers.get(k),v);}}
async function inventory(dir:string,prefix=''):Promise<string[]>{const result:string[]=[];for(const e of await readdir(dir,{withFileTypes:true}))result.push(...e.isDirectory()?await inventory(`${dir}/${e.name}`,prefix+e.name+'/'):[prefix+e.name]);return result;}
await mkdir(root,{recursive:true});
if(mode==='prepare'){
 await assert.rejects(access(`${root}/upload-started.json`),{code:'ENOENT'});
 const old=await json(`${prior}/${priorManifest}`);await verifyAssets(old);
 const infra=await infrastructure();const baseline=form||drawer?evidenceAt(await json(`${prior}/before.json`),'infra'):await json(`${prior}/worker-released.json`);
 for(const key of Object.keys(infra))assert.deepEqual(infra[key],baseline[key]);
 const page=await pageState();assert.equal(page.id,drawer?'ea70496a-c660-40f2-87d5-da3feaa7d27c':form?'03fa0921-aa31-46f8-8c2e-615334d7a7f6':'749b0f47-b199-4beb-80cd-164f252aa342');
 await writeFile(`${root}/before.json`,JSON.stringify({infra,page},null,2));
 for(const a of evidenceAssets(old.assets))assert.equal(hash(await readFile(`${prior}/site/${a.path}`)),a.sha256);
 await cp(`${prior}/site`,`${root}/site`,{recursive:true});
 const oldName=`admin-portal/admin-app-20260927ideas${drawer?3:form?2:1}.js`,newName=`admin-portal/admin-app-20260927ideas${drawer?4:form?3:2}.js`;
 const bundle=await read(`${prior}/site/${oldName}`),source=(readBrowserSource('admin-portal/editorial.js')).replaceAll('\r\n','\n');
 const begin=bundle.indexOf(evidenceText(source.split('\n')[0])),end=bundle.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');assert.ok(begin>0&&end>begin);
 await writeFile(`${root}/site/${newName}`,bundle.slice(0,begin)+source+'\n'+bundle.slice(end));
 for(const p of ['index.html','admin-portal/index.html']){const html=await read(`${prior}/site/${p}`);assert.equal(html.split(oldName).length,2);await writeFile(`${root}/site/${p}`,html.replace(oldName,newName).replace(`admin.css?v=20260927ideas${drawer?3:1}`,`admin.css?v=20260927ideas${drawer?4:form?3:1}`));}
 const changes=['index.html','admin-portal/index.html',newName];
 if(form||drawer){
  const marker=drawer?'/* Editorial records use the existing admin side-drawer presentation. */':'/* Original submission review form: shared fields, never editable source data. */';
  const css=await read('website/admin-portal/admin.css'),start=css.indexOf(marker);assert.ok(start>0);
  const delta=evidenceText(css.slice(start).split('\n\n')[0]);assert.equal(delta.split('\n').filter(line=>line.trim()).length,drawer?6:5);
  const path='admin-portal/admin.css';await writeFile(`${root}/site/${path}`,(await read(`${prior}/site/${path}`))+'\n'+delta);changes.push(path);
 }
 for(const a of evidenceAssets(old.assets).filter(a=>!changes.includes(a.path)))assert.equal(hash(await readFile(`${root}/site/${a.path}`)),a.sha256,a.path);
 const assets=await Promise.all((await inventory(`${root}/site`)).map(async path=>({path,sha256:hash(await readFile(`${root}/site/${path}`))})));
 await writeFile(`${root}/candidate.json`,JSON.stringify({assets,changes,headers:old.headers},null,2));
 console.log('Prepared portal-only artifact; all prior public assets verified. No deployment.');
}else if(mode==='deploy'){
 assert.equal(process.argv[3],'--deploy-tested-portal-only');
 const before=await json(`${root}/before.json`);assert.deepEqual(await infrastructure(),before.infra);assert.deepEqual(await pageState(),before.page);
 const m=await json(`${root}/candidate.json`);await verifyAssets(await json(`${prior}/${priorManifest}`));
 for(const a of evidenceAssets(m.assets))assert.equal(hash(await readFile(`${root}/site/${a.path}`)),a.sha256);
 assert.ok(!evidenceAssets(m.assets).some(a=>a.path.includes('_worker')||a.path.startsWith('functions/')));
 await save('upload-started.json',{at:new Date().toISOString()});
 const result=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message',drawer?'Consistent editorial record drawers':form?'Structured original submission review form':'Readable original community submission review','--no-bundle'],{encoding:'utf8',timeout:120000,maxBuffer:1e6,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
 await writeFile(`${root}/upload-output.txt`,result,{flag:'wx'});console.log(result);
}else{
 const m=await json(`${root}/candidate.json`),before=await json(`${root}/before.json`);
 await verifyAssets(m);assert.deepEqual(await infrastructure(),before.infra);
 const page=await pageState();assert.notEqual(page.id,evidenceAt(before,'page').id);
 const result={at:new Date().toISOString(),page,publicAssets:evidenceAssets(m.assets).length-1,sharedInfrastructureUnchanged:true};
 await save('verified.json',result);console.log(JSON.stringify(result));
}
