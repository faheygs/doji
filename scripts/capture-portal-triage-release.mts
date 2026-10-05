// Read-only hosted preflight; capture immutable release evidence, never credentials.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { evidenceRecord, evidenceArray, firstEvidence } from './release-evidence.mts';
const editorial=process.argv.includes('--editorial');
const root=editorial?'test-results/portal-editorial-release-20260927':'test-results/portal-triage-release-20260927';
await mkdir(root,{recursive:true});
const save=async (name:string,value:unknown)=>writeFile(`${root}/${name}`,typeof value==='string'?value:JSON.stringify(value,null,2),{flag:'wx'});
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),'tvixsmqxotuvyjqzmjla');
const mode=process.argv[2];
assert.ok(mode && ['database','cloudflare'].includes(mode));
if(mode==='database') {
 const raw=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file',editorial?'scripts/portal-editorial-preflight.sql':'scripts/portal-triage-preflight.sql'],{encoding:'utf8',timeout:30000,maxBuffer:2e6});
 const b=firstEvidence(JSON.parse(raw.slice(raw.indexOf('{'))),'baseline');
 await save('database-before.json',b);
 console.log(JSON.stringify({functions:Object.keys(evidenceRecord(b.functions)).length,editorialTables:b.editorial_tables,defaultACL:b.default_acl,decisionRows:b.decision_rows,avatarDecisionRows:b.avatar_decision_rows,decisionBytes:b.decision_bytes,databaseBytes:b.database_bytes,avatarBucketPublic:b.avatar_bucket_public,nextEvent:b.next_event,activeEvents:b.active_events,overdueOutbox:b.overdue_outbox,lockWaits:b.lock_waits}));
} else {
 const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
 assert.ok(token);
 const api='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09';
 async function get(path:string){const r=await fetch(api+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`Read ${path}: ${r.status}`);return r;}
 const worker='/workers/scripts/doji-orchestrator';
 const settings=evidenceRecord(evidenceRecord(await (await get(worker+'/settings')).json()).result);
 for(const b of evidenceArray(settings.bindings??[])) if(b.type==='secret_text') assert.equal(b.text,undefined);
 await save('worker-settings.json',settings);
 const form=await (await get(worker+'/content/v2')).formData();
 const modules=[];
 for(const [field,file] of form) if(typeof file!=='string') {
   assert.ok(/^[\w.-]+$/.test(file.name));
   const bytes=Buffer.from(await file.arrayBuffer());
   await writeFile(`${root}/live-${file.name}`,bytes,{flag:'wx'});
   modules.push({field,file:file.name,type:file.type,sha256:createHash('sha256').update(bytes).digest('hex')});
 }
 await save('worker-modules.json',modules);
 const schedules=(await (await get(worker+'/schedules')).json()).result;
 const deployments=evidenceRecord(evidenceRecord(await (await get(worker+'/deployments')).json()).result);
 const project=evidenceRecord(evidenceRecord(await (await get('/pages/projects/doji-admin')).json()).result);
 const deployment=project.canonical_deployment==null?{}:evidenceRecord(project.canonical_deployment);
 // Do not persist Pages environment variables/secrets.
 const pages={id:project.id,name:project.name,productionBranch:project.production_branch,deploymentId:deployment.id,deploymentUrl:deployment.url};
 await save('cloudflare-before.json',{schedules,deployments,pages});
 console.log(JSON.stringify({modules,pages,schedules,workerDeployment:evidenceArray(deployments.deployments??[])[0]},null,2));
}
