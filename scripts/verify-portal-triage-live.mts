import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {BinaryLike} from 'node:crypto';
import {evidenceRecord,evidenceAssets} from './release-evidence.mts';
const editorial=process.argv.includes('--editorial');
const root=editorial?'test-results/portal-editorial-release-20260927':'test-results/portal-triage-release-20260927';
const rawCandidate=evidenceRecord(JSON.parse(await readFile(`${root}/site-candidate.json`,'utf8')));
const candidate={assets:evidenceAssets(rawCandidate.assets),headers:evidenceRecord(rawCandidate.headers)};
const hash=(b:BinaryLike)=>createHash('sha256').update(b).digest('hex');
for(const asset of candidate.assets.filter(x=>x.path!=='_headers')){
 const r=await fetch('https://admin.dojipro.com/'+asset.path,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200,asset.path);assert.equal(hash(Buffer.from(await r.arrayBuffer())),asset.sha256,asset.path);
 if(asset.path==='index.html')for(const [key,value] of Object.entries(candidate.headers))assert.equal(r.headers.get(key),value,`Header ${key}`);
}
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
const api='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09';
async function get(path:string){const r=await fetch(api+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`Read ${path}: ${r.status}`);return r;}
const project=(await (await get('/pages/projects/doji-admin')).json()).result;
const settings=(await (await get('/workers/scripts/doji-orchestrator/settings')).json()).result;
const before=JSON.parse(await readFile(`${root}/worker-settings.json`,'utf8'));
for(const key of ['bindings','compatibility_date','compatibility_flags','usage_model','observability','logpush','tags','tail_consumers','placement'])assert.deepEqual(settings[key],before[key],key);
const form=await (await get('/workers/scripts/doji-orchestrator/content/v2')).formData();
const file=[...form.values()].find(x=>typeof x!=='string'&&x.name==='index.js');
assert.ok(file && typeof file!=='string','Missing deployed Worker module');
assert.equal(hash(Buffer.from(await file.arrayBuffer())),hash(await readFile(`${root}/worker-candidate.js`)));
const schedule=(await (await get('/workers/scripts/doji-orchestrator/schedules')).json()).result;
assert.deepEqual(schedule,JSON.parse(await readFile(`${root}/cloudflare-before.json`,'utf8')).schedules);
for(const route of ['session','report-case-v3?id=22222222-2222-4222-8222-222222222222','appeal-case?id=22222222-2222-4222-8222-222222222222',...(editorial?['editorial-page?kind=announcements','editorial-item?kind=suggestions&id=22222222-2222-4222-8222-222222222222','editorial-command']:[])]){
 const command=route==='editorial-command';
 const r=await fetch('https://doji-orchestrator.faheygs.workers.dev/portal/admin/'+route,{method:command?'POST':'GET',headers:{origin:'https://admin.dojipro.com',...(command?{'content-type':'application/json'}:{})},...(command?{body:'{}'}:{}),signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,401,route);
}
const receipt={verifiedAt:new Date().toISOString(),pagesDeployment:project.canonical_deployment?.id,productionBranch:project.production_branch,
 exactAssetCount:candidate.assets.length-1,securityHeadersVerified:true,workerExact:true,bindingsSchedulesSettingsPreserved:true,unauthenticatedDenied:true};
await writeFile(`${root}/live-verified.json`,JSON.stringify(receipt,null,2));console.log(JSON.stringify(receipt,null,2));
