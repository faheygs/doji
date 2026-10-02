// Deploy only exact, hash-pinned static artifacts. No Worker/backend deployment.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {root,account,cf,save,inventory,hash} from './prepare-safety-launch.mjs';
const which=process.argv[2];assert.ok(['admin','public'].includes(which));assert.equal(process.argv[3],'--publish-reviewed-artifact');
const mode=process.argv[4]||'deploy';assert.ok(['deploy','verify'].includes(mode));
const candidate=JSON.parse(await readFile(`${root}/${which==='admin'?'admin-candidate':'public-live-candidate'}.json`,'utf8'));
assert.equal(candidate.deploymentReady,true);assert.deepEqual(await inventory(`${root}/${which}`),candidate.assets);
const name=which==='admin'?'doji-admin':'doji-site';
const baseline=JSON.parse(await readFile(`${root}/pages-before.json`,'utf8'))[name];
await readFile(`${root}/processing-activated.json`);
if(mode==='deploy'){
 const now=await cf(`/pages/projects/${name}`);assert.equal(now.canonical_deployment.id,baseline.canonical_deployment.id,'Concurrent Pages release');
 assert.equal(now.production_branch,'main');assert.deepEqual(now.domains,baseline.domains);
 await save(`${which}-pages-started.json`,{at:new Date().toISOString(),baseline:now.canonical_deployment.id,assets:candidate.assets});
 let output;try{output=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/${which}`,'--project-name',name,'--branch','main','--commit-dirty=true','--commit-message','Approved external safety intake launch'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account},maxBuffer:1000000});}catch{throw new Error('Pages command did not confirm completion; inspect current deployment before any retry');}
 await save(`${which}-pages-command.json`,{at:new Date().toISOString(),output});
}
const now=await cf(`/pages/projects/${name}`);const deployment=now.canonical_deployment;
assert.notEqual(deployment.id,baseline.canonical_deployment.id);assert.equal(deployment.latest_stage.status,'success');assert.deepEqual(now.domains,baseline.domains);
const origin=which==='admin'?'https://admin.dojipro.com':'https://dojipro.com';
const verified=[];
const decodeEmail=hex=>{assert.match(hex,/^(?:[a-f0-9]{2})+$/i);const b=Buffer.from(hex,'hex');return Buffer.from([...b.subarray(1)].map(v=>v^b[0])).toString('utf8');};
function normalizeExistingEmailProtection(html){
 return html.replace(/href="\/cdn-cgi\/l\/email-protection#([a-f0-9]+)"/gi,(_,hex)=>`href="mailto:${decodeEmail(hex)}"`)
  .replace(/<span class="__cf_email__" data-cfemail="([a-f0-9]+)">\[email&#160;protected\]<\/span>/gi,(_,hex)=>decodeEmail(hex))
  .replace(/<a href="\/cdn-cgi\/l\/email-protection" class="__cf_email__" data-cfemail="([a-f0-9]+)">\[email&#160;protected\]<\/a>/gi,(_,hex)=>decodeEmail(hex))
  .replace(/<script data-cfasync="false" src="\/cdn-cgi\/scripts\/5c5dd728\/cloudflare-static\/email-decode.min.js"><\/script>/g,'');
}
for(const asset of candidate.assets.filter(v=>!v.path.startsWith('_'))){
 const r=await fetch(`${origin}/${asset.path}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,200,asset.path);const bytes=Buffer.from(await r.arrayBuffer());
 if(which==='public'&&asset.path.endsWith('.html')){
  const exact=await fetch(`${deployment.url}/${asset.path}`,{signal:AbortSignal.timeout(20000)});assert.equal(exact.status,200);assert.equal(hash(Buffer.from(await exact.arrayBuffer())),asset.sha256,`Pinned deployment ${asset.path}`);
  const normalized=normalizeExistingEmailProtection(bytes.toString('utf8'));
  if(hash(normalized)!==asset.sha256){const local=await readFile(`${root}/${which}/${asset.path}`,'utf8');let at=0;while(at<normalized.length&&normalized[at]===local[at])at++;console.log(JSON.stringify({asset:asset.path,difference:at,actual:normalized.slice(Math.max(0,at-50),at+220),expected:local.slice(Math.max(0,at-50),at+220)}));}
  assert.equal(hash(normalized),asset.sha256,`Canonical document with existing email protection: ${asset.path}`);
 }else assert.equal(hash(bytes),asset.sha256,asset.path);
 if(which==='public'&&asset.path.startsWith('safety-removal/')){assert.match(r.headers.get('cache-control')||'',/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.ok((r.headers.get('content-security-policy')||'').includes('https://challenges.cloudflare.com'));}
 verified.push(asset.path);
}
await save(`${which}-pages-verified.json`,{at:new Date().toISOString(),deploymentId:deployment.id,url:deployment.url,origin,baseline:baseline.canonical_deployment.id,verified,domainsUnchanged:true});
console.log(JSON.stringify({published:name,deployment:deployment.id,verified:verified.length,origin}));
