// Same-origin employee acceptance path. Legacy admin assets stay byte-identical.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cf,hash,inventory,account,ref} from './prepare-safety-launch.mjs';
const root='test-results/employee-preview-20261001',site=root+'/site';
const base='test-results/employee-setup-page-20261001/site';
const build='website/.business-admin-qa-20261001';
const prefix='identity/employee-preview';
const mode=process.argv[2];assert.ok(['prepare','configure','deploy','verify'].includes(mode));
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const save=(n,v)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
async function pages(){const ids={};for(const n of ['doji-admin','doji-business','doji-site'])ids[n]=(await cf('/pages/projects/'+n)).canonical_deployment.id;return ids;}
await mkdir(root,{recursive:true});
if(mode==='prepare'){
 await read('test-results/employee-edge-release-20261001/enabled-verified.json');
 const project=await cf('/pages/projects/doji-admin');
 assert.equal(project.canonical_deployment.id,'a64aeea7-63d6-431d-ab09-24bdb48db756');assert.equal(project.production_branch,'main');
 assert.deepEqual(project.deployment_configs.production.env_vars||{},{});
 const original=await read('test-results/employee-setup-page-20261001/candidate.json');
 assert.deepEqual(await inventory(base),original.assets);
 await cp(base,site,{recursive:true,errorOnExist:true,force:false});
 for(const f of await inventory(build)){
  if(f.path.startsWith('_')||f.path==='robots.txt')continue;
  const path=`${site}/${prefix}/${f.path}`;await mkdir(path.slice(0,path.lastIndexOf('/')),{recursive:true});await cp(`${build}/${f.path}`,path);
 }
 await cp(`${build}/_worker.js`,`${site}/_worker.js`);
 await writeFile(`${site}/_routes.json`,JSON.stringify({version:1,include:['/auth/*','/api/*','/identity/setup-complete'],exclude:[]}));
 const manifest=await inventory(site);
 for(const old of original.assets)assert.equal(manifest.find(f=>f.path===old.path)?.sha256,old.sha256,'Legacy asset changed');
 const html=await readFile(`${site}/${prefix}/index.html`,'utf8');
 assert.ok(!html.includes('/employee-setup/return.js'));
 for(const m of html.matchAll(/(?:src|href)="(\/identity\/employee-preview\/[^"?#]+)[^"#]*"/g))await access(`${site}${m[1]}`);
 const bundle=await readFile(`${site}/${prefix}/admin-portal/admin-app-20260925ap.js`,'utf8');assert.ok(bundle.includes('"independentEmployeeIdentity": true'));
 assert.ok(!bundle.includes("import('/admin-portal/"));
 const config=await read('.artifacts/employee-runtime/runtime.json');
 for(const secret of [config.apiKey,config.database.password,config.proxyKey,config.encryptionKey,config.monitoring.token])assert.ok(!bundle.includes(secret));
 await save('candidate',{at:new Date().toISOString(),pages:await pages(),configuration:project.deployment_configs,assets:manifest,legacyAssets:original.assets,url:'https://admin.dojipro.com/'+prefix+'/',ownerAcceptance:false});
 console.log('Employee acceptance overlay prepared; every existing live admin asset unchanged.');
}else{
 const c=await read(`${root}/candidate.json`);assert.deepEqual(await inventory(site),c.assets);
 if(mode==='configure'){
  assert.deepEqual(await pages(),c.pages);const project=await cf('/pages/projects/doji-admin');assert.deepEqual(project.deployment_configs,c.configuration);
  const config=await read('.artifacts/employee-runtime/runtime.json');
  await save('configure-started-'+Date.now(),{at:new Date().toISOString()});
  const patch={deployment_configs:{production:{
   env_vars:{EMPLOYEE_V2_ENABLED:{type:'plain_text',value:'true'},EMPLOYEE_V2_ENDPOINT:{type:'plain_text',value:`https://${ref}.supabase.co/functions/v1/employee-portal-v2`},EMPLOYEE_V2_PROXY_KEY:{type:'secret_text',value:config.proxyKey}},
   compatibility_flags:[...new Set([...c.configuration.production.compatibility_flags,'nodejs_compat'])],fail_open:false,
  },preview:{fail_open:false}}};
  const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/doji-admin`,{method:'PATCH',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(patch),signal:AbortSignal.timeout(20000)});
  const result=await response.json();
  if(!response.ok||!result.success){
   const protectedValues=[token,config.proxyKey,config.apiKey,config.database.password,config.encryptionKey,config.monitoring.token];
   const safe=JSON.stringify(result.errors?.map(e=>({code:e.code,message:e.message}))||[]);
   console.log(protectedValues.reduce((text,value)=>text.replaceAll(value,'[REDACTED]'),safe));
   throw Error('Employee proxy configuration rejected: HTTP '+response.status);
  }
  const after=await cf('/pages/projects/doji-admin');assert.deepEqual(after.deployment_configs.preview,{...c.configuration.preview,fail_open:false});
  assert.deepEqual(await pages(),c.pages);assert.equal(after.deployment_configs.production.env_vars.EMPLOYEE_V2_PROXY_KEY.type,'secret_text');
  await save('configured',{at:new Date().toISOString(),employeeProxyOnly:true});console.log('Employee proxy secret configured server-side only; existing deployment unchanged.');process.exit(0);
 }
 if(mode==='deploy'){
  await read(`${root}/configured.json`);assert.deepEqual(await pages(),c.pages);await assert.rejects(access(`${root}/deploy-started.json`));
  await save('deploy-started',{at:new Date().toISOString(),rollback:c.pages['doji-admin']});
  try{execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',site,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Independent employee owner acceptance; legacy portal preserved'],{stdio:['ignore','pipe','pipe'],encoding:'utf8',timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});}catch{throw Error('Deployment response unavailable. Inspect status before retrying.');}
 }
 const ids=await pages();assert.notEqual(ids['doji-admin'],c.pages['doji-admin']);assert.equal(ids['doji-business'],c.pages['doji-business']);assert.equal(ids['doji-site'],c.pages['doji-site']);
 const p=await cf('/pages/projects/doji-admin');assert.equal(p.canonical_deployment.latest_stage.status,'success');
 for(const path of ['index.html','admin-portal/admin-app-20260930business1.js',`${prefix}/index.html`,`${prefix}/admin-portal/admin-app-20260925ap.js`]){
  const r=await fetch('https://admin.dojipro.com/'+path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),c.assets.find(a=>a.path===path).sha256,path);
 }
 const probes=[];
 for(const [headers,status] of [[{origin:'https://admin.dojipro.com'},401],[{origin:'https://business.dojipro.com'},403]]){
  const r=await fetch('https://admin.dojipro.com/api/session',{headers,signal:AbortSignal.timeout(15000)});probes.push(r.status);assert.equal(r.status,status);assert.equal(r.headers.get('cache-control'),'no-store');
 }
 await save('verified-'+Date.now(),{at:new Date().toISOString(),deployment:ids['doji-admin'],url:c.url,rollback:c.pages['doji-admin'],legacyAssetsUnchanged:true,businessAndPublicSitesUnchanged:true,probes,ownerAcceptance:false});
 console.log('Independent employee login preview is LIVE, source-verified and denies unauthenticated/cross-origin requests. Legacy admin login preserved.');
}
