// Portal-only release. Preserve existing hosted assets; patch exactly two auth
// branches and add the employee return router. Never deploy the dirty site tree.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const origin='https://admin.dojipro.com';
const output=resolve('test-results/employee-onboarding-release'),site=join(output,'site');
await mkdir(site,{recursive:true});
const manifest=JSON.parse(await readFile('test-results/employee-enrollment-release/baseline-manifest.json','utf8'));
const baseline=[];
async function download(path){
  assert.ok(!path.includes('..')&&!path.startsWith('/'));
  const response=await fetch(`${origin}/${path}`,{signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,200,`Live asset ${path}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  baseline.push({path,sha256:createHash('sha256').update(bytes).digest('hex')});
  await mkdir(dirname(join(site,path)),{recursive:true});await writeFile(join(site,path),bytes);return bytes.toString();
}
for(const asset of manifest)await download(asset.path);
const originalHtml=await readFile(join(site,'index.html'),'utf8');
const oldBundle=originalHtml.match(/src="\/(admin-portal\/admin-app-[^"]+\.js)"/)[1];
let bundle=await readFile(join(site,oldBundle),'utf8');
const config=JSON.parse(bundle.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\(([\s\S]*?)\);/)[1]);
assert.notEqual(config.employeeAccountsEnabled,true,'No employee authorization cutover');
function replaceOnce(source,from,to){assert.equal(source.split(from).length,2,`Exact single auth patch: ${from.slice(0,70)}`);return source.replace(from,to);}
// Extract only the explicitly reviewed additions from source, not its other changes.
const client=await readFile('website/admin-portal/live-client.js','utf8');
const runtime=await readFile('website/portal.js','utf8');
const marker="        const passwordPayload = decodeJwtPayload(passwordSession.access_token || '');";
const guard=client.slice(client.indexOf(marker),client.indexOf('        if (employeeMode) {',client.indexOf(marker)));
assert.ok(guard.includes('config.employeeAccountsEnabled !== true')&&guard.includes('employee-setup/'));
bundle=replaceOnce(bundle,marker,guard.trimEnd());
const oldComplete='    async function completeLiveSignin() {\n      const epoch = workspaceEpoch;\n      await refreshLiveData();';
const begin=runtime.indexOf('    async function completeLiveSignin() {');
const complete=runtime.slice(begin,runtime.indexOf('      if (epoch !== workspaceEpoch',begin)).trimEnd();
assert.ok(complete.includes('resetAdminAuth();'));
bundle=replaceOnce(bundle.replaceAll('\r\n','\n'),oldComplete,complete.replaceAll('\r\n','\n'));
const newBundle='admin-portal/admin-app-20260926onboarding1.js';
await writeFile(join(site,newBundle),bundle);
for(const path of ['index.html','admin-portal/index.html']){
  let html=await readFile(join(site,path),'utf8');
  html=replaceOnce(html,`/${oldBundle}`,`/${newBundle}`);
  html=replaceOnce(html,'<head>','<head>\n  <script src="/employee-setup/return.js"></script>');
  await writeFile(join(site,path),html);
}
await cp('website/employee-setup',join(site,'employee-setup'),{recursive:true});
await writeFile(join(site,'employee-setup/config.js'),`window.DOJI_EMPLOYEE_SETUP_CONFIG = Object.freeze(${JSON.stringify({supabaseUrl:config.supabaseUrl,supabaseAnonKey:config.supabaseAnonKey})});\n`);
const headers=await readFile('website/_headers','utf8');
const live=await fetch(origin);
assert.equal(live.headers.get('content-security-policy'),headers.match(/Content-Security-Policy: ([^\r\n]+)/)[1]);
await writeFile(join(site,'_headers'),headers+'\n/employee-setup/*\n  Cache-Control: no-store\n');
for(const asset of baseline.filter(a=>!['index.html','admin-portal/index.html'].includes(a.path))){
  assert.equal(createHash('sha256').update(await readFile(join(site,asset.path))).digest('hex'),asset.sha256,`Preserved ${asset.path}`);
}
await writeFile(join(output,'baseline-manifest.json'),JSON.stringify(baseline,null,2));
console.log('Prepared isolated onboarding release: existing main assets retained, two auth branches patched in a new bundle, email return routing + setup assets. No cutover, Worker or SQL.');
