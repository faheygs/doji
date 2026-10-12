// Diagnoses only a nonexistent job while sender gates are OFF. No real-job retry.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHmac} from 'node:crypto';
import {resolve} from 'node:path';
import {build} from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import {cli,ref,hash,inventory} from './prepare-safety-launch.mts';
import {evidenceRows as rows} from './release-evidence.mts';
const root='test-results/business-onboarding-release-20261011',secure='.artifacts/business-onboarding-release-20261011';
const mode=process.argv[2];assert.ok(['deploy','probe'].includes(mode||''));
const state=rows(cli(['db','query',"begin read only;select sending_enabled,capture_enabled from business_private.email_settings where singleton;rollback;",'--linked','--workdir','D:/ChallengeApp/DoIt','--output-format','json']))[0];
assert.deepEqual(state,{sending_enabled:false,capture_enabled:false});
if(mode==='deploy') {
 const dest=`${root}/mail-diagnostic/supabase/functions/business-application-mail`;await mkdir(dest,{recursive:true});
 const result=await build({entryPoints:['supabase/functions/business-application-mail/index.ts'],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022',external:['node:*','pg'],logLevel:'silent'});
 await writeFile(`${dest}/index.ts`,result.outputFiles[0]!.contents);
 await writeFile(`${dest}/deno.json`,await readFile('supabase/functions/business-application-mail/deno.json'));
 await writeFile(`${root}/mail-diagnostic/supabase/config.toml`,'project_id="business-mail-diagnostic"\n[functions.business-application-mail]\nverify_jwt=false\nimport_map="./functions/business-application-mail/deno.json"\n');
 cli(['functions','deploy','business-application-mail','--project-ref',ref,'--use-api','--workdir',resolve(root,'mail-diagnostic')],false);
 await writeFile(`${root}/mail-diagnostic-manifest.json`,JSON.stringify(await inventory(`${root}/mail-diagnostic`),null,2));
 console.log('Only isolated mail endpoint updated with credential-free failure phases; sending remains OFF.');
} else {
 const cfg=JSON.parse(await readFile(`${secure}/mail.json`,'utf8'));
 const body={id:'11000000-0000-4000-8000-000000000001',nonce:'11000000-0000-4000-8000-000000000002',expires:Math.floor(Date.now()/1000)+120};
 const signature=createHmac('sha256',cfg.signingKey).update(`${body.id}|${body.nonce}|${body.expires}`).digest('hex');
 const r=await fetch(`https://${ref}.supabase.co/functions/v1/business-application-mail`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...body,signature}),signal:AbortSignal.timeout(15000)});
 const result={status:r.status,body:await r.json()};console.log(JSON.stringify(result));
 await writeFile(`${root}/mail-probe-${Date.now()}.json`,JSON.stringify(result,null,2));
}
