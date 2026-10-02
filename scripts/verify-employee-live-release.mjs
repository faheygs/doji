import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='test-results/employee-access-release';
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(token);
const account='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09';
async function get(path){const r=await fetch(account+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`Provider read ${r.status}`);return r;}
const project=(await (await get('/pages/projects/doji-admin')).json()).result;
if(process.argv[2]==='branch'){console.log(JSON.stringify({productionBranch:project.production_branch,liveDeployment:project.canonical_deployment?.id}));}else{
const hash=b=>createHash('sha256').update(b).digest('hex');
const settings=(await (await get('/workers/scripts/doji-orchestrator/settings')).json()).result;
const before=JSON.parse(await readFile(`${root}/worker-settings.json`,'utf8'));
for(const binding of before.bindings){
 const next=settings.bindings.find(b=>b.name===binding.name);
 assert.deepEqual(next,binding,`Preserved binding ${binding.name}`);
}
assert.equal(settings.bindings.find(b=>b.name==='ADMIN_PORTAL_EMPLOYEE_ACCOUNTS')?.text,'true');
const form=await (await get('/workers/scripts/doji-orchestrator/content/v2')).formData();
const module=[...form.values()].find(x=>typeof x!=='string'&&x.name==='index.js');assert.ok(module);
assert.equal(hash(Buffer.from(await module.arrayBuffer())),hash(await readFile(`${root}/worker/index.js`)),'Exact Worker bundle');
const schedules=(await (await get('/workers/scripts/doji-orchestrator/schedules')).json()).result;
assert.deepEqual(schedules.schedules.map(s=>s.cron),['*/1 * * * *'],'Existing cron unchanged');
const html=await (await fetch('https://admin.dojipro.com/?v=20260926employee1',{cache:'no-store'})).text();
assert.ok(html.includes('/admin-portal/admin-app-20260926employee1.js'));
for(const path of ['admin-portal/admin-app-20260926employee1.js','employee-setup/setup.js','employee-setup/config.js']){
 const result=await fetch('https://admin.dojipro.com/'+path,{cache:'no-store'});assert.equal(result.status,200);
 assert.equal(hash(Buffer.from(await result.arrayBuffer())),hash(await readFile(`${root}/site/${path}`)),`Exact live ${path}`);
}
const denied=await fetch('https://doji-orchestrator.faheygs.workers.dev/portal/admin/session',{headers:{origin:'https://admin.dojipro.com'}});
assert.equal(denied.status,401);
const record={verifiedAt:new Date().toISOString(),pagesDeployment:project.canonical_deployment?.id,
 workerVersion:'e326d2cf-55d0-4cc5-932b-4a8c10600362',preservedBindings:before.bindings.map(b=>b.name),
 cronUnchanged:true,exactSiteAndWorker:true,unauthenticatedDenied:true};
await writeFile(`${root}/live-verification.json`,JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
}
