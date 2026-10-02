import assert from 'node:assert/strict';
import {readFile,writeFile,cp,mkdir} from 'node:fs/promises';
import {cli,ref,hash,inventory} from './prepare-safety-launch.mjs';
const root='test-results/employee-edge-release-20261001';
const slug='employee-portal-v2';
const config=JSON.parse(await readFile('.artifacts/employee-runtime/runtime.json','utf8'));
const funcs=()=>cli(['functions','list','--project-ref',ref,'--output-format','json']).functions;
const before=funcs();
const expected=JSON.parse(await readFile(`${root}/candidate.json`,'utf8'));
if(process.argv[2]==='routing-fix'){
 assert.deepEqual(await inventory(`${root}/edge`).then(a=>a.filter(f=>!f.path.includes('/.temp/'))),expected.assets);
 await writeFile(`${root}/routing-before.json`,JSON.stringify({at:new Date().toISOString(),functions:before,assets:expected.assets}),{flag:'wx'});
 await cp('infra/portal-identity-candidate/employee-proxy.mjs',`${root}/edge/supabase/functions/${slug}/runtime/employee-proxy.mjs`);
 cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge`],false);
}
if(process.argv[2]==='routing-observe'||process.argv[2]==='gateway-fix'){
 await cp('infra/portal-identity-candidate/employee-proxy.mjs',`${root}/edge/supabase/functions/${slug}/runtime/employee-proxy.mjs`);
 cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge`],false);
}
const next=funcs();for(const f of before)if(f.slug!==slug)assert.deepEqual(next.find(n=>n.id===f.id),f);
const endpoint=`https://${ref}.supabase.co/functions/v1/${slug}`,results=[];
for(const [label,headers,expectedStatus] of [
 ['direct request',{},403],
 ['proxy without employee cookie',{'x-doji-portal-proxy-key':config.proxyKey,origin:config.origin},401],
 ['cross-origin request',{'x-doji-portal-proxy-key':config.proxyKey,origin:'https://business.dojipro.com'},403],
]){
 const r=await fetch(endpoint+'/api/session',{headers:{...headers,'x-doji-client-ip':'192.0.2.1'},redirect:'error',signal:AbortSignal.timeout(15000)});
 results.push({label,status:r.status});
 if(r.status!==expectedStatus)console.log(JSON.stringify({label,status:r.status,origin:r.headers.get('x-doji-ingress-origin'),path:r.headers.get('x-doji-ingress-path')}));
 assert.equal(r.status,expectedStatus,label);assert.equal(r.headers.get('cache-control'),'no-store');
}
const folder=`${root}/enabled-download-${Date.now()}`;await mkdir(folder,{recursive:true});
cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',folder],false);
const downloaded=await inventory(folder);
for(const file of downloaded.filter(f=>f.path.endsWith('.mjs')||f.path.endsWith('/index.ts'))){
 const marker=`supabase/functions/${slug}/`, offset=file.path.indexOf(marker);assert.ok(offset>=0);
 const source=`${root}/edge/${file.path.slice(offset)}`;
 assert.equal(hash((await readFile(`${folder}/${file.path}`,'utf8')).replaceAll('\r\n','\n')),hash((await readFile(source,'utf8')).replaceAll('\r\n','\n')));
}
await writeFile(`${root}/enabled-verified.json`,JSON.stringify({at:new Date().toISOString(),results,function:next.find(n=>n.slug===slug),sourceVerified:true,ownerBrowserAcceptance:false}),{flag:'wx'});
console.log('Employee endpoint routing and anonymous/cross-origin denial verified; deployed source matches.');
