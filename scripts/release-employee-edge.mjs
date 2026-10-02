// Exact employee-only function release. Existing functions/secret values and
// Pages deployments are preserved. No owner mapping or login enablement here.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir,access} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import {cli,cf,ref,inventory,hash} from './prepare-safety-launch.mjs';
const root='test-results/employee-edge-release-20261001';
const secure='.artifacts/employee-runtime';
const slug='employee-portal-v2';
const mode=process.argv[2];
assert.ok(['prepare','configure','deploy','verify','repair-package'].includes(mode));
const save=(name,value)=>writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2),{flag:'wx'});
const read=async name=>JSON.parse(await readFile(`${root}/${name}.json`,'utf8'));
const functions=()=>cli(['functions','list','--project-ref',ref,'--output-format','json']).functions;
const secrets=()=>cli(['secrets','list','--project-ref',ref,'--output-format','json']).secrets;
const pages=async()=>{const result={};for(const name of ['doji-admin','doji-business','doji-site'])result[name]=(await cf('/pages/projects/'+name)).canonical_deployment.id;return result;};
const manifest=async()=> (await inventory(`${root}/edge`)).filter(f=>!f.path.includes('/.temp/'));
async function verifyPrior(baseline,configured) {
 const current=functions();
 for(const old of baseline.functions) {
  const next=current.find(f=>f.id===old.id);assert.ok(next);
  assert.deepEqual({...next,version:old.version},old,'Existing function changed: '+old.slug);
  assert.equal(next.version,old.version+(configured?1:0),'Unexpected version: '+old.slug);
 }
 assert.equal(current.filter(f=>f.slug!==slug).length,baseline.functions.length);
 const now=secrets();
 for(const old of baseline.secrets) assert.equal(now.find(s=>s.name===old.name)?.digest,old.digest,'Existing secret changed: '+old.name);
 assert.deepEqual(await pages(),baseline.pages);
}
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),ref);
await mkdir(root,{recursive:true});
if(mode==='prepare') {
 const baseline={at:new Date().toISOString(),functions:functions(),secrets:secrets(),pages:await pages()};
 assert.ok(!baseline.functions.some(f=>f.slug===slug),'Existing endpoint: inspect instead of replacing');
 assert.ok(!baseline.secrets.some(s=>s.name.startsWith('EMPLOYEE_V2_')),'Existing configuration: inspect instead of replacing');
 const provider=JSON.parse(await readFile('.artifacts/workos-production/credentials.json','utf8'));
 assert.equal(provider.productionOnly,true);
 assert.equal(provider.employee.clientId,'client_01M3VE4WTBYS2XN6NZPH9EDMQD');
 const database=JSON.parse(await readFile(`${secure}/database.json`,'utf8'));
 assert.ok(database.ca);assert.equal(database.realm,'employee');
 assert.ok((await readdir('test-results/employee-sql-login-20261001')).some(f=>f.startsWith('verified-')));
 const monitoring=JSON.parse(await readFile(`${secure}/monitoring.json`,'utf8'));
 assert.equal(monitoring.scope,'event:read');assert.equal(monitoring.organization,'doji-i0');
 const config={realm:'employee',origin:'https://admin.dojipro.com',clientId:provider.employee.clientId,
  apiKey:provider.employee.apiKey,encryptionKey:randomBytes(32).toString('hex'),
  admissionKey:randomBytes(32).toString('hex'),proxyKey:randomBytes(32).toString('hex'),database,
  monitoring:{token:monitoring.token,organization:monitoring.organization,projectSlugs:['react-native']}};
 await writeFile(`${secure}/runtime.json`,JSON.stringify(config),{flag:'wx'});
 await writeFile(`${secure}/edge.env`,`EMPLOYEE_V2_ENABLED=false\nEMPLOYEE_V2_CONFIG='${JSON.stringify(config)}'\n`,{flag:'wx'});
 await mkdir(`${root}/edge/supabase/functions/${slug}`,{recursive:true});
 for(const file of ['index.ts','deno.json'])await cp(`supabase/functions/${slug}/${file}`,`${root}/edge/supabase/functions/${slug}/${file}`);
 await mkdir(`${root}/edge/infra/portal-identity-candidate`,{recursive:true});
 for(const file of await readdir('infra/portal-identity-candidate')) if(file.endsWith('.mjs'))
  await cp(`infra/portal-identity-candidate/${file}`,`${root}/edge/infra/portal-identity-candidate/${file}`);
 await writeFile(`${root}/edge/supabase/config.toml`,`project_id = "employee-independent-release"\n[functions.${slug}]\nverify_jwt = false\nimport_map = "./functions/${slug}/deno.json"\n`);
 await save('baseline',baseline);
 await save('candidate',{at:new Date().toISOString(),assets:await manifest(),configHash:hash(JSON.stringify(config)),enabled:false});
 console.log('Prepared exact disabled employee function and protected runtime configuration.');
}else {
 const baseline=await read('baseline');let candidate=await read('candidate');
 assert.deepEqual(await manifest(),candidate.assets);
 assert.equal(hash(await readFile(`${secure}/runtime.json`)),candidate.configHash);
 if(mode==='configure') {
  await verifyPrior(baseline,false);
  await assert.rejects(access(`${root}/configure-started.json`));
  await save('configure-started',{at:new Date().toISOString()});
  cli(['secrets','set','--env-file',`${secure}/edge.env`,'--project-ref',ref],false);
  await verifyPrior(baseline,true);
  await save('configured',{at:new Date().toISOString(),enabled:false});
  console.log('Only new employee configuration installed; old credentials and source unchanged.');
 }else {
  await read('configured');await verifyPrior(baseline,true);
  if(mode==='repair-package') {
   // Keep all imported files inside the function extraction boundary. This
   // changes import locations only, never bypasses the CLI's safe-path guard.
   await save('candidate-before-package',candidate);
   await cp(`${root}/edge/infra/portal-identity-candidate`,`${root}/edge/supabase/functions/${slug}/runtime`,{recursive:true});
   const entry=`${root}/edge/supabase/functions/${slug}/index.ts`;
   const old=await readFile(entry,'utf8');
   assert.equal(old.split('../../../infra/portal-identity-candidate/').length-1,2);
   await writeFile(entry,old.replaceAll('../../../infra/portal-identity-candidate/','./runtime/'));
   candidate={...candidate,assets:await manifest(),packagedAt:new Date().toISOString()};
   await writeFile(`${root}/candidate.json`,JSON.stringify(candidate,null,2));
   await save('package-deploy-started',{at:new Date().toISOString(),scope:slug});
   cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge`],false);
  }
  if(mode==='deploy') {
   await assert.rejects(access(`${root}/deploy-started.json`));
   await save('deploy-started',{at:new Date().toISOString(),scope:slug});
   cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge`],false);
  }
  const deployed=functions().find(f=>f.slug===slug);assert.equal(deployed?.status,'ACTIVE');assert.equal(deployed.verify_jwt,false);
  await verifyPrior(baseline,true);
  const responses=[];
  for(const path of ['/api/session','/auth/start']) {
   const r=await fetch(`https://${ref}.supabase.co/functions/v1/${slug}${path}`,{method:path.includes('start')?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(15000)});
   responses.push({path,status:r.status,cacheControl:r.headers.get('cache-control')});
   assert.equal(r.status,503);assert.equal(r.headers.get('cache-control'),'no-store');
  }
  const folder=`${root}/download-${Date.now()}`;
  await mkdir(folder,{recursive:true});
  cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',folder],false);
  const downloaded=await inventory(folder);
  // Every source file must exist byte-for-byte in the downloaded bundle. Paths
  // can be canonicalized by the platform but contents cannot be substituted.
  const pending=[`supabase/functions/${slug}/index.ts`],required=new Set();
  const {posix}=await import('node:path');
  while(pending.length){
   const path=pending.pop();if(required.has(path))continue;required.add(path);
   const source=await readFile(`${root}/edge/${path}`,'utf8');
   for(const match of source.matchAll(/(?:from\s+|import\s*)['"](\.[^'"]+)['"]/g))
    pending.push(posix.normalize(posix.join(posix.dirname(path),match[1])));
  }
  for(const file of candidate.assets.filter(f=>required.has(f.path))){
   const found=downloaded.find(d=>d.path.endsWith('/'+file.path.split('/').at(-1)));
   assert.ok(found,'Missing deployed source '+file.path);
   const normalized=path=>readFile(path,'utf8').then(s=>hash(s.replaceAll('\r\n','\n')));
   assert.equal(await normalized(`${folder}/${found.path}`),await normalized(`${root}/edge/${file.path}`));
  }
  await save('verified-'+Date.now(),{at:new Date().toISOString(),function:{id:deployed.id,version:deployed.version,hash:deployed.ezbr_sha256},responses,existingFunctionsUnchanged:true,existingSecretDigestsUnchanged:true,pagesUnchanged:true,employeeLoginEnabled:false});
  console.log('Exact employee endpoint deployed and verified DISABLED; all existing portals and function sources unchanged.');
 }
}
