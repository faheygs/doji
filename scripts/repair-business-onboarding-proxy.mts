// Restore a redacted Pages secret from the protected, hash-matched runtime copy.
// Never send API-returned empty secret placeholders back as configuration values.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {cf,hash,inventory,account} from './prepare-safety-launch.mts';
import {pages,health} from './business-disabled-release-reads.mts';
import {evidenceRecord as record} from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011',secure='.artifacts/business-onboarding-release-20261011';
const mode=process.argv[2];assert.ok(['restore','redeploy'].includes(mode||''));
const read=async(p:string)=>record(JSON.parse(await readFile(p,'utf8')));
const baseline=await read(`${root}/baseline.json`),apps=await read(`${root}/apps.json`);
const raw=await readFile(`${secure}/runtime-after.json`,'utf8');assert.equal(hash(raw),apps.runtimeHash);
const config=record(JSON.parse(raw));assert.match(String(config.proxyKey),/^[a-f0-9]{64}$/);
if(mode==='restore') {
 const old=record(record(baseline.pages)['doji-business']).id;assert.equal(old,'4803a3ed-269c-414f-96ec-f504050ddfaf');
 await cf(`/pages/projects/doji-business/deployments/${old}/rollback`,{method:'POST'});
 const p=await pages();assert.equal(record(p['doji-business']).id,old);
 const r=await fetch('https://business.dojipro.com/api/session',{headers:{origin:'https://business.dojipro.com'},signal:AbortSignal.timeout(15000)});
 await r.body?.cancel();assert.equal(r.status,401);
 await writeFile(`${root}/pages-restored.json`,JSON.stringify({at:new Date().toISOString(),deployment:p['doji-business'],health:await health(),reason:'Pages API secret placeholder was incorrectly resubmitted as an empty value; activation stopped.'},null,2),{flag:'wx'});
 console.log('Prior business Pages release restored; API session boundary healthy (401). No mail sent.');
} else {
 await read(`${root}/pages-restored.json`);assert.deepEqual(await inventory(`${root}/site`),apps.site);
 const current=record(await cf('/pages/projects/doji-business')),before=record(current.deployment_configs),prod=record(before.production),env=record(prod.env_vars);
 assert.deepEqual(Object.entries(env).filter(([,v])=>record(v).type==='secret_text').map(([k])=>k),['BUSINESS_V2_PROXY_KEY']);
 await cf('/pages/projects/doji-business',{method:'PATCH',body:JSON.stringify({deployment_configs:{production:{env_vars:{...env,BUSINESS_SETUP_ENABLED:{type:'plain_text',value:'true'},BUSINESS_V2_PROXY_KEY:{type:'secret_text',value:config.proxyKey}}}}})});
 const after=record(record(await cf('/pages/projects/doji-business')).deployment_configs);
 assert.deepEqual(after.preview,before.preview);
 const settings=record(after.production),variables=record(settings.env_vars);
 assert.deepEqual({...settings,env_vars:env},prod);
 assert.deepEqual(variables.BUSINESS_SETUP_ENABLED,{type:'plain_text',value:'true'});
 for(const [key,value]of Object.entries(env).filter(([k])=>!['BUSINESS_SETUP_ENABLED','BUSINESS_V2_PROXY_KEY'].includes(k)))assert.deepEqual(variables[key],value);
 execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',resolve(root,'site'),'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Business onboarding; preserve protected proxy secret','--no-bundle'],{stdio:'pipe',timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
 const p=await pages();for(const name of ['doji-admin','doji-site'])assert.deepEqual(p[name],record(baseline.pages)[name]);
 const results=[];
 for(const [path,expected] of [['/api/session',401],['/api/setup',401],['/auth/owned/bootstrap',200]] as const) {
  const r=await fetch('https://business.dojipro.com'+path,{headers:{origin:'https://business.dojipro.com'},signal:AbortSignal.timeout(15000)});await r.body?.cancel();assert.equal(r.status,expected,path);results.push({path,status:r.status});
 }
 await writeFile(`${root}/pages-repaired.json`,JSON.stringify({at:new Date().toISOString(),deployment:p['doji-business'],results},null,2),{flag:'wx'});
 console.log('Protected proxy secret restored; all three hosted auth/setup boundaries passed.');
}
