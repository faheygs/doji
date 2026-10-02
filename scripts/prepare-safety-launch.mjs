// Read-only cloud capture and exact local release assembly. Never prints credentials.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
export const root='test-results/safety-launch-20260929';
export const ref='tvixsmqxotuvyjqzmjla';
export const account='04eab92db3126696f42644ede0943a09';
export const hash=v=>createHash('sha256').update(v).digest('hex');
export async function save(name,value){await mkdir(root,{recursive:true});await writeFile(`${root}/${name}`,JSON.stringify(value,null,2),{flag:'wx'});}
export function cli(args,parse=true){
 let out;try{out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js',...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:90000,maxBuffer:12e6});}
 catch{throw new Error(`Supabase ${args.slice(0,2).join(' ')} failed; sensitive output suppressed`);}
 return parse?JSON.parse(out.slice(out.indexOf('{'))):out;
}
export async function cf(path,init={}){
 const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...init.headers},signal:AbortSignal.timeout(25000)});
 const b=await r.json();assert.ok(r.ok&&b.success,`Cloudflare API status ${r.status}`);return b.result;
}
export async function inventory(dir,prefix=''){
 const rows=[];for(const v of await readdir(dir,{withFileTypes:true})){
  if(v.isDirectory())rows.push(...await inventory(`${dir}/${v.name}`,`${prefix}${v.name}/`));
  else rows.push({path:prefix+v.name,sha256:hash(await readFile(`${dir}/${v.name}`))});
 }return rows.sort((a,b)=>a.path.localeCompare(b.path));
}
async function main(){
 assert.equal(process.argv[2],'capture');
 assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),ref);
 await mkdir(root,{recursive:true});
 await save('functions-before.json',cli(['functions','list','--project-ref',ref,'--output-format','json']).functions);
 await save('secrets-before.json',cli(['secrets','list','--project-ref',ref,'--output-format','json']));
 const projects={};
 for(const name of ['doji-site','doji-admin']){
  const p=await cf(`/pages/projects/${name}`);
  projects[name]={name:p.name,domains:p.domains,production_branch:p.production_branch,source:p.source,build_config:p.build_config,canonical_deployment:p.canonical_deployment};
  // Deployment env_vars could be secret values. Keep only non-sensitive identity/config.
  delete projects[name].canonical_deployment?.env_vars;
 }
 await save('pages-before.json',projects);
 const query=`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'at',clock_timestamp(),'intake_installed',to_regclass('public.safety_removal_cases') is not null,
 'functions',(select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('md5',md5(pg_get_functiondef(p.oid)),'definition',pg_get_functiondef(p.oid),'acl',p.proacl::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f'),
 'policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in('public','storage')),
 'relations',(select jsonb_agg(jsonb_build_object('name',c.oid::regclass::text,'acl',c.relacl::text,'rls',c.relrowsecurity,'forced',c.relforcerowsecurity)) from pg_class c where c.relnamespace in('public'::regnamespace,'storage'::regnamespace) and c.relkind in('r','p','v','m')),
 'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public,'file_size_limit',file_size_limit,'allowed_mime_types',allowed_mime_types)) from storage.buckets),
 'jobs',(select jsonb_agg(jsonb_build_object('id',jobid,'name',jobname,'schedule',schedule,'active',active,'command_hash',md5(command))) from cron.job),
 'active_events',(select count(*) from public.daily_events where fires_at<=clock_timestamp() and fires_at+interval '10 minutes'>clock_timestamp()),
 'overdue_outbox',(select count(*) from public.domain_event_outbox where published_at is null and available_at<clock_timestamp()-interval '60 seconds'),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock')
 ) checks;rollback;`;
 const checks=cli(['db','query',query,'--linked','--output-format','json']).rows[0].checks;
 assert.equal(checks.intake_installed,false);await save('database-before.json',checks);
 for(const slug of ['delete-account','run-data-maintenance'])cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge-before`],false);
 await save('edge-before-manifest.json',await inventory(`${root}/edge-before`));
 console.log(JSON.stringify({root,functions:Object.keys(checks.functions).length,activeEvents:checks.active_events,overdueOutbox:checks.overdue_outbox,pages:Object.fromEntries(Object.entries(projects).map(([n,p])=>[n,{deployment:p.canonical_deployment.id,source:p.source,build:p.build_config,trigger:p.canonical_deployment.deployment_trigger}]))}));
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/prepare-safety-launch.mjs'))main().catch(e=>{console.error(e.message);process.exitCode=1;});
