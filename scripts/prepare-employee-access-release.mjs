// Build only approved employee access changes on the captured production baseline.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
const root='test-results/employee-access-release', site=join(root,'site');
const read=async path=>(await readFile(path,'utf8')).replaceAll('\r\n','\n');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,`Exact release patch: ${a.slice(0,90)}`);return s.replace(a,b);};
const hash=source=>createHash('sha256').update(source).digest('hex');
await mkdir(site,{recursive:true});
const manifest=JSON.parse(await read('test-results/employee-onboarding-release/baseline-manifest.json'));
const paths=[...new Set([...manifest.map(x=>x.path),'admin-portal/admin-app-20260926onboarding1.js',
  ...['index.html','setup.js','setup.css','return.js','config.js'].map(x=>'employee-setup/'+x)])];
const baseline=[];
for(const path of paths){
  const response=await fetch(`https://admin.dojipro.com/${path}`,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,path);
  const bytes=Buffer.from(await response.arrayBuffer());
  await mkdir(dirname(join(site,path)),{recursive:true});await writeFile(join(site,path),bytes);
  baseline.push({path,sha256:hash(bytes)});
}
let bundle=await read(join(site,'admin-portal/admin-app-20260926onboarding1.js'));
const config=JSON.parse(bundle.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\(([\s\S]*?)\);/)[1]);
assert.notEqual(config.employeeAccountsEnabled,true);
bundle=bundle.replace(/window.DOJI_PORTAL_CONFIG = Object.freeze\([\s\S]*?\);/,
  `window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify({...config,employeeAccountsEnabled:true},null,2)});`);
const clientStart=bundle.indexOf("(() => {\n  const storageKey = 'doji-admin-session-v1';");
const clientEnd=bundle.indexOf('/* Portal-only progressive disclosure.',clientStart);
const runtimeStart=bundle.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');
assert.ok(clientStart>0&&clientEnd>clientStart&&runtimeStart>clientEnd);
// Health, help and every unrelated bundled component remain byte-for-byte equal.
bundle=bundle.slice(0,clientStart)+(await read('website/admin-portal/live-client.js'))+'\n'
  +bundle.slice(clientEnd,runtimeStart)+(await read('website/portal.js'))+'\n';
const bundleName='admin-portal/admin-app-20260926employee1.js';
await writeFile(join(site,bundleName),bundle);
// The source/live HTML difference was reviewed: employee controls + bundle URL only.
const html=(await read('website/admin-portal/index.html')).replace('/admin-portal/admin-app-20260925ap.js',`/${bundleName}`);
for(const file of ['index.html','admin-portal/index.html'])await writeFile(join(site,file),html);
await cp('website/employee-setup',join(site,'employee-setup'),{recursive:true});
await writeFile(join(site,'employee-setup/config.js'),`window.DOJI_EMPLOYEE_SETUP_CONFIG = Object.freeze(${JSON.stringify({supabaseUrl:config.supabaseUrl,supabaseAnonKey:config.supabaseAnonKey,employeePortalEnabled:true})});\n`);
await cp('website/_headers',join(site,'_headers'));
await writeFile(join(site,'_headers'),(await read(join(site,'_headers')))+'\n/employee-setup/*\n  Cache-Control: no-store\n');
for(const asset of baseline.filter(x=>!['index.html','admin-portal/index.html'].includes(x.path)&&!x.path.startsWith('employee-setup/')))
  assert.equal(hash(await readFile(join(site,asset.path))),asset.sha256,`Unrelated asset preserved: ${asset.path}`);
await writeFile(join(root,'site-baseline.json'),JSON.stringify(baseline,null,2));

// Keep existing member validator wrapper and every non-portal call unchanged.
let worker=await read(join(root,'live-index.js'));
worker=once(worker,'async function authenticateScaleReadRequest(request, env) {',
  'async function authenticateScaleReadRequest(request, env) {\n  return authenticateRole(request, env, "authenticated");\n}\nasync function authenticateEmployeePortalRequest(request, env) {\n  return authenticateRole(request, env, "doji_employee");\n}\nasync function authenticateRole(request, env, requiredRole) {');
worker=once(worker,'payload.role !== "authenticated"','payload.role !== requiredRole');
const portalStart=worker.indexOf('async function handlePortalRead('),portalEnd=worker.indexOf('__name(handlePortalRead,',portalStart);
assert.ok(portalStart>0&&portalEnd>portalStart);
let portal=worker.slice(portalStart,portalEnd);
portal=once(portal,'const auth = await authenticateScaleReadRequest(request, env);',
  'const employeeMode = env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS === "true";\n    const auth = await (employeeMode ? authenticateEmployeePortalRequest : authenticateScaleReadRequest)(request, env);\n    if (employeeMode && route?.rpc === "get_admin_operator_directory_v1") route.rpc = "get_admin_employee_directory_v1";\n    if (employeeMode && route?.rpc === "admin_set_operator_role_v1") route.rpc = "admin_set_employee_role_v1";');
worker=worker.slice(0,portalStart)+portal+worker.slice(portalEnd);
await writeFile(join(root,'worker-employee.js'),worker);
await mkdir(join(root,'worker'),{recursive:true});
await writeFile(join(root,'worker/index.js'),worker);
const settings=JSON.parse(await read(join(root,'worker-settings.json')));
const wrangler={name:'doji-orchestrator',main:'index.js',compatibility_date:settings.compatibility_date,
  compatibility_flags:settings.compatibility_flags,workers_dev:true,preview_urls:false,
  vars:Object.fromEntries(settings.bindings.filter(b=>b.type==='plain_text').map(b=>[b.name,b.text])),
  durable_objects:{bindings:settings.bindings.filter(b=>b.type==='durable_object_namespace').map(b=>({name:b.name,class_name:b.class_name}))},
  observability:settings.observability};
delete wrangler.observability.redact_query_string;
wrangler.migrations=[
 {tag:'v1',new_sqlite_classes:['DojiEventAlarm']},{tag:'v2',new_sqlite_classes:['OutboxRelayAlarm']},
 {tag:'v3',new_sqlite_classes:['DataMaintenanceAlarm']},{tag:'v4',new_sqlite_classes:['PushFanoutAlarm']},
 {tag:'v5',new_sqlite_classes:['HealthMonitor']}];
wrangler.vars.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS='true';
await writeFile(join(root,'worker/wrangler.json'),JSON.stringify(wrangler,null,2));
// Exact four-line admin capability reduction; no member behavior or provider change.
const functionRoot=join(root,'realtime-baseline/supabase/functions/realtime-token');
const liveFunction=await read(join(functionRoot,'index.ts'));
const patched=once(liveFunction,"const capability: Record<string, string[]> = {\n    'doji:global'",
  "const capability: Record<string, string[]> = adminRequest ? {\n    'doji:global': ['subscribe'],\n  } : {\n    'doji:global'");
assert.equal(patched,await read('supabase/functions/realtime-token/index.ts'),'Exact reviewed realtime patch');
await cp(join(root,'realtime-baseline'),join(root,'realtime-release'),{recursive:true});
await writeFile(join(root,'realtime-release/supabase/functions/realtime-token/index.ts'),patched);
console.log('Prepared isolated site, Worker and realtime release. Unrelated live assets preserved; no deployment performed.');
