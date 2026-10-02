import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {cli,ref} from './prepare-safety-launch.mjs';
const root='test-results/employee-edge-release-20261001';
assert.ok((await readdir('test-results/employee-owner-binding-20261001')).some(f=>f.startsWith('verified-')));
assert.ok((await readdir(root)).some(f=>f.startsWith('verified-')));
const config=JSON.parse(await readFile('.artifacts/employee-runtime/runtime.json','utf8'));
const before=cli(['secrets','list','--project-ref',ref,'--output-format','json']).secrets;
const funcs=cli(['functions','list','--project-ref',ref,'--output-format','json']).functions;
await writeFile(`${root}/enable-started.json`,JSON.stringify({at:new Date().toISOString(),functions:funcs,secretDigests:before}),{flag:'wx'});
cli(['secrets','set','EMPLOYEE_V2_ENABLED=true','--project-ref',ref],false);
const after=cli(['secrets','list','--project-ref',ref,'--output-format','json']).secrets;
for(const old of before)if(old.name!=='EMPLOYEE_V2_ENABLED')assert.equal(after.find(s=>s.name===old.name)?.digest,old.digest);
const next=cli(['functions','list','--project-ref',ref,'--output-format','json']).functions;
assert.equal(next.length,funcs.length);
for(const old of funcs){const value=next.find(f=>f.id===old.id);assert.deepEqual({...value,version:old.version},old);assert.equal(value.version,old.version+1);}
const endpoint=`https://${ref}.supabase.co/functions/v1/employee-portal-v2`;
const results=[];
for(const [label,headers,expected] of [
 ['direct request',{},403],
 ['proxy without employee cookie',{'x-doji-portal-proxy-key':config.proxyKey,origin:config.origin},401],
 ['cross-origin request',{'x-doji-portal-proxy-key':config.proxyKey,origin:'https://business.dojipro.com'},403],
]){
 const r=await fetch(endpoint+'/api/session',{headers:{...headers,'x-doji-client-ip':'192.0.2.1'},redirect:'error',signal:AbortSignal.timeout(15000)});
 results.push({label,status:r.status});assert.equal(r.status,expected,label);assert.equal(r.headers.get('cache-control'),'no-store');
}
await writeFile(`${root}/enabled-verified.json`,JSON.stringify({at:new Date().toISOString(),results,existingCredentialsAndSourcesUnchanged:true,ownerBrowserAcceptance:false}),{flag:'wx'});
console.log('Hosted employee runtime enabled; direct, unauthenticated and cross-origin access correctly denied. Existing sources and credentials unchanged.');
