// Patch exact deployed artifacts only. No application/relay/alarm/session behavior change.
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root='test-results/performance-diagnostics-20260928';
const ref='tvixsmqxotuvyjqzmjla';
const read=async p=>(await readFile(p,'utf8')).replaceAll('\r\n','\n');
const json=async p=>JSON.parse(await read(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(p,v)=>writeFile(`${root}/${p}`,typeof v==='string'?v:JSON.stringify(v,null,2),{flag:'wx'});
const cli=args=>{const out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{encoding:'utf8',timeout:60000,maxBuffer:5e6});return JSON.parse(out.slice(out.indexOf('{')));};
const functions=()=>cli(['functions','list','--project-ref',ref,'--output-format','json']).functions;
const query=file=>cli(['db','query','--linked','--file',file,'--output-format','json']).rows;
const omit=(o,ks)=>Object.fromEntries(Object.entries(o).filter(([k])=>!ks.includes(k)));
async function api(path,init={}) {
 const token=(await read('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
 const r=await fetch('https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09'+path,{...init,headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});assert.ok(r.ok,`${path}: ${r.status}`);return r;
}
async function cloud() {
 const base='/workers/scripts/doji-orchestrator';
 const settings=(await(await api(base+'/settings')).json()).result;
 for(const b of settings.bindings??[])if(b.type==='secret_text')assert.equal(b.text,undefined);
 const form=await(await api(base+'/content/v2')).formData();const files=[...form.values()].filter(x=>typeof x!=='string');assert.equal(files.length,1);assert.equal(files[0].name,'index.js');
 const source=await files[0].text();
 const schedules=(await(await api(base+'/schedules')).json()).result;
 const deployments=(await(await api(base+'/deployments')).json()).result;
 const pages=(await(await api('/pages/projects/doji-admin')).json()).result;
 return {settings,schedules,deployments,pagesId:pages.canonical_deployment?.id,source,sha256:hash(source)};
}
function windowCheck(){const w=query('scripts/portal-editorial-release-window.sql')[0].release_window;assert.equal(w.active,0);assert.equal(w.overdue,0);assert.equal(w.locks,0);assert.ok(w.next&&Date.parse(w.next)>Date.parse(w.at)+25*60000);}
async function inventory(dir,prefix=''){const out=[];for(const e of await readdir(dir,{withFileTypes:true}))out.push(...e.isDirectory()?await inventory(`${dir}/${e.name}`,prefix+e.name+'/'):[prefix+e.name]);return out;}
const mode=process.argv[2];assert.ok(['prepare','deploy-email','deploy-worker','verify'].includes(mode));
assert.equal((await read('supabase/.temp/project-ref')).trim(),ref);
await mkdir(root,{recursive:true});
if(mode==='prepare') {
 const c=await cloud();await save('cloud-before.json',omit(c,['source']));await save('worker-baseline.js',c.source);
 const replacements=[['"realtime-provider-or-network"','"publication-or-database-acknowledgement"'],['"relay-wake-or-supabase-edge"','"relay-or-publication-path"']];
 let candidate=c.source;for(const [before,after] of replacements){assert.equal(candidate.split(before).length,2,`one exact ${before}`);candidate=candidate.replace(before,after);}
 let restored=candidate;for(const [before,after] of replacements)restored=restored.replace(after,before);assert.equal(restored,c.source);
 const fn=candidate.match(/function actionableOperationalIssue\(health\) \{[\s\S]*?\n\}/)?.[0];assert.ok(fn);
 const classify=new Function(fn+';return actionableOperationalIssue;')();
 assert.equal(classify({outbox_overdue:0,outbox_exhausted:0,realtime_max_ms_5m:31000,realtime_max_publish_attempts_5m:2}).diagnostics.suspected_layer,'publication-or-database-acknowledgement');
 assert.equal(classify({realtime_sample_count_5m:1,realtime_p95_ms_5m:6000}),null);
 await save('worker-candidate.js',candidate);await save('worker-patch.json',{replacements,baseline:c.sha256,candidate:hash(candidate)});
 const fs=functions();assert.equal(fs.find(x=>x.slug==='send-admin-email').verify_jwt,false);await save('functions-before.json',fs);
 await cp(`${root}/baseline`,`${root}/candidate`,{recursive:true});
 const path='supabase/functions/send-admin-email/index.ts';const before=await read(`${root}/baseline/${path}`);const local=await read(path);
 const start=s=>s.indexOf('function operationalGuidance(');const end=s=>s.indexOf("  if (issueFamily === 'domain-outbox-delayed'",start(s));
 assert.ok(start(before)>0&&end(before)>start(before)&&start(local)>0&&end(local)>start(local));
 const after=before.slice(0,start(before))+local.slice(start(local),end(local))+before.slice(end(before));
 assert.equal(after.replace(local.slice(start(local),end(local)),before.slice(start(before),end(before))),before);
 await writeFile(`${root}/candidate/${path}`,after);
 const config='project_id = "performance-diagnostics-release"\n[functions.send-admin-email]\nverify_jwt = false\n';
 await writeFile(`${root}/candidate/supabase/config.toml`,config);await writeFile(`${root}/baseline/supabase/config.toml`,config);
 const assets=[];for(const p of await inventory(`${root}/candidate`)) {const data=await readFile(`${root}/candidate/${p}`);if(p!==path)assert.equal(hash(data),hash(await readFile(`${root}/baseline/${p}`)));assets.push({path:p,sha256:hash(data)});}
 await save('email-candidate.json',{assets,indexBaseline:hash(before),indexCandidate:hash(after)});
 console.log('Exact live artifacts prepared: Worker changes two diagnostic labels; email changes realtime guidance only. All dependencies/settings preserved.');
} else if(mode==='deploy-email') {
 assert.equal(process.argv[3],'--deploy-reviewed-artifact');windowCheck();
 assert.deepEqual(functions(),await json(`${root}/functions-before.json`));
 const m=await json(`${root}/email-candidate.json`);for(const a of m.assets)assert.equal(hash(await readFile(`${root}/candidate/${a.path}`)),a.sha256);
 await save('email-upload-started.json',{at:new Date().toISOString()});
 const out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','functions','deploy','send-admin-email','--project-ref',ref,'--use-api','--workdir',`${root}/candidate`],{encoding:'utf8',timeout:60000,maxBuffer:2e6});await save('email-upload-output.txt',out);console.log(out);
} else if(mode==='deploy-worker') {
 assert.equal(process.argv[3],'--deploy-reviewed-artifact');windowCheck();const b=await json(`${root}/cloud-before.json`);const c=await cloud();assert.deepEqual(omit(c,['source']),b);
 const patch=await json(`${root}/worker-patch.json`),source=await read(`${root}/worker-candidate.js`);assert.equal(hash(source),patch.candidate);
 const s=c.settings;const metadata={main_module:'index.js',compatibility_date:s.compatibility_date,compatibility_flags:s.compatibility_flags,bindings:s.bindings.filter(b=>b.type!=='secret_text'),keep_bindings:['secret_text'],usage_model:s.usage_model,logpush:s.logpush,observability:s.observability,tags:s.tags,tail_consumers:s.tail_consumers,placement:s.placement};
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set('index.js',new Blob([source],{type:'application/javascript+module'}),'index.js');
 await save('worker-upload-started.json',{at:new Date().toISOString()});
 const result=await(await api('/workers/scripts/doji-orchestrator',{method:'PUT',body:form})).json();assert.equal(result.success,true);await save('worker-upload-result.json',{at:new Date().toISOString(),success:true});
 console.log('Uploaded reviewed diagnostic-label-only Worker artifact.');
} else {
 const c=await cloud(),b=await json(`${root}/cloud-before.json`),patch=await json(`${root}/worker-patch.json`);assert.equal(c.sha256,patch.candidate);assert.deepEqual(c.settings,b.settings);assert.deepEqual(c.schedules,b.schedules);assert.equal(c.pagesId,b.pagesId);
 const fs=functions(),before=await json(`${root}/functions-before.json`);assert.deepEqual(fs.filter(x=>x.slug!=='send-admin-email'),before.filter(x=>x.slug!=='send-admin-email'));
 const email=fs.find(x=>x.slug==='send-admin-email');assert.equal(email.verify_jwt,false);assert.equal(email.status,'ACTIVE');assert.ok(email.version>before.find(x=>x.slug===email.slug).version);
 await mkdir(`${root}/verified`,{recursive:true});cli(['functions','download','send-admin-email','--project-ref',ref,'--use-api','--workdir',`${root}/verified`]);
 const m=await json(`${root}/email-candidate.json`);for(const a of m.assets.filter(x=>x.path!=='supabase/config.toml'))assert.equal(hash(await read(`${root}/verified/${a.path}`)),hash(await read(`${root}/candidate/${a.path}`)),a.path);
 const checks=query('scripts/portal-triage-member-canary.sql');const health=query('scripts/performance-maintenance-read.sql')[0].maintenance;
 const result={at:new Date().toISOString(),worker:c.deployments,emailVersion:email.version,pagesUnchanged:c.pagesId,otherFunctionsUnchanged:true,bindingsSchedulesPreserved:true,checks,pendingDue:health.pending_due,health:health.health};await save('verified.json',result);console.log(JSON.stringify(result));
}
