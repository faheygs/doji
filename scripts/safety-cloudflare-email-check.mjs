// One explicitly labelled owner-inbox canary, never a real removal case.
// Read-only unless --send-once is supplied. Existing local OAuth is used only
// for this diagnostic; never store/deploy it as the production mail credential.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import ts from 'typescript';
import assert from 'node:assert/strict';
const source=await readFile('supabase/functions/_shared/safety-removal-cloudflare.ts','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ES2022,target:ts.ScriptTarget.ES2022}}).outputText;
const {verifySafetyAlertDestination,cloudflareMailBase,safetyAlertRecipient,safetyAlertSender,classifyCloudflareMail}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(token,'Existing Cloudflare login required');
const config={accountId:'04eab92db3126696f42644ede0943a09',token};
const verified=await verifySafetyAlertDestination(config);
console.log(JSON.stringify({verifiedDestination:verified,recipient:safetyAlertRecipient}));
assert.ok(verified,'Verified destination required; no send attempted');
if(process.argv.includes('--send-once')){
 await mkdir('test-results/cloudflare-safety-email',{recursive:true});
 const path='test-results/cloudflare-safety-email/canary-attempt.json';
 // Persist intent BEFORE network. Never auto-retry this canary after ambiguity.
 await writeFile(path,JSON.stringify({at:new Date().toISOString(),state:'started'},null,2),{flag:'wx'});
 try{
  const r=await fetch(`${cloudflareMailBase(config)}/email/sending/send`,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},redirect:'error',signal:AbortSignal.timeout(15000),body:JSON.stringify({
   from:safetyAlertSender,to:safetyAlertRecipient,subject:'Doji · Cloudflare safety email TEST',
   text:'This is the authorized Cloudflare administrator-email delivery test. No removal request was submitted, no member data is included, and no moderation action was taken. The public intake remains disabled pending launch qualification.'})});
  const body=await r.json().catch(()=>null);
  const result={at:new Date().toISOString(),httpStatus:r.status,...classifyCloudflareMail(r.status,body),errorCodes:body?.errors?.map(v=>v.code)};
  await writeFile('test-results/cloudflare-safety-email/canary-result.json',JSON.stringify(result,null,2),{flag:'wx'});
  console.log(JSON.stringify(result));
 }catch{
  console.log('Canary outcome uncertain. Inspect Cloudflare email logs; do not resend automatically.');process.exitCode=1;
 }
}
