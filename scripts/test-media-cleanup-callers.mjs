import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=path=>ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
let passed=0;
for(const enabled of [false,true]) for(const failing of [false,true]) {
 const calls=[],acks=[];let handler;let deletedIdentity=false;
 const cleanup={available:()=>true,fetch:async()=>{throw Error('No real network');},remove:async(bucket,paths)=>{
  calls.push(['guard',bucket,paths]);if(failing)throw Error('Synthetic provider outage');
  return {completed:paths.filter(p=>!p.includes('held')),deferred:paths.filter(p=>p.includes('held'))};
 }};
 const database={storage:{from:bucket=>({list:async()=>({data:[{id:'1',name:'held.jpg'},{id:'2',name:'free.jpg'}],error:null}),
  remove:async paths=>{calls.push(['raw',bucket,paths]);return {error:failing?{message:'Synthetic provider outage'}:null};}})},
  rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(name==='run_operational_retention_batch')return {data:{has_more:false}};
   if(['claim_media_cleanup_candidates_v1','claim_expired_media_upload_intents','claim_pending_media_deletions'].includes(name))return {data:[{id:'held-id',bucket_id:'post-media',object_path:'u/held.jpg'},{id:'free-id',bucket_id:'post-media',object_path:'u/free.jpg'}]};
   if(name==='claim_account_deletion_cleanup')return {data:[{user_id:'u',claim_token:'claim'}]};
   if(name==='finish_account_deletion_cleanup'){acks.push(args);return {data:null};}
   if(['delete_media_upload_intents','delete_pending_media_deletions'].includes(name)){acks.push(args);return {data:args.p_ids.length};}
   return {data:0,error:null};
  },auth:{getUser:async()=>({data:{user:{id:'u'}}}),admin:{deleteUser:async()=>{deletedIdentity=true;return {error:null};}}},
  from:()=>({upsert:async()=>({error:null}),delete:()=>({eq:async()=>{acks.push('account-intent-deleted');return {error:null};}}),update:()=>({eq:async()=>({error:null})})})};
 const env={OUTBOX_RELAY_SECRET:'local-only',SUPABASE_URL:'https://local.invalid',SUPABASE_SERVICE_ROLE_KEY:'local-only',SUPABASE_ANON_KEY:'local-only',MODERATION_MEDIA_CLEANUP_ENABLED:String(enabled)};
 function load(path){const module={exports:{}};vm.runInNewContext(compile(path),{module,exports:module.exports,Request,Response,crypto:globalThis.crypto,fetch:cleanup.fetch,console:{error(){}},
  Deno:{env:{get:k=>env[k]},serve:fn=>{handler=fn;}},require:name=>name.startsWith('https:')?{createClient:()=>database}:{createMediaCleanupClient:()=>cleanup}});}
 load('supabase/functions/run-data-maintenance/index.ts');
 const response=await handler(new Request('https://local.invalid',{method:'POST',headers:{'x-outbox-secret':'local-only'}}));
 if(enabled){assert.equal(response.status,200);assert.equal(calls.filter(c=>c[0]==='raw').length,0);
  assert.ok(calls.some(c=>c[1]==='delete_stale_push_endpoints'),'media failures do not stop unrelated retention');
  for(const ack of acks.filter(a=>a.p_ids))assert.deepEqual([...ack.p_ids],failing?[]:['free-id']);
  assert.ok(acks.find(a=>a.p_user_id==='u').p_error,'deferred account work not falsely acknowledged');
 }else{assert.equal(response.status,failing?500:200);assert.equal(calls.filter(c=>c[0]==='guard').length,0);}
 passed++;
 calls.length=0;acks.length=0;load('supabase/functions/delete-account/index.ts');
 const deletion=await handler(new Request('https://local.invalid',{method:'POST',headers:{authorization:'Bearer synthetic'}}));
 assert.equal(deletion.status,200);assert.equal(deletedIdentity,true,'storage failure must not retain authenticated account');
 if(enabled){assert.equal(calls.filter(c=>c[0]==='raw').length,0);assert.ok(!acks.includes('account-intent-deleted'));}
 else assert.equal(calls.filter(c=>c[0]==='guard').length,0);
 passed++;
}
// Exercise the real budgeted adapter with the real per-file fence, mocked transport.
const actual={exports:{}};
vm.runInNewContext(compile('supabase/functions/_shared/moderation-media-cleanup.ts'),{module:actual,exports:actual.exports});
const id={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',version:'v1',size:7,mime:'image/jpeg'};
let removed=[],present=new Set(['one','two']);
const port={inspect:async o=>present.has(o.path)?id:null,remove:async o=>{removed.push(o.path);present.delete(o.path);}};
const adapter={exports:{}};
vm.runInNewContext(compile('supabase/functions/_shared/moderation-media-cleanup-client.ts'),{module:adapter,exports:adapter.exports,Date,AbortSignal,Error,Set,
 require:name=>name.includes('cleanup.ts')?actual.exports:name.includes('storage.ts')?{moderationStorage:()=>port}:{employeeServiceHeaders:()=>({})}});
const upstream=async(url,init)=>{assert.ok(init.signal);const args=JSON.parse(init.body);
 if(url.endsWith('claim_media_cleanup_v1'))return Response.json(args.p_paths[0]==='held'?[]:[{path:args.p_paths[0],state:'claimed',lease_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',original:id}]);
 return Response.json(true);};
const client=adapter.exports.createMediaCleanupClient('https://local.invalid','local-only',upstream,5000,1);
const result=await client.remove('post-media',['held','one','two']);
assert.deepEqual([...result.completed],['one']);assert.deepEqual([...result.deferred],['held','two']);assert.deepEqual(removed,['one']);assert.equal(client.available(),false);passed++;
console.log(`${passed} actual cleanup caller/adapter scenarios passed: no real requests, flag-off baseline, held/failed acknowledgements, account deletion and shared budgets.`);
