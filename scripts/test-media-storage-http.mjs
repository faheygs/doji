// Actual Storage API, synthetic media only. Refuses hosted URLs or linked projects.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash,randomUUID} from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
const workdir='D:/ChallengeApp/DoIt/test-results/media-storage-verify';
assert.ok(!existsSync(`${workdir}/supabase/.temp/project-ref`));
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',workdir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:`C:/Program Files/RedHat/Podman;${process.env.PATH}`}}));
const origin=new URL(status.API_URL);assert.equal(origin.hostname,'127.0.0.1');assert.equal(origin.port,'54431');
const require=createRequire(import.meta.url),cache=new Map();
function load(path){if(cache.has(path))return cache.get(path);const module={exports:{}};
 const localRequire=name=>name.startsWith('npm:')?require(name.replace('npm:','').replace('@1.8.0','')):load(new URL(name,`file:///${path.replaceAll('\\','/')}`).pathname.replace(/^\/([A-Z]:)/,'$1'));
 vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:localRequire,Request,Response,Headers,fetch,crypto,AbortSignal,URL,Uint8Array,TextDecoder},{filename:path});
 cache.set(path,module.exports);return module.exports;
}
const {moderationStorage}=load(`${process.cwd()}/supabase/functions/_shared/moderation-media-storage.ts`);
const {removeModeratedObject,restoreModeratedObject}=load(`${process.cwd()}/supabase/functions/_shared/moderation-media.ts`);
const headers={apikey:status.ANON_KEY,authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'content-type':'application/json'};
async function request(path,options={}){return fetch(`${origin.origin}/storage/v1/${path}`,{...options,headers:{...headers,...options.headers},redirect:'error'});}
for(const [name,publicBucket] of [['avatars',true],['post-media',false],['moderation-evidence',false]]){
 const r=await request('bucket',{method:'POST',body:JSON.stringify({id:name,name,public:publicBucket})});
 if(!r.ok){const body=await r.json();assert.ok(body.code==='BucketAlreadyExists'||body.error==='Duplicate',`Bucket setup failed: ${r.status}`);}
}
const port=moderationStorage(origin.origin,status.SERVICE_ROLE_KEY);
const maximumVideo=process.argv[2]==='--maximum-video';
assert.ok(process.argv.length===2||(process.argv.length===3&&maximumVideo));
for(const bucket of ['avatars','post-media']){
 const video=maximumVideo&&bucket==='post-media',mime=video?'video/mp4':'image/jpeg';
 const path=`${randomUUID()}/fixture.${video?'mp4':'jpg'}`, id=randomUUID(), bytes=maximumVideo?Buffer.alloc((video?100:5)*1024*1024,7):Buffer.from(`Synthetic fixture ${id}, not user content`);
 const started=Date.now();
 assert.ok((await request(`object/${bucket}/${path}`,{method:'POST',headers:{'content-type':mime},body:bytes})).ok);
 const source={bucket,path},evidence={bucket:'moderation-evidence',path:`${id}/original`};
 const original=await port.inspect(source);
 const job={id,source,evidence,original,archived:null};
 const accessProbe=await port.prepareAccessProbe(source);
 await assert.rejects(port.verifyAccessProbe(source,accessProbe),'available bytes must not pass revocation');
 const signed=await request(`object/sign/${bucket}/${path}`,{method:'POST',body:JSON.stringify({expiresIn:600})});assert.ok(signed.ok);
 const signedBody=await signed.json(),signedUrl=`${origin.origin}/storage/v1${signedBody.signedURL}`;
 assert.ok((await fetch(signedUrl)).ok,'signed object initially accessible');
 if(bucket==='avatars')assert.ok((await fetch(`${origin.origin}/storage/v1/object/public/${bucket}/${path}`)).ok);
 const control={assertLease:async()=>{},saveArchive:async p=>{job.archived=p;},saveOriginRemoval:async()=>{}};
 await removeModeratedObject(job,port,control);
 await removeModeratedObject(job,port,control);
 assert.equal(await port.inspect(source),null);
 await port.verifyAccessProbe(source,accessProbe);
 assert.equal((await fetch(signedUrl)).ok,false,'previously signed URL must stop serving at origin');
 assert.equal((await fetch(`${origin.origin}/storage/v1/object/public/${bucket}/${path}`)).ok,false);
 assert.equal((await fetch(`${origin.origin}/storage/v1/object/public/moderation-evidence/${evidence.path}`)).ok,false,'private evidence not public');
 assert.equal((await fetch(`${origin.origin}/storage/v1/object/authenticated/moderation-evidence/${evidence.path}`,{headers:{apikey:status.ANON_KEY,authorization:`Bearer ${status.ANON_KEY}`}})).ok,false,'anonymous cannot read evidence');
 assert.equal((await port.digest(evidence,bytes.length)).sha256,createHash('sha256').update(bytes).digest('hex'));
 await restoreModeratedObject(job,source,port,async()=>{});
 await assert.rejects(port.verifyAccessProbe(source,accessProbe),'restoration must fail old-URL denial check');
 assert.equal((await port.digest(source,bytes.length)).sha256,job.archived.sha256);
 console.log(`${bucket}: ${bytes.length} bytes; actual API copy, byte verification, origin deletion, old signed URL denial, evidence privacy, retry and restoration passed in ${Date.now()-started}ms.`);
}
console.log('Synthetic fixtures retained in the isolated local volume. This does not verify hosted CDN invalidation, employee RLS, or production orchestration.');
