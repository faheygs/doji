import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='test-results/portal-queue-health-release';
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(token);
const account='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09';
async function get(path){const r=await fetch(account+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`Provider read ${r.status}`);return r;}
const hash=b=>createHash('sha256').update(b).digest('hex');
const settings=(await (await get('/workers/scripts/doji-orchestrator/settings')).json()).result;
const baseline=JSON.parse(await readFile('test-results/employee-access-release/worker-settings.json','utf8'));
for(const b of baseline.bindings)assert.deepEqual(settings.bindings.find(x=>x.name===b.name),b,`Binding preserved: ${b.name}`);
assert.equal(settings.bindings.find(x=>x.name==='ADMIN_PORTAL_EMPLOYEE_ACCOUNTS')?.text,'true');
const form=await (await get('/workers/scripts/doji-orchestrator/content/v2')).formData();
const module=[...form.values()].find(x=>typeof x!=='string'&&x.name==='index.js');assert.ok(module);
assert.equal(hash(Buffer.from(await module.arrayBuffer())),hash(await readFile('test-results/employee-access-release/worker/index.js')),'Worker code unchanged');
const schedules=(await (await get('/workers/scripts/doji-orchestrator/schedules')).json()).result;
assert.deepEqual(schedules.schedules.map(x=>x.cron),['*/1 * * * *']);
const deployments=(await (await get('/workers/scripts/doji-orchestrator/deployments')).json()).result;
const project=(await (await get('/pages/projects/doji-admin')).json()).result;
const result={verifiedAt:new Date().toISOString(),workerCodeUnchanged:true,bindingsPreserved:true,cronUnchanged:true,
 workerDeployment:deployments.deployments?.[0]??deployments[0]??null,pagesDeployment:project.canonical_deployment?.id};
if(process.argv.includes('--site')){
 const release=JSON.parse(await readFile(`${root}/release.json`,'utf8'));
 for(const path of [...release.changed,'employee-setup/config.js','employee-setup/setup.js']){
  const r=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
  assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),hash(await readFile(`${root}/site/${path}`)),path);
 }
 result.exactPortalAssets=true;
}
const denied=await fetch('https://doji-orchestrator.faheygs.workers.dev/portal/admin/session',{headers:{origin:'https://admin.dojipro.com'}});
assert.equal(denied.status,401);result.unauthenticatedDenied=true;
await mkdir(root,{recursive:true});await writeFile(`${root}/live-verification.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
