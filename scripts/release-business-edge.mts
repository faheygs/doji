// Business-only release. Existing credentials are reused inside the runtime;
// newly scoped credentials never reach files or logs. No email is sent here.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {cli,cf,ref,inventory,hash} from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceArray,evidenceAt,evidenceNumber,evidenceText} from './release-evidence.mts';
const root='test-results/business-release-20260930',slug='business-auth';
const save=(name:string,value:unknown)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
const read=(name:string)=>readFile(`${root}/${name}.json`,'utf8').then(s=>evidenceRecord(JSON.parse(s)));
const functions=()=>evidenceArray(evidenceRecord(cli(['functions','list','--project-ref',ref,'--output-format','json'])).functions);
const secrets=()=>evidenceArray(evidenceRecord(cli(['secrets','list','--project-ref',ref,'--output-format','json'])).secrets);
const files=['business-auth/index.ts','_shared/business-auth.ts','_shared/business-link.ts','_shared/employee-service-headers.ts','_shared/doji-email.ts','_shared/json-body.ts','deno.d.ts'];
const mode=process.argv[2];assert.ok(mode&&['prepare','configure-disabled','deploy-disabled','verify'].includes(mode));
const before=await read('baseline');
const existingFunctionsUnchanged=(actual:Record<string,unknown>[])=>{
 const rows=actual.filter(f=>f.slug!==slug);assert.equal(rows.length,evidenceArray(before.functions).length);
 for(const old of evidenceArray(before.functions)){const current=rows.find(f=>f.id===old.id);assert.ok(current);
  // Supabase secret updates bump every function's version once without changing
  // source, timestamps, entrypoint, permissions or other runtime configuration.
  assert.deepEqual({...current,version:old.version},old,`Existing function contract: ${old.slug}`);
  assert.equal(current.version,evidenceNumber(old.version)+1,`Unexpected version change: ${old.slug}`);
 }
};
const existingSecretsUnchanged=()=>{
 const now=secrets();
 for(const old of evidenceArray(evidenceAt(before,'secrets').secrets)){const current=now.find(s=>s.name===old.name);assert.ok(current,`Missing secret ${old.name}`);assert.equal(current.digest,old.digest,`Existing credential changed: ${old.name}`);}
};
if(mode==='prepare'){
 assert.ok(!functions().some(f=>f.slug===slug));
 for(const file of files){const to=`${root}/edge/supabase/functions/${file}`;await mkdir(to.slice(0,to.lastIndexOf('/')),{recursive:true});await cp(`supabase/functions/${file}`,to);}
 await writeFile(`${root}/edge/supabase/config.toml`,'project_id = "business-onboarding-release"\n[functions.business-auth]\nverify_jwt = false\n');
 await save('edge-candidate',{at:new Date().toISOString(),assets:await inventory(`${root}/edge`)});
 console.log('Prepared exact business-auth artifact.');
}else if(mode==='configure-disabled'){
 existingSecretsUnchanged();
 const current=secrets();assert.ok(!current.some(s=>s.name==='BUSINESS_LINK_SIGNING_KEY'),'Existing dedicated key; do not rotate');
 const name='Doji Business Onboarding',list=evidenceArray(await cf('/challenges/widgets'));assert.ok(list.length<20);
 const found=list.filter(w=>w.name===name);assert.ok(found.length<=1);
 const widget=evidenceRecord(found[0]?await cf(`/challenges/widgets/${evidenceText(found[0].sitekey)}`):await cf('/challenges/widgets',{method:'POST',body:JSON.stringify({name,domains:['business.dojipro.com'],mode:'managed',bot_fight_mode:false,clearance_level:'no_clearance'})}));
 assert.equal(widget.name,name);assert.deepEqual(widget.domains,['business.dojipro.com']);assert.ok(widget.secret&&widget.sitekey);
 cli(['secrets','set',`BUSINESS_TURNSTILE_SECRET=${widget.secret}`,`BUSINESS_LINK_SIGNING_KEY=${randomBytes(48).toString('base64url')}`,'BUSINESS_AUTH_ENABLED=false','BUSINESS_AUTH_PUBLIC_ADMISSION=false','BUSINESS_PORTAL_ORIGIN=https://business.dojipro.com','--project-ref',ref],false);
 existingSecretsUnchanged();await save('business-edge-configured',{at:new Date().toISOString(),name,sitekey:widget.sitekey,domains:widget.domains,mode:widget.mode,enabled:false,newCosts:false});
 console.log('Free dedicated widget and business-only secrets configured. Service disabled.');
}else{
 const candidate=await read('edge-candidate');assert.deepEqual((await inventory(`${root}/edge`)).filter(x=>!x.path.includes('/.temp/')),candidate.assets);
 if(mode==='deploy-disabled'){
  await read('business-edge-configured');existingFunctionsUnchanged(functions());existingSecretsUnchanged();
  await save('edge-deploy-started',{at:new Date().toISOString()});
  cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge`],false);
 }
 const now=functions();existingFunctionsUnchanged(now);
 const added=now.find(f=>f.slug===slug);assert.ok(added);assert.equal(added.status,'ACTIVE');assert.equal(added.verify_jwt,false);existingSecretsUnchanged();
 const r=await fetch(`https://${ref}.supabase.co/functions/v1/business-auth`,{method:'POST',headers:{Origin:'https://business.dojipro.com','Content-Type':'application/json'},body:'{"action":"register"}',signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,404,'Disabled service must fail closed');
 await mkdir(`${root}/edge-downloaded`,{recursive:true});
 cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge-downloaded`],false);
 for(const file of files.filter(f=>f!=='deno.d.ts'))assert.equal(hash((await readFile(`${root}/edge-downloaded/supabase/functions/${file}`,'utf8')).replaceAll('\r\n','\n')),hash((await readFile(`${root}/edge/supabase/functions/${file}`,'utf8')).replaceAll('\r\n','\n')),file);
 await save(`edge-verified-${Date.now()}`,{at:new Date().toISOString(),version:added.version,exactSource:true,disabled:true,existingFunctionsAndCredentialsUnchanged:true});
 console.log('Exact hosted business-auth verified disabled; all existing functions and credential digests unchanged.');
}
