import { createEasReadClient } from './eas-read-client.mts';
const reader = createEasReadClient();
// Read-only status for the exact approved mobile release; never starts/retries jobs.
import {createHash} from 'node:crypto';
import {writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const ids={ios:'8336ddad-fda7-4594-a3a2-f05ddca4d7e3',android:'631e2671-f874-42f0-a5da-2d90232984d5'};
const submissionId='8b882c40-72b9-4363-97c3-1b9c0c806fd6';
const root=resolve('test-results/mobile-release-100-21');
(async()=>{
 const builds=await Promise.all(Object.entries(ids).map(async([platform,id])=>{
  const b=await reader.build(id);
  assert.equal(b.project.id,'064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion,'1.0.8');assert.equal(b.appBuildVersion,platform==='ios'?'100':'21');
  if(process.argv[2]==='download-android'&&platform==='android'){
   assert.equal(b.status,'FINISHED');const dest=resolve(root,'doji-1.0.8-21.aab');
   assert.ok(!existsSync(dest),'Preserve existing artifact');
   const url=b.artifacts?.applicationArchiveUrl||b.artifacts?.buildUrl;assert.ok(url);
   const res=await fetch(url);assert.ok(res.ok,`Artifact HTTP ${res.status}`);
   const bytes=Buffer.from(await res.arrayBuffer());assert.ok(bytes.length>1000000);
   assert.equal(bytes.subarray(0,2).toString(),'PK');writeFileSync(dest,bytes,{flag:'wx'});
   const artifact={path:dest,buildId:id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
   writeFileSync(resolve(root,'android-artifact.json'),JSON.stringify(artifact,null,2),{flag:'wx'});console.log(JSON.stringify({artifact}));
  }
  return {id,platform,status:b.status,version:b.appVersion,build:b.appBuildVersion,createdAt:b.createdAt,completedAt:b.completedAt,queuePosition:b.queuePosition,error:b.error,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${id}`};
 }));
 const s=await reader.submission(submissionId);
 const result={at:new Date().toISOString(),builds,iosSubmission:{id:s.id,status:s.status,error:s.error,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/${s.id}`}};
 writeFileSync(resolve(root,'latest-status.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch((e: unknown) =>{console.error(e instanceof Error ? e.message : String(e));process.exitCode=1;});
