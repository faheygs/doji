// Tiny neutral hosted fixtures only; no member records, media, or settings changed.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {root,ref,cli,save,hash} from './prepare-safety-launch.mjs';
assert.equal(process.argv[2],'--synthetic-fixtures-only');
const id=randomUUID(),prefix=`safety-release-canary/${id}`;
const objects=[{bucket:'avatars',path:`${prefix}/fixture.jpg`},{bucket:'post-media',path:`${prefix}/fixture.jpg`},{bucket:'moderation-evidence',path:`${prefix}/original.jpg`}];
await save('hosted-storage-started.json',{at:new Date().toISOString(),objects,scope:'three neutral objects; one transformed source image; existing allowance verified 79/100'});
const keys=cli(['projects','api-keys','--project-ref',ref,'--reveal','--output-format','json']).keys;
const key=keys.find(k=>k.type==='secret'&&k.name==='default')?.api_key;assert.ok(key?.startsWith('sb_secret_'));
const origin=`https://${ref}.supabase.co`,client=createClient(origin,key,{auth:{persistSession:false,autoRefreshToken:false}});
const result=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','Add-Type -AssemblyName System.Drawing; $canaryImage = New-Object System.Drawing.Bitmap 2,2; $canaryBuffer = New-Object System.IO.MemoryStream; try { $canaryImage.Save($canaryBuffer, [System.Drawing.Imaging.ImageFormat]::Jpeg); [Console]::Write([Convert]::ToBase64String($canaryBuffer.ToArray())) } finally { $canaryImage.Dispose(); $canaryBuffer.Dispose() }'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const bytes=Buffer.from(result.trim(),'base64');assert.ok(bytes.length<4096);
const ok=(v,label)=>{assert.equal(v.error,null,label);return v.data;};
const observations=[];
async function observe(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000),redirect:'error'});const b=Buffer.from(await r.arrayBuffer());assert.ok(b.length<20000);let error={};if(!r.ok){try{const v=JSON.parse(b);error={code:v.code,error:v.error,statusCode:v.statusCode};}catch{}}return {status:r.status,sha256:r.ok?hash(b):null,...error};}
try{
 for(const obj of objects.slice(0,2)){
  ok(await client.storage.from(obj.bucket).upload(obj.path,bytes,{contentType:'image/jpeg',upsert:false,cacheControl:'3600'}),'upload neutral fixture');
  const signed=ok(await client.storage.from(obj.bucket).createSignedUrl(obj.path,600),'sign neutral fixture');
  observations.push({label:`${obj.bucket}:signed`,url:signed.signedUrl});
  if(obj.bucket==='avatars'){
   observations.push({label:'avatars:public',url:client.storage.from(obj.bucket).getPublicUrl(obj.path).data.publicUrl});
   const transformed=ok(await client.storage.from(obj.bucket).createSignedUrl(obj.path,600,{transform:{width:1,height:1,resize:'contain'}}),'sign transformed neutral fixture');
   observations.push({label:'avatars:transformed',url:transformed.signedUrl});
  }
 }
 const source=objects[1],archive=objects[2];
 ok(await client.storage.from(source.bucket).copy(source.path,archive.path,{destinationBucket:archive.bucket}),'copy neutral fixture into private evidence');
 const archived=ok(await client.storage.from(archive.bucket).download(archive.path),'read private fixture');assert.equal(hash(Buffer.from(await archived.arrayBuffer())),hash(bytes));
 const publicEvidence=await observe(client.storage.from(archive.bucket).getPublicUrl(archive.path).data.publicUrl);assert.ok(![200,206].includes(publicEvidence.status));
 for(const view of observations){view.before=await observe(view.url);assert.equal(view.before.status,200,view.label);view.warm=await observe(view.url);assert.equal(view.warm.status,200,view.label);}
 for(const obj of objects.slice(0,2))ok(await client.storage.from(obj.bucket).remove([obj.path]),'delete only exact neutral source');
 const deleted=Date.now();console.log('Neutral sources removed; private byte-identical archive verified; checking warmed URL revocation after 90 seconds.');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,deleted+90000-Date.now())));
 for(const view of observations){view.after=await observe(view.url);assert.ok([400,404].includes(view.after.status)&&(view.after.code==='NoSuchKey'||view.after.error==='not_found'||String(view.after.statusCode)==='404'),`${view.label}: genuine missing-object response required`);}
 ok(await client.storage.from(archive.bucket).copy(archive.path,source.path,{destinationBucket:source.bucket}),'restore exact neutral source');
 const restored=ok(await client.storage.from(source.bucket).download(source.path),'read restored neutral source');assert.equal(hash(Buffer.from(await restored.arrayBuffer())),hash(bytes));
 await save('hosted-storage-verified.json',{at:new Date().toISOString(),objects,bytes:bytes.length,archivePrivate:true,byteIdentity:true,restoration:true,observations:observations.map(({url,...v})=>v),scope:'One observed CDN path; not a global or browser-cache recall guarantee. No real moderation decision was made.'});
 console.log('Hosted neutral copy, private archive, original/signed/transformed URL revocation and restoration passed.');
}finally{
 const cleanup=[];for(const obj of objects){const result=await client.storage.from(obj.bucket).remove([obj.path]);cleanup.push({...obj,removed:result.error===null});}
 await save('hosted-storage-cleanup.json',{at:new Date().toISOString(),cleanup});assert.ok(cleanup.every(v=>v.removed),'Inspect exact fixture cleanup journal');
}
