import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/moderation-media-cleanup.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports});
const {guardedMediaCleanup}=module.exports;
const identity={id:'11111111-1111-4111-8111-111111111111',version:'v1',size:7,mime:'image/jpeg'};
let passed=0;
for(const mode of ['normal','held','stale','changed','missing','complete','completeReplaced','extraPath','duplicatePath','invalidLease','lostDeleteAck','failedFinish','lostFinishAck']){
 let exists=!['missing','complete'].includes(mode),deleted=false,ack=false;
 const claim={path:'fixture/file.jpg',state:mode.startsWith('complete')?'complete':'claimed',lease_id:'22222222-2222-4222-8222-222222222222',original:identity};
 const port={inspect:async()=>exists?{...identity,version:mode==='changed'?'v2':'v1'}:null,
  remove:async()=>{deleted=true;exists=false;if(mode==='lostDeleteAck')throw Error('synthetic lost response');}};
 const rpc=async(name,args)=>{
  if(name==='claim_media_cleanup_v1'){
   if(mode==='held')return [];
   if(mode==='extraPath')return [{...claim,path:'unrequested/file.jpg'}];
   if(mode==='duplicatePath')return [claim,claim];
   if(mode==='invalidLease')return [{...claim,lease_id:'bad'}];
   return [claim];
  }
  assert.equal(args.p_path,claim.path);
  if(name==='check_media_cleanup_lease_v1')return mode!=='stale';
  if(name==='finish_media_cleanup_v1'){
   if(mode==='lostFinishAck')throw Error('synthetic lost response');
   if(mode==='failedFinish')return false;
   ack=true;return true;
  }
  throw Error('Unexpected RPC');
 };
 if(['normal','held','missing','complete'].includes(mode)){
  const r=await guardedMediaCleanup('post-media',[claim.path],rpc,port);
  assert.equal(r.completed.length,mode==='held'?0:1);assert.equal(r.deferred.length,mode==='held'?1:0);
  assert.equal(deleted,mode==='normal');
 }else await assert.rejects(guardedMediaCleanup('post-media',[claim.path],rpc,port));
 if(['held','stale','changed','extraPath','duplicatePath','invalidLease','completeReplaced'].includes(mode))assert.equal(deleted,false);
 if(!['normal','missing'].includes(mode))assert.equal(ack,false);
 passed++;
}
const never=async()=>{throw Error('Must not call network');};
await assert.rejects(guardedMediaCleanup('moderation-evidence',['x/original'],never,{inspect:never,remove:never}));
await assert.rejects(guardedMediaCleanup('avatars',['../x'],never,{inspect:never,remove:never}));
console.log(`${passed+2} offline cleanup fence, response validation and ambiguous-failure checks passed.`);
