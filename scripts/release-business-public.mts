import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cli,cf,ref,inventory,hash,account} from './prepare-safety-launch.mts';
import {buildBusinessLegal} from '../website/build-business-legal.mts';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceRows,evidenceText,evidenceNumber,evidenceAssets} from './release-evidence.mts';
const root='test-results/business-release-20260930',site=`${root}/business-site`,edge=`${root}/edge-public`;
const save=(n:string,v:unknown)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
const read=(n:string)=>readFile(`${root}/${n}.json`,'utf8').then(JSON.parse).then(evidenceRecord);
const baseline=await read('baseline'),mode=process.argv[2];
assert.ok(mode&&['prepare','edge','database','activate','site','headers','legal-markup','verify'].includes(mode));
const fn=()=>evidenceArray(evidenceRecord(cli(['functions','list','--project-ref',ref,'--output-format','json'])).functions);
const secret=()=>evidenceArray(evidenceRecord(cli(['secrets','list','--project-ref',ref,'--output-format','json'])).secrets);
const query=(q:string)=>evidenceRows(cli(['db','query',q,'--linked','--output-format','json']));
const verifyExisting=(actual:Record<string,unknown>[],offset:number)=>{
 for(const old of evidenceArray(baseline.functions)){const now=actual.find(f=>f.id===old.id);assert.ok(now);assert.deepEqual({...now,version:old.version},old,evidenceText(old.slug));assert.equal(now.version,evidenceNumber(old.version)+offset);}
 const now=secret();for(const old of evidenceArray(evidenceAt(baseline,'secrets').secrets))assert.equal(now.find(s=>s.name===old.name)?.digest,old.digest,evidenceText(old.name));
};
const beforeSQL=()=>evidenceRecord(query(`begin read only;set local statement_timeout='8s';select jsonb_build_object('settings',(select to_jsonb(s) from business_private.settings s),'admission',(select to_jsonb(s) from business_private.public_auth_settings s),'business_member',pg_has_role('authenticator','doji_business','member'),'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp())) checks;rollback;`)[0]?.checks);
if(mode==='prepare'){
 const keys=cli(['projects','api-keys','--project-ref',ref,'--output-format','json']);
 const rows=evidenceArray(Array.isArray(keys)?keys:evidenceRecord(keys).keys);
 const anon=evidenceText(rows.find(k=>k.name==='anon')?.api_key);assert.ok(anon);
 const widget=await read('business-edge-configured');
 execFileSync(process.execPath,['website/build-business.mts'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,
  DOJI_BUSINESS_OUTPUT:site,DOJI_BUSINESS_ENABLED:'true',DOJI_BUSINESS_SUPABASE_URL:`https://${ref}.supabase.co`,DOJI_BUSINESS_ANON_KEY:anon,
  DOJI_BUSINESS_TURNSTILE_SITE_KEY:evidenceText(widget.sitekey),DOJI_BUSINESS_TERMS_URL:'https://business.dojipro.com/business-terms/business-terms-20260930-v1/',DOJI_BUSINESS_PRIVACY_URL:'https://business.dojipro.com/business-privacy/business-privacy-20260930-v1/',
  DOJI_BUSINESS_TERMS_VERSION:'business-terms-20260930-v1',DOJI_BUSINESS_PRIVACY_VERSION:'business-privacy-20260930-v1'}});
 await cp(`${root}/edge`,edge,{recursive:true,errorOnExist:true,force:false});
 await cp('supabase/functions/_shared/business-auth.ts',`${edge}/supabase/functions/_shared/business-auth.ts`);
 const foundation=await readFile('docs/drafts/business_applications_v1.sql','utf8');
 const guard=foundation.slice(foundation.indexOf('do $$declare exposed text; begin'),foundation.lastIndexOf('commit;'));
 const activation=await readFile('scripts/business-enable-public-launch.sql','utf8');
 const sql=activation.replace('grant doji_business to authenticator;',()=>`${guard}\ngrant doji_business to authenticator;`);
 await writeFile(`${root}/enable-public-exact.sql`,sql,{flag:'wx'});
 await writeFile(`${root}/enable-public-rehearsal.sql`,sql.replace(/commit;\s*$/,'rollback;'),{flag:'wx'});
 await save('public-candidate',{at:new Date().toISOString(),assets:await inventory(site),edge:(await inventory(edge)).filter(x=>!x.path.includes('/.temp/')),sqlHash:hash(sql),rollback:evidenceAt(baseline,'pages','doji-business').deployment,usOnly:true});
 console.log('Prepared exact business site, versioned legal pages, US guard and bounded activation. No public access enabled.');
}else{
 let candidate=await read('public-candidate');
 if(mode==='legal-markup') {
  const previous=await read('public-header-candidate');assert.deepEqual(await inventory(site),evidenceAssets(previous.assets));
  await buildBusinessLegal(site);
  const assets=await inventory(site);assert.equal(assets.length,evidenceAssets(previous.assets).length);
  const changed=assets.filter(f=>f.sha256!==evidenceAssets(previous.assets).find(x=>x.path===f.path)?.sha256);
  assert.equal(changed.length,4);assert.ok(changed.every(f=>/^business-(privacy|terms)\//.test(f.path)));
  const prior=await read('public-header-deployed'),p=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(p,'canonical_deployment').id,prior.deployment);
  await save('public-final-candidate',{...previous,assets,legalMarkupOnly:true,previousDeployment:prior.deployment});
  execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Preserve public business contact links in legal pages'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
  const now=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(now,'canonical_deployment','latest_stage').status,'success');
  await save('public-final-deployed',{at:new Date().toISOString(),deployment:evidenceAt(now,'canonical_deployment').id,url:evidenceAt(now,'canonical_deployment').url});
  process.exit(0);
 }
 if(mode==='headers') {
  const assets=await inventory(site);assert.equal(assets.length,evidenceAssets(candidate.assets).length);
  for(const f of assets.filter(x=>x.path!=='_headers'))assert.equal(f.sha256,evidenceAssets(candidate.assets).find(x=>x.path===f.path)?.sha256);
  assert.equal((await readFile(`${site}/_headers`,'utf8')).includes('Cache-Control: no-store, no-transform'),true);
  const prior=await read('public-site-deployed'),p=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(p,'canonical_deployment').id,prior.deployment);
  await save('public-header-candidate',{...candidate,assets,headerOnly:true,previousDeployment:prior.deployment});
  execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Preserve business legal contact text from CDN rewriting'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
  const now=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(now,'canonical_deployment','latest_stage').status,'success');
  await save('public-header-deployed',{at:new Date().toISOString(),deployment:evidenceAt(now,'canonical_deployment').id,url:evidenceAt(now,'canonical_deployment').url});
  console.log('Business-only no-transform response header deployed. Application assets unchanged.');
  process.exit(0);
 }
 if(mode==='verify')candidate=await read('public-final-candidate');
 assert.deepEqual(await inventory(site),evidenceAssets(candidate.assets));
 if(mode==='edge'){
  verifyExisting(fn(),1);assert.deepEqual((await inventory(edge)).filter(x=>!x.path.includes('/.temp/')),evidenceAssets(candidate.edge));
  await save('public-edge-started',{at:new Date().toISOString()});
  cli(['functions','deploy','business-auth','--project-ref',ref,'--use-api','--workdir',edge],false);
  verifyExisting(fn(),1);
  await mkdir(`${root}/edge-public-downloaded`,{recursive:true});
  cli(['functions','download','business-auth','--project-ref',ref,'--use-api','--workdir',`${root}/edge-public-downloaded`],false);
  for(const f of evidenceAssets(candidate.edge).filter(x=>x.path.endsWith('.ts')&&!x.path.endsWith('deno.d.ts')))
   assert.equal(hash((await readFile(`${root}/edge-public-downloaded/${f.path}`,'utf8')).replaceAll('\r\n','\n')),hash((await readFile(`${edge}/${f.path}`,'utf8')).replaceAll('\r\n','\n')));
  await save('public-edge-verified',{at:new Date().toISOString(),exactSource:true,existingFunctionsUnchanged:true});
 }else if(mode==='database'){
  const fresh=beforeSQL();assert.equal(fresh.active_events,0);assert.equal(fresh.business_member,false);assert.equal(evidenceAt(fresh,'admission').enabled,false);
  const sql=await readFile(`${root}/enable-public-exact.sql`);assert.equal(hash(sql),candidate.sqlHash);
  try { assert.deepEqual(await read('public-database-before'),fresh); }
  catch(error){ if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT')) throw error; await save('public-database-before',fresh); }
  cli(['db','query','--file',`${root}/enable-public-rehearsal.sql`,'--linked','--output-format','json']);
  assert.deepEqual(beforeSQL(),fresh);
  await save('public-database-rehearsed',{at:new Date().toISOString(),passed:true,sqlHash:candidate.sqlHash});
  cli(['db','query','--file',`${root}/enable-public-exact.sql`,'--linked','--output-format','json']);
  const after=beforeSQL();assert.equal(after.business_member,true);assert.equal(evidenceAt(after,'admission').registration_limit,10);assert.equal(evidenceAt(after,'admission').email_limit,30);assert.equal(evidenceAt(after,'settings').realtime_enabled,false);
  await save('public-database-enabled',after);
 }else if(mode==='activate'){
  await read('public-edge-verified');await read('public-database-enabled');verifyExisting(fn(),1);
  await save('public-activate-started',{at:new Date().toISOString()});
  cli(['secrets','set','BUSINESS_AUTH_ENABLED=true','BUSINESS_AUTH_PUBLIC_ADMISSION=true','--project-ref',ref],false);
  verifyExisting(fn(),2);
  await save('public-activated',{at:new Date().toISOString(),existingSourceAndCredentialsUnchanged:true});
 }else if(mode==='site'){
  await read('public-activated');const tests=await read('business-browser-results');assert.equal(evidenceAt(tests,'stats').unexpected,0);assert.equal(evidenceAt(tests,'stats').flaky,0);assert.ok(evidenceNumber(evidenceAt(tests,'stats').expected)>=30);
  const p=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(p,'canonical_deployment').id,candidate.rollback);assert.equal(evidenceRecord(p).production_branch,'main');
  await save('public-site-started',{at:new Date().toISOString(),rollback:candidate.rollback});
  execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-business','--branch','main','--commit-dirty=true','--commit-message','Capped US business signup and onboarding'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
  const deployed=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(deployed,'canonical_deployment','latest_stage').status,'success');
  await save('public-site-deployed',{at:new Date().toISOString(),deployment:evidenceAt(deployed,'canonical_deployment').id,url:evidenceAt(deployed,'canonical_deployment').url});
 }else{
  verifyExisting(fn(),2);
  const p=await cf('/pages/projects/doji-business');assert.equal(evidenceAt(p,'canonical_deployment').id,(await read('public-final-deployed')).deployment);assert.deepEqual(evidenceRecord(p).domains,evidenceAt(baseline,'pages','doji-business').domains);
  for(const f of evidenceAssets(candidate.assets).filter(x=>!x.path.startsWith('_'))){const r=await fetch(`https://business.dojipro.com/${f.path}`,{signal:AbortSignal.timeout(20000)});assert.equal(r.status,200,f.path);const data=Buffer.from(await r.arrayBuffer());
   if(/^business-(privacy|terms)\//.test(f.path)){const normalize=(s:string)=>s.replace(/<!--\/?email_off-->/g,'');assert.equal(normalize(data.toString()),normalize(await readFile(`${site}/${f.path}`,'utf8')),f.path);}
   else assert.equal(hash(data),f.sha256,f.path);
  }
  assert.equal(evidenceAt(await cf('/pages/projects/doji-site'),'canonical_deployment').id,evidenceAt(baseline,'pages','doji-site').deployment);
  assert.equal(evidenceAt(await cf('/pages/projects/doji-admin'),'canonical_deployment').id,'b95ceb19-9515-4e72-a7dc-9f9e665d8f1b');
  const endpoint=`https://${ref}.supabase.co/functions/v1/business-auth`;
  for(const [origin,body,status] of [['https://untrusted.invalid',{action:'register'},403],['https://business.dojipro.com',{action:'register',country:'CA'},400],['https://business.dojipro.com',{action:'signin',email:'release-check@test.invalid',password:'not-a-user-password'},400]] as const){
   const r=await fetch(endpoint,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});assert.equal(r.status,status);await r.text();
  }
  const state=beforeSQL();assert.equal(evidenceAt(state,'settings').realtime_enabled,false);assert.equal(evidenceAt(state,'admission').registration_limit,10);assert.equal(evidenceAt(state,'admission').email_limit,30);
  await save(`public-verified-${Date.now()}`,{at:new Date().toISOString(),deployment:evidenceAt(p,'canonical_deployment').id,exactAssets:true,existingProjectsUnchanged:true,noSyntheticAccountOrEmail:true,state});
  console.log('Exact hosted business launch verified. Owner signup/email/application remains to be exercised.');
 }
}
