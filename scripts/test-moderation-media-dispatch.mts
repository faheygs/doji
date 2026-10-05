import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import type {MediaPort,ObjectIdentity} from '../supabase/functions/_shared/moderation-media.ts';
import {capturedRequest} from './http-test-values.mts';
import {evidenceRecord} from './release-evidence.mts';
const require=createRequire(import.meta.url),cache=new Map<string,Record<string,unknown>>();
function load(path:string):Record<string,unknown>{const cached=cache.get(path);if(cached)return cached;const module={exports:{}};
 const localRequire=(name:string):unknown=>name.startsWith('npm:')?require(name.replace('npm:','').replace('@1.8.0','')):load(new URL(name,`file:///${path.replaceAll('\\','/')}`).pathname.replace(/^\/([A-Z]:)/,'$1'));
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:localRequire,Request,Response,Headers,fetch,crypto,AbortSignal,URL,Uint8Array,TextDecoder},{filename:path});
 cache.set(path,module.exports);return module.exports;
}
const {moderationMediaDispatch}=load(`${process.cwd()}/supabase/functions/_shared/moderation-media-dispatch.ts`) as {moderationMediaDispatch:(request:Request,environment:typeof env,upstream?:typeof fetch,port?:MediaPort)=>Promise<Response>};
const env={enabled:true,secret:'synthetic-dispatch-only',supabaseUrl:'https://test.invalid',serviceKey:'sb_secret_fixture'};
const request=()=>new Request('https://test.invalid/dispatch',{method:'POST',headers:{authorization:`Bearer ${env.secret}`}});
const original={id:'11111111-2222-4333-8444-555555555555',version:'v1',size:7,mime:'image/jpeg'};
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',lease='cccccccc-bbbb-4ccc-8ddd-eeeeeeeeeeee';
function fixture(mode:string){
 const job={id,lease_id:lease,revision:1,source:{bucket:'avatars',path:`${original.id}/fixture.jpg`},
 evidence:{bucket:'moderation-evidence',path:`${id}/original`},original,archived:null};
 let source:ObjectIdentity|null={...original},evidence:ObjectIdentity|null=null,proof:unknown=null,deleted=false;const calls:{name:string|undefined;args:Record<string,unknown>}[]=[];
 const port:MediaPort={assertPrivateEvidence:async()=>{},inspect:async o=>o.bucket==='moderation-evidence'?evidence:source,
 digest:async()=>({sha256:createHash('sha256').update('fixture').digest('hex'),size:7}),
 copy:async()=>{evidence={...original,id:'22222222-2222-4333-8444-555555555555',version:'copy'};},
 remove:async()=>{assert.ok(proof);deleted=true;source=null;},
 prepareAccessProbe:async()=>({signedPath:`/object/sign/avatars/${original.id}/fixture.jpg?token=synthetic`,expiresAt:new Date(Date.now()+86400000).toISOString()}),
 verifyAccessProbe:async()=>{}};
 if(mode==='sourceChanged')source.version='mutated';
 const rpc:typeof fetch=async(input,init)=>{
  const {url,init:options}=capturedRequest(input,init);
  assert.equal(options.headers.authorization,undefined,'opaque service key must not be sent as a JWT');
  assert.equal(options.headers.apikey,env.serviceKey);const args=evidenceRecord(JSON.parse(options.body)),name=url.split('/').at(-1);calls.push({name,args});
  if(name==='claim_moderation_media_v1')return Response.json(mode==='empty'?null:job);
  if(name==='check_moderation_media_lease_v1')return Response.json(mode!=='staleLease');
  if(name==='save_moderation_media_archive_v1'){
   if(mode==='rejectedProof')return Response.json(false);
   proof=args.p_proof;return Response.json(true);
  }
  if(name==='finish_moderation_media_origin_v1'&&mode==='lostAck')throw Error('PRIVATE endpoint details');
  return Response.json(true);
 };
 return{port,rpc,calls,get deleted(){return deleted;}};
}
for(const mode of ['normal','empty','staleLease','rejectedProof','sourceChanged','lostAck']){
 const f=fixture(mode),r=await moderationMediaDispatch(request(),env,f.rpc,f.port),body=await r.json();
 assert.equal(r.status,['normal','empty'].includes(mode)?200:503);assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 if(mode==='normal'){assert.equal(f.deleted,true);assert.equal(body.state,'origin_removed');assert.equal(body.revocation_verified,false);}
 else if(mode!=='lostAck')assert.equal(f.deleted,false);
 if(mode==='sourceChanged')assert.equal(f.calls.at(-1)?.args.p_terminal,true);
 if(mode==='lostAck')assert.equal(f.calls.at(-1)?.args.p_terminal,false);
}
const none=async()=>{throw Error('Must not call network');};
for(const mode of ['restored','staleRestore','restoreConflict','restoreLostAck','restoreRejectedAck']){
 const f=fixture('normal');
 const rpc:typeof fetch=async(input,init)=>{
  const {url,init:options}=capturedRequest(input,init);
  const name=url.split('/').at(-1);
  if(name==='claim_moderation_media_v1'){
   const job=await(await f.rpc(url,options)).json();job.operation='restore';
   if(mode==='restoreConflict')job.original={...job.original,version:'mismatch'};
   return Response.json(job);
  }
  if(name==='check_moderation_media_lease_v1'&&mode==='staleRestore')return Response.json(false);
  if(name==='finish_moderation_media_restore_v1'){
   assert.deepEqual(JSON.parse(options.body).p_identity,original);
   if(mode==='restoreLostAck')throw Error('PRIVATE provider details');
   if(mode==='restoreRejectedAck')return Response.json(false);
  }
  return f.rpc(url,options);
 };
 const response=await moderationMediaDispatch(request(),env,rpc,f.port),body=await response.json();
 assert.equal(response.status,mode==='restored'?200:503);
 assert.equal(f.deleted,false);assert.ok(!JSON.stringify(body).includes('PRIVATE'));
 if(mode==='restored')assert.equal(body.state,'restored');
 if(mode==='restoreConflict')assert.equal(f.calls.at(-1)?.args.p_terminal,true);
}
assert.equal((await moderationMediaDispatch(request(),{...env,enabled:false},none)).status,503);
assert.equal((await moderationMediaDispatch(new Request('https://test.invalid',{method:'POST'}),env,none)).status,401);
const {MediaFailure}=load(`${process.cwd()}/supabase/functions/_shared/moderation-media.ts`) as {MediaFailure:new(code:string)=>Error};
for(const mode of ['verify','probeMissing','archiveMissing','stillAccessible','verifyRejected','cancelRestore']){
 const f=fixture('normal'),identity={...original,id:'22222222-2222-4333-8444-555555555555',version:'archive-v1'};
 f.port.inspect=async object=>object.bucket==='moderation-evidence'&&mode!=='archiveMissing'?identity:null;
 f.port.verifyAccessProbe=async()=>{if(mode==='stillAccessible')throw new MediaFailure('access_not_revoked');};
 const rpc:typeof fetch=async(input,init)=>{
  const {url,init:options}=capturedRequest(input,init);
  const name=url.split('/').at(-1);
  if(name==='claim_moderation_media_v1'){
   const job=await(await f.rpc(url,options)).json();job.operation=mode==='cancelRestore'?'cancel_restore':'verify';
   job.archived={sha256:'a'.repeat(64),size:7,evidenceIdentity:identity};
   if(mode!=='probeMissing')job.access_probe={signedPath:'/object/sign/avatars/fixture.jpg?token=synthetic',expiresAt:new Date(Date.now()+86400000).toISOString()};
   return Response.json(job);
  }
  if(name==='finish_moderation_media_revocation_v1'&&mode==='verifyRejected')return Response.json(false);
  return f.rpc(url,options);
 };
 const response=await moderationMediaDispatch(request(),env,rpc,f.port),body=await response.json();
 assert.equal(response.status,['verify','cancelRestore'].includes(mode)?200:503);
 assert.equal(f.deleted,false,'verification/cancellation does not delete or copy objects');
 if(mode==='verify')assert.equal(body.state,'revoked');
 if(mode==='cancelRestore')assert.equal(body.state,'restoration_cancelled');
 if(mode==='stillAccessible')assert.equal(f.calls.at(-1)?.args.p_terminal,false);
}
const {moderationStorage}=load(`${process.cwd()}/supabase/functions/_shared/moderation-media-storage.ts`) as {moderationStorage:(url:string,key:string,upstream:typeof fetch)=>MediaPort};
const probe={signedPath:'/object/sign/post-media/fixture.jpg?token=synthetic',expiresAt:new Date(Date.now()+86400000).toISOString()};
for(const mode of ['missing','available','proxy404','expiredJWT','serverError','network','oversized','wrongOrigin','expiredProbe']){
 let calls=0;
 const upstream:typeof fetch=async(_url,init)=>{
  assert.ok(init);const options={...init,headers:Object.fromEntries(new Headers(init.headers))};
  calls++;assert.equal(options.headers.authorization,undefined);assert.equal(options.headers.apikey,undefined);
  assert.equal(options.headers.range,'bytes=0-0');assert.equal(options.redirect,'error');
  if(mode==='network')throw Error('PRIVATE upstream path');
  if(mode==='missing')return Response.json({code:'NoSuchKey'},{status:404});
  if(mode==='available')return new Response('x',{status:206});
  if(mode==='proxy404')return new Response('<h1>Not found</h1>',{status:404});
  if(mode==='oversized')return new Response('x'.repeat(5000),{status:404});
  return Response.json({error:'InvalidJWT'}, {status:mode==='serverError'?503:400});
 };
 const port=moderationStorage('https://test.invalid','sb_secret_fixture',upstream);
 const input={...probe,...mode==='wrongOrigin'?{signedPath:'https://other.invalid/private'}:{},...mode==='expiredProbe'?{expiresAt:new Date(0).toISOString()}:{}};
 const operation=port.verifyAccessProbe({bucket:'post-media',path:'fixture.jpg'},input);
 if(mode==='missing')await operation;else await assert.rejects(operation);
 if(['wrongOrigin','expiredProbe'].includes(mode))assert.equal(calls,0);
}
console.log('28 offline media-dispatch/access-probe scenarios passed, including closure acknowledgements, cancellation, SSRF/expiry rejection and provider-error separation.');
