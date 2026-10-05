// Explicit, separately journalled release stages. No automatic retry or deletion.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {root,ref,cli,save,hash,inventory} from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceArray,evidenceAssets,evidenceNumber,evidenceText} from './release-evidence.mts';
const json=async(n:string):Promise<unknown>=>JSON.parse(await readFile(`${root}/${n}`,'utf8'));
const query=(sql:string)=>cli<{rows:Record<string,unknown>[]}>(['db','query',sql,'--linked','--output-format','json']);
const functions=()=>evidenceArray(evidenceRecord(cli(['functions','list','--project-ref',ref,'--output-format','json'])).functions);
const secrets=()=>evidenceArray(evidenceRecord(cli(['secrets','list','--project-ref',ref,'--output-format','json'])).secrets);
const originals=evidenceArray(await json('functions-before.json'));
const stable=(rows:Record<string,unknown>[])=>rows.map(({version: _version,...row})=>row);
const mode=process.argv[2];assert.ok(mode&&['database','configure','finish-bucket','edge','verify-disabled'].includes(mode));
assert.equal(process.argv[3],'--release-reviewed-artifact');
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),ref);
async function artifact(){const manifest=evidenceAssets(await json('edge-manifest.json'));assert.deepEqual((await inventory(`${root}/edge`)).filter(v=>!v.path.startsWith('supabase/.temp/')),manifest);return manifest;}
async function originalSecretsUnchanged(){
 const current=secrets();for(const prior of evidenceArray(evidenceRecord(await json('secrets-before.json')).secrets)){
  const next=current.find(s=>s.name===prior.name);assert.equal(next?.digest,prior.digest,`Existing secret changed: ${prior.name}`);
 }
}
try{
 if(mode==='database'){
  const proof=evidenceRecord(await json('database-rehearsed.json')),sql=await readFile(`${root}/database.sql`,'utf8');assert.equal(hash(sql),proof.sha256);assert.equal(proof.rolledBack,true);
  const configured=functions();
  // Supabase secret updates increment every function version without changing
  // its code hash, source path, timestamps or verification configuration.
  assert.deepEqual(stable(configured),stable(originals),'Unexpected Edge source/config release');
  for(const f of configured)assert.equal(f.version,evidenceNumber(originals.find(v=>v.slug===f.slug)?.version)+1,'Only this release\'s single Turnstile secret update expected');
  await save('functions-after-turnstile.json',configured);await originalSecretsUnchanged();
  const checks=cli(['db','query','--linked','--file','scripts/portal-triage-member-canary.sql','--output-format','json']);
  await save('member-before.json',checks);
  await save('database-deploy-started.json',{at:new Date().toISOString(),sha256:proof.sha256});
  const result=cli(['db','query','--linked','--file',`${root}/database.sql`,'--output-format','json']);
  await save('database-deployed.json',{at:new Date().toISOString(),sha256:proof.sha256,result,captureEnabled:false,publicEnabled:false});
  console.log('Guarded intake/media schema installed; capture, dispatch and public acceptance remain disabled.');
 }else if(mode==='configure'){
  await json('database-deployed.json');await artifact();await originalSecretsUnchanged();
  const names=query("begin read only;select name from vault.secrets where name in('safety_removal_dispatch_secret','moderation_media_dispatch_secret');rollback;").rows;
  assert.equal(names.length,0,'Existing dedicated Vault secret: inspect rather than rotate');
  const current=secrets();assert.ok(!current.some(s=>['SAFETY_REMOVAL_DISPATCH_SECRET','MODERATION_MEDIA_DISPATCH_SECRET'].includes(evidenceText(s.name))));
  await save('configuration-started.json',{at:new Date().toISOString(),scope:'two dedicated dispatch credentials and private evidence bucket',publicEnabled:false});
  const alert=randomBytes(32).toString('hex'),media=randomBytes(32).toString('hex');
  cli(['secrets','set',`SAFETY_REMOVAL_DISPATCH_SECRET=${alert}`,`MODERATION_MEDIA_DISPATCH_SECRET=${media}`,'MODERATION_MEDIA_ENABLED=false','MODERATION_MEDIA_CLEANUP_ENABLED=false','--project-ref',ref],false);
  query(`begin;do $$begin if exists(select 1 from vault.secrets where name in('safety_removal_dispatch_secret','moderation_media_dispatch_secret')) then raise exception 'Concurrent dedicated secret';end if;perform vault.create_secret('${alert}','safety_removal_dispatch_secret','Dedicated intake alerts only');perform vault.create_secret('${media}','moderation_media_dispatch_secret','Dedicated exact-object moderation only');end$$;commit;`);
  const keys=evidenceArray(evidenceRecord(cli(['projects','api-keys','--project-ref',ref,'--reveal','--output-format','json'])).keys);
  const service=evidenceText(keys.find(k=>k.type==='secret'&&k.name==='default')?.api_key);assert.ok(service.startsWith('sb_secret_'));
  const api=async(path:string,init:RequestInit={})=>fetch(`https://${ref}.supabase.co/storage/v1/${path}`,{...init,headers:{apikey:service,'content-type':'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});
  const listed=await api('bucket');assert.equal(listed.status,200);assert.ok(!evidenceArray(await listed.json()).some(b=>b.id==='moderation-evidence'),'Existing evidence bucket requires review');
  const created=await api('bucket',{method:'POST',body:JSON.stringify({id:'moderation-evidence',name:'moderation-evidence',public:false})});assert.ok(created.ok,`Evidence bucket creation status ${created.status}`);await created.body?.cancel();
  const check=await api('bucket/moderation-evidence');const bucket=await check.json();assert.equal(check.status,200);assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,null);
  await originalSecretsUnchanged();
  await save('configuration-complete.json',{at:new Date().toISOString(),dedicatedSecretsStored:true,evidenceBucket:{id:bucket.id,public:bucket.public,file_size_limit:bucket.file_size_limit},publicEnabled:false});
  console.log('Private evidence bucket and dedicated dispatch credentials configured; existing credentials unchanged; all new paths disabled.');
 }else if(mode==='finish-bucket'){
  // Resume only the exact failed bucket step; never recreate dispatch credentials.
  await json('configuration-started.json');await originalSecretsUnchanged();
  const vaultNames=query("begin read only;select name from vault.secrets where name in('safety_removal_dispatch_secret','moderation_media_dispatch_secret');rollback;").rows;
  assert.equal(vaultNames.length,2);
  const keys=evidenceArray(evidenceRecord(cli(['projects','api-keys','--project-ref',ref,'--reveal','--output-format','json'])).keys);
  const service=evidenceText(keys.find(k=>k.type==='secret'&&k.name==='default')?.api_key);assert.ok(service.startsWith('sb_secret_'));
  const api=(path:string,init:RequestInit={})=>fetch(`https://${ref}.supabase.co/storage/v1/${path}`,{...init,headers:{apikey:service,'content-type':'application/json'},signal:AbortSignal.timeout(15000),redirect:'error'});
  const listed=await api('bucket');assert.equal(listed.status,200);let bucket=evidenceArray(await listed.json()).find(b=>b.id==='moderation-evidence');
  if(!bucket){
   // The dashboard confirms the unchanged spend cap enforces global 50 MB.
   // Inherit that exact global cap; do not raise limits or disable cost controls.
   const r=await api('bucket',{method:'POST',body:JSON.stringify({id:'moderation-evidence',name:'moderation-evidence',public:false})});
   const result=await r.json();
   if(!r.ok){await save('bucket-create-error.json',{at:new Date().toISOString(),status:r.status,code:result.code,message:result.message});console.log(JSON.stringify({status:r.status,code:result.code,message:result.message}));throw new Error('Evidence bucket not created; inspect exact service validation error');}
   const check=await api('bucket/moderation-evidence');assert.equal(check.status,200);bucket=evidenceRecord(await check.json());
  }
  assert.equal(bucket.public,false);assert.equal(bucket.file_size_limit,null);
  await save('configuration-complete.json',{at:new Date().toISOString(),dedicatedSecretsStored:true,evidenceBucket:{id:bucket.id,public:bucket.public,file_size_limit:bucket.file_size_limit},publicEnabled:false});
  console.log('Dedicated configuration complete; no credentials rotated.');
 }else if(mode==='edge'){
  await json('configuration-complete.json');await artifact();
  const configured=functions();assert.deepEqual(stable(configured),stable(originals),'Concurrent Edge source/config release');
  for(const f of configured)assert.equal(f.version,evidenceNumber(originals.find(v=>v.slug===f.slug)?.version)+2,'Only two dedicated secret updates expected');
  await save('functions-before-edge.json',configured);await originalSecretsUnchanged();
  await save('edge-deploy-started.json',{at:new Date().toISOString(),slugs:['delete-account','run-data-maintenance','moderation-media','safety-removal']});
  for(const slug of ['delete-account','run-data-maintenance','moderation-media','safety-removal']){
   cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge`],false);
   const now=functions();assert.deepEqual(now.filter(v=>!['delete-account','run-data-maintenance','moderation-media','safety-removal'].includes(evidenceText(v.slug))),configured.filter(v=>!['delete-account','run-data-maintenance'].includes(evidenceText(v.slug))),'Unrelated Edge changed');
   await save(`edge-${slug}-deployed.json`,{at:new Date().toISOString(),function:now.find(v=>v.slug===slug)});
  }
  await save('edge-deployed.json',{at:new Date().toISOString(),newPathsDisabled:true});
  console.log('Only the four reviewed functions deployed. Guarded cleanup/media/intake remain disabled.');
 }else{
  await json('edge-deployed.json');const manifest=await artifact();
  for(const slug of ['delete-account','run-data-maintenance','moderation-media','safety-removal'])cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge-verified`],false);
  for(const file of manifest.filter(f=>f.path.endsWith('.ts')&&!f.path.endsWith('/deno.d.ts'))){
   const deployed=await readFile(`${root}/edge-verified/${file.path}`,'utf8');const candidate=await readFile(`${root}/edge/${file.path}`,'utf8');assert.equal(hash(deployed.replaceAll('\r\n','\n')),hash(candidate.replaceAll('\r\n','\n')),`Runtime source mismatch ${file.path}`);
  }
  await originalSecretsUnchanged();
  const disabled:Record<string,number>={};for(const slug of ['safety-removal','moderation-media','safety-removal-alerts']){
   const response=await fetch(`https://${ref}.supabase.co/functions/v1/${slug}`,{method:'POST',signal:AbortSignal.timeout(15000)});assert.equal(response.status,503,`${slug} disabled`);disabled[slug]=response.status;await response.body?.cancel();
  }
  const checks=cli(['db','query','--linked','--file','scripts/portal-triage-member-canary.sql','--output-format','json']);
  await save('disabled-release-verified.json',{at:new Date().toISOString(),exactDeployedSource:true,existingSecretDigestsUnchanged:true,disabled,memberAndEmployeeChecks:checks});
  console.log('Deployed sources verified, new public/dispatch paths disabled, existing member/employee canaries passed.');
 }
}catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
