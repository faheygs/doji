// Business-only presentation release. No sends, configuration, SQL writes or Pages deployment.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access,cp} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {build} from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import {cli,ref,hash,inventory} from './prepare-safety-launch.mts';
import {database,functions,secrets,pages,health} from './business-disabled-release-reads.mts';
import {evidenceRecord as record,evidenceArray as array,evidenceRows as rows} from './release-evidence.mts';
const root='test-results/business-email-theme-release-20261012';
const slugs=['business-portal-v2','business-application-mail'];
const mode=process.argv[2];assert.ok(['prepare','deploy','verify'].includes(mode||''));
const save=(name:string,data:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(data,null,2),{flag:'wx'});
const json=async(name:string)=>record(JSON.parse(await readFile(`${root}/${name}.json`,'utf8')));
const gates=()=>rows(cli(['db','query',`begin read only;set local statement_timeout='3s';select e.sending_enabled,e.capture_enabled,e.day_used,e.month_used,s.enabled wakeup from business_private.email_settings e cross join business_private.email_sender_settings s;rollback;`,'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']));
async function capture(){return {database:database(),functions:functions(),secrets:secrets(),pages:await pages(),gates:gates()};}
function allowed(state:Record<string,unknown>){
 assert.equal(record(state.database).event_window,false,'Protected member window');
 assert.equal(record(state.database).overdue_sample,0,'Overdue member outbox');
 const gate=array(state.gates);assert.equal(gate.length,1);
 for(const key of ['sending_enabled','capture_enabled','wakeup'])assert.equal(gate[0]![key],false);
}
async function boundaries(b:Record<string,unknown>){
 const current=await capture();allowed(current);
 for(const key of ['contracts','policies','roles'])assert.equal(current.database[key],record(b.database)[key]);
 assert.deepEqual(current.pages,b.pages);assert.deepEqual(current.gates,b.gates);
 // Edge deployment touches timestamps of built-in SUPABASE_* entries without changing values.
 assert.equal(current.secrets.length,array(b.secrets).length);
 for(const old of array(b.secrets)){
  const value=current.secrets.find(s=>s.name===old.name);assert.ok(value);
  assert.equal(value.value,old.value,`Secret digest changed: ${old.name}`);
  if(!String(old.name).startsWith('SUPABASE_'))assert.equal(value.updated_at,old.updated_at);
 }
 for(const old of array(b.functions)){
  const value=current.functions.find(f=>f.id===old.id);assert.ok(value);
  assert.equal(value.verify_jwt,old.verify_jwt);assert.equal(value.status,old.status);
  if(!slugs.includes(String(old.slug)))assert.equal(value.ezbr_sha256,old.ezbr_sha256,`Unrelated runtime ${old.slug}`);
 }
 return current;
}
if(mode==='prepare'){
 await mkdir(root,{recursive:true});await assert.rejects(access(`${root}/manifest.json`));
 await assert.rejects(access(`${root}/deployment-started.json`));
 let baseline:Record<string,unknown>;
 try {await access(`${root}/baseline.json`);baseline=await json('baseline');await boundaries(baseline);}
 catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;baseline=await capture();allowed(baseline);await save('baseline',baseline);}
 await mkdir(`${root}/before`,{recursive:true});
 for(const slug of slugs){
  cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'before')],false);
  const folder=`${root}/candidate/supabase/functions/${slug}`;await mkdir(folder,{recursive:true});
  const bundle=await build({entryPoints:[`supabase/functions/${slug}/index.ts`],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','pg','jose'],logLevel:'silent'});
  await writeFile(`${folder}/index.ts`,bundle.outputFiles[0]!.contents,{flag:'wx'});
  await cp(`supabase/functions/${slug}/deno.json`,`${folder}/deno.json`);
 }
 const config=['project_id="business-email-theme"',...slugs.map(s=>`[functions.${s}]\nverify_jwt=false\nimport_map="./functions/${s}/deno.json"`)].join('\n');
 await writeFile(`${root}/candidate/supabase/config.toml`,config,{flag:'wx'});
 await writeFile(`${root}/before/supabase/config.toml`,config);
 const tests=['test-email-theme-shared','test-business-email-theme','test-business-email-message','test-business-mail-dispatch','test-business-mail-hosted','test-business-owned-recovery-email','test-business-owned-runtime','test-business-owned-reset','test-business-edge-globals'];
 const output=execFileSync(process.execPath,['--test',...tests.map(t=>`scripts/${t}.mts`)],{encoding:'utf8',timeout:60000});
 await writeFile(`${root}/tests.txt`,output,{flag:'wx'});
 await save('manifest',{at:new Date().toISOString(),candidate:await inventory(`${root}/candidate`),rollback:await inventory(`${root}/before`),testsPassed:true});
 console.log('Two business packages prepared, rollback retained, regression tests passed. No production writes or emails.');
}else{
 const baseline=await json('baseline'),manifest=await json('manifest');assert.equal(manifest.testsPassed,true);
 const files=()=>inventory(`${root}/candidate`).then(all=>all.filter(f=>!f.path.includes('/.temp/')));
 assert.deepEqual(await files(),manifest.candidate);
 assert.deepEqual(await inventory(`${root}/before`),manifest.rollback);
 await boundaries(baseline);
 if(mode==='deploy'){
  try {await access(`${root}/deployment-started.json`);}catch{await save('deployment-started',{at:new Date().toISOString()});}
  await mkdir(`${root}/after`,{recursive:true});
  for(const slug of slugs){
   const before=array(baseline.functions).find(f=>f.slug===slug);assert.ok(before);
   cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'after')],false);
   const source=`supabase/functions/${slug}/index.ts`;
   const normalize=(text:string)=>text.replaceAll('\r\n','\n');
   const expected=hash(normalize(await readFile(`${root}/candidate/${source}`,'utf8')));
   if(hash(normalize(await readFile(`${root}/after/${source}`,'utf8')))!==expected){
    assert.equal(functions().find(f=>f.slug===slug)?.ezbr_sha256,before.ezbr_sha256,'Live runtime changed since capture');
    cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'candidate')],false);
    cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',resolve(root,'after')],false);
   }
   assert.equal(hash(normalize(await readFile(`${root}/after/${source}`,'utf8'))),hash(normalize(await readFile(`${root}/candidate/${source}`,'utf8'))),slug);
   try {await access(`${root}/${slug}-verified.json`);}catch{await save(`${slug}-verified`,{at:new Date().toISOString(),sourceHash:hash(await readFile(`${root}/candidate/${source}`))});}
  }
 }
 for(const slug of slugs)await access(`${root}/${slug}-verified.json`);
 for(const path of ['/api/session','/api/setup','/api/workspace']){
  const response=await fetch('https://business.dojipro.com'+path,{headers:{origin:'https://business.dojipro.com'},signal:AbortSignal.timeout(15000)});
  assert.equal(response.status,401,path);await response.body?.cancel();
 }
 const response=await fetch(`https://${ref}.supabase.co/functions/v1/business-application-mail`,{method:'POST',headers:{'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});
 assert.equal(response.status,401);await response.body?.cancel();
 await save(`verified-${Date.now()}`,{at:new Date().toISOString(),state:await boundaries(baseline),health:await health(),emailsSent:0,configurationChanges:0});
 console.log('Business theme deployed and source-verified. Auth boundaries pass; no member/shared runtime, database, config, Pages or send-gate changes. No emails sent.');
}
