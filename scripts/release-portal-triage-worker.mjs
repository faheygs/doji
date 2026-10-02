// Explicit approved production action. Never retry an uncertain upload automatically.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const editorial=process.argv.includes('--editorial');
const root=editorial?'test-results/portal-editorial-release-20260927':'test-results/portal-triage-release-20260927';
assert.equal(process.argv[2],'--deploy-reviewed-artifact');
const read=async p=>readFile(`${root}/${p}`,'utf8');
const settings=JSON.parse(await read('worker-settings.json'));
const expected=JSON.parse(await read('worker-patch.json'));
const source=await read('worker-candidate.js');
const hash=b=>createHash('sha256').update(b).digest('hex');
assert.equal(hash(source),expected.candidate);
assert.equal(hash(source.replace(expected.addition,'').replace(expected.guard,'')),expected.baseline);
const db=JSON.parse(await read('database-after.json'));
assert.ok(db.functions['get_admin_report_case_v3(uuid)']&&db.functions['get_admin_appeal_case_v1(uuid)']);
if(editorial)assert.ok(db.functions['admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)']);
if(editorial){
 assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),'tvixsmqxotuvyjqzmjla');
 const raw=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file','scripts/portal-editorial-release-window.sql'],{encoding:'utf8',timeout:30000});
 const window=JSON.parse(raw.slice(raw.indexOf('{'))).rows[0].release_window;
 assert.equal(window.active,0);assert.equal(window.overdue,0);assert.equal(window.locks,0);
 assert.ok(window.next&&Date.parse(window.next)>Date.parse(window.at)+25*60000,'Safe event window required');
}
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
const api='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09/workers/scripts/doji-orchestrator';
async function get(path){const r=await fetch(api+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`Read ${path} ${r.status}`);return r;}
assert.deepEqual((await (await get('/settings')).json()).result,settings,'Live settings drift');
const form=await (await get('/content/v2')).formData();
const module=[...form.values()].find(x=>typeof x!=='string'&&x.name==='index.js');assert.ok(module);
assert.equal(hash(Buffer.from(await module.arrayBuffer())),expected.baseline,'Live source drift');
const before=JSON.parse(await read('cloudflare-before.json'));
assert.deepEqual((await (await get('/schedules')).json()).result,before.schedules,'Schedule drift');
const metadata={main_module:'index.js',compatibility_date:settings.compatibility_date,compatibility_flags:settings.compatibility_flags,
 bindings:settings.bindings.filter(b=>b.type!=='secret_text'),keep_bindings:['secret_text'],
 usage_model:settings.usage_model,logpush:settings.logpush,observability:settings.observability,
 tags:settings.tags,tail_consumers:settings.tail_consumers,placement:settings.placement};
// Existing namespace IDs are retained. No migrations, new bindings/resources,
// secret values, routes, schedules or usage limits are sent.
const upload=new FormData();upload.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));
upload.set('index.js',new Blob([source],{type:'application/javascript+module'}),'index.js');
await writeFile(`${root}/worker-upload-started.json`,JSON.stringify({at:new Date().toISOString(),candidate:expected.candidate}),{flag:'wx'});
const response=await fetch(api,{method:'PUT',headers:{authorization:`Bearer ${token}`},body:upload,signal:AbortSignal.timeout(45000)});
const result=await response.json();assert.ok(response.ok&&result.success,`Upload failed: ${response.status} ${JSON.stringify(result.errors)}`);
const afterSettings=(await (await get('/settings')).json()).result;
for(const field of ['bindings','compatibility_date','compatibility_flags','usage_model','logpush','observability','tags','tail_consumers','placement'])assert.deepEqual(afterSettings[field],settings[field],`Preserved ${field}`);
const after=await (await get('/content/v2')).formData();const file=[...after.values()].find(x=>typeof x!=='string'&&x.name==='index.js');
assert.equal(hash(Buffer.from(await file.arrayBuffer())),expected.candidate);
assert.deepEqual((await (await get('/schedules')).json()).result,before.schedules);
const deployments=(await (await get('/deployments')).json()).result;
const receipt={verifiedAt:new Date().toISOString(),deployments,sha256:expected.candidate,allPreexistingCodeUnchanged:true,bindingsSettingsSchedulesPreserved:true};
await writeFile(`${root}/worker-released.json`,JSON.stringify(receipt,null,2));
console.log(JSON.stringify(receipt,null,2));
