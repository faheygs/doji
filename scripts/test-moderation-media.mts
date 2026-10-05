// Offline fault injection only: no credentials, network, production rows or files.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import type {MediaObject,MediaPort,RemovalControl,RemovalJob} from '../supabase/functions/_shared/moderation-media.ts';
const module:{exports:Record<string,unknown>}={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/moderation-media.ts','utf8'),
 {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports});
const {removeModeratedObject,restoreModeratedObject}=module.exports as typeof import('../supabase/functions/_shared/moderation-media.ts');
const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const original={id:'11111111-2222-4333-8444-555555555555',version:'v1',size:7,mime:'image/jpeg'};
const bytes=Buffer.from('fixture');
const key=(o:MediaObject)=>`${o.bucket}/${o.path}`;
function fixture(){
 const job:RemovalJob={id,source:{bucket:'avatars',path:`${original.id}/image.jpg`},evidence:{bucket:'moderation-evidence',path:`${id}/original`},original:{...original},archived:null};
 const objects=new Map([[key(job.source),{identity:{...original},bytes}]]);
 const calls:string[]=[];let valid=true,removed=false,fail:string|null=null;
 const hit=(name:string)=>{calls.push(name);if(fail===name){fail=null;throw Error('Injected private provider error');}};
 // Removal/restoration use this subset; access probes belong to the separate
 // dispatcher suite. These methods fail if the primitive unexpectedly calls them.
 const port:MediaPort={
  prepareAccessProbe:async()=>{throw Error('Unexpected access probe');},
  verifyAccessProbe:async()=>{throw Error('Unexpected access probe');},
  assertPrivateEvidence:async()=>{hit('privateBucket');},
  inspect:async o=>{hit('inspect');const identity=objects.get(key(o))?.identity;return identity?{...identity}:null;},
  digest:async(o,max)=>{hit('digest');const item=objects.get(key(o));assert.ok(item);const b=item.bytes;assert.ok(b.length<=max);return{sha256:createHash('sha256').update(b).digest('hex'),size:b.length};},
  copy:async(a,b)=>{hit('beforeCopy');assert.ok(!objects.has(key(b)));const value=objects.get(key(a));assert.ok(value);objects.set(key(b),{bytes:Buffer.from(value.bytes),identity:{...value.identity,id:'22222222-2222-4333-8444-555555555555',version:'copy'}});hit('afterCopy');},
  remove:async o=>{hit('beforeDelete');assert.ok(job.archived,'proof must be durable before any deletion');objects.delete(key(o));hit('afterDelete');},
 };
 const control:RemovalControl={assertLease:async()=>{hit('lease');if(!valid)throw Error('stale_lease');},
  saveArchive:async proof=>{hit('beforeSave');job.archived=proof;hit('afterSave');},
  saveOriginRemoval:async()=>{hit('beforeFinish');removed=true;hit('afterFinish');}};
 return {job,objects,calls,port,control,setFail:(v:string|null)=>fail=v,invalidate:()=>valid=false,get removed(){return removed;}};
}
let count=0;
for(const failure of [null,'beforeCopy','afterCopy','beforeSave','afterSave','beforeDelete','afterDelete','beforeFinish','afterFinish']){
 const f=fixture();if(failure)f.setFail(failure);
 if(failure)await assert.rejects(removeModeratedObject(f.job,f.port,f.control));
 await removeModeratedObject(f.job,f.port,f.control);
 await removeModeratedObject(f.job,f.port,f.control);
 assert.equal(f.removed,true);assert.equal(f.objects.has(key(f.job.source)),false);assert.ok(f.objects.has(key(f.job.evidence)));
 const restored=await restoreModeratedObject(f.job,f.job.source,f.port,f.control.assertLease);
 assert.equal(restored.size,bytes.length);assert.ok(f.objects.has(key(f.job.evidence)));
 await restoreModeratedObject(f.job,f.job.source,f.port,f.control.assertLease);count++;
}
for(const mode of ['missing','changed','badArchive','cancelled','oversize','badPath','publicEvidence']){
 const f=fixture();
 if(mode==='missing')f.objects.delete(key(f.job.source));
 if(mode==='changed')f.objects.get(key(f.job.source))!.identity.version='replaced';
 if(mode==='badArchive')f.objects.set(key(f.job.evidence),{identity:{...original},bytes:Buffer.from('corrupt')});
 if(mode==='cancelled')f.invalidate();
 if(mode==='oversize')f.job.original.size=6*1024*1024;
 if(mode==='badPath')f.job.source.path='../other/image.jpg';
 if(mode==='publicEvidence')f.setFail('privateBucket');
 await assert.rejects(removeModeratedObject(f.job,f.port,f.control));
 assert.ok(!f.calls.includes('beforeDelete'));assert.equal(f.removed,false);count++;
}
for(const mode of ['missingEvidence','changedEvidence','restoreCollision','cancelledRestore']){
 const f=fixture();await removeModeratedObject(f.job,f.port,f.control);
 if(mode==='missingEvidence')f.objects.delete(key(f.job.evidence));
 if(mode==='changedEvidence')f.objects.get(key(f.job.evidence))!.identity.version='mutated';
 if(mode==='restoreCollision')f.objects.set(key(f.job.source),{identity:{...original},bytes:Buffer.from('corrupt')});
 if(mode==='cancelledRestore')f.invalidate();
 await assert.rejects(restoreModeratedObject(f.job,f.job.source,f.port,f.control.assertLease));count++;
}
for(const mode of ['untouched','changedUntouched','missingUntouched','staleUntouched']){
 const f=fixture();
 if(mode==='changedUntouched')f.objects.get(key(f.job.source))!.identity.version='changed';
 if(mode==='missingUntouched')f.objects.delete(key(f.job.source));
 if(mode==='staleUntouched')f.invalidate();
 if(mode==='untouched')assert.deepEqual(await restoreModeratedObject(f.job,f.job.source,f.port,f.control.assertLease),original);
 else await assert.rejects(restoreModeratedObject(f.job,f.job.source,f.port,f.control.assertLease));
 assert.ok(!f.calls.includes('beforeCopy')&&!f.calls.includes('beforeDelete'));count++;
}
console.log(`${count} offline media removal/restoration fault scenarios passed. No hosted deletion or CDN verification performed.`);
