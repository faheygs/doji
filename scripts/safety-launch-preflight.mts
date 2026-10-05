// Read-only hosted preflight. Never emits credentials, request content or member data.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import {evidenceRecord,evidenceArray,firstEvidence} from './release-evidence.mts';
const mode = process.argv[2];
assert.ok(mode && ['database','hosting'].includes(mode));
await mkdir('test-results', { recursive: true });
const folder = await mkdtemp('test-results/safety-launch-preflight-');
if (mode === 'database') {
  assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),'tvixsmqxotuvyjqzmjla');
  const raw = execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file','scripts/safety-launch-preflight.sql'],{encoding:'utf8',timeout:30000,maxBuffer:500000});
  const checks = firstEvidence(JSON.parse(raw.slice(raw.indexOf('{'))),'checks');
  await writeFile(`${folder}/database.json`,JSON.stringify(checks,null,2),{flag:'wx'});
  console.log(JSON.stringify({...checks, shared_functions:Object.keys(evidenceRecord(checks.shared_functions ?? {})), profile_triggers:checks.profile_triggers==null?undefined:evidenceArray(checks.profile_triggers).map(t=>t.function), evidence:folder},null,2));
} else {
  const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(token,'Existing Cloudflare login required');
  const api='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09';
  const checks:Record<string,unknown>={at:new Date().toISOString()};
  for (const [label,path] of [['pages','/pages/projects'],['turnstile','/challenges/widgets']] as const) {
    const r=await fetch(api+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
    // API bodies may include secrets. Project only explicitly safe status fields.
    const body=evidenceRecord(await r.json());
    const check:Record<string,unknown>={status:r.status,success:body.success===true};checks[label]=check;
    if(r.ok && body.success) check.items=evidenceArray(body.result??[]).map(v=>label==='pages'
      ? {name:v.name,domains:v.domains,branch:v.production_branch,deploymentId:v.canonical_deployment==null?undefined:evidenceRecord(v.canonical_deployment).id,url:v.canonical_deployment==null?undefined:evidenceRecord(v.canonical_deployment).url}
      : {name:v.name,domains:v.domains,mode:v.mode});
  }
  await writeFile(`${folder}/hosting.json`,JSON.stringify(checks,null,2),{flag:'wx'});
  console.log(JSON.stringify({...checks,evidence:folder},null,2));
}
