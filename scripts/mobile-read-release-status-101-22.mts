import { createEasReadClient } from './eas-read-client.mts';
const reader = createEasReadClient();
// Read-only status for the exact approved release. Never starts or retries jobs.
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
const ids={ios:'656091cd-e218-46fc-86c9-be9bb3c61b46',android:'cf3d2743-b4e5-4712-8319-555ed8986619'};
const submissionId='5b8137ba-b1cd-44f7-aead-8e3217e0dd26';
(async()=>{
 const builds=await Promise.all(Object.entries(ids).map(async([platform,id])=>{
  const b=await reader.build(id);
  assert.equal(b.project.id,'064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion,'1.0.8');assert.equal(b.appBuildVersion,platform==='ios'?'101':'22');
  return {id,platform,status:b.status,version:b.appVersion,build:b.appBuildVersion,createdAt:b.createdAt,completedAt:b.completedAt,queuePosition:b.queuePosition,error:b.error,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${id}`};
 }));
 const s=await reader.submission(submissionId);
 const result={at:new Date().toISOString(),builds,iosSubmission:{id:s.id,status:s.status,error:s.error,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/${s.id}`}};
 writeFileSync(resolve('test-results/mobile-release-101-22/latest-status.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch((e: unknown) =>{console.error(e instanceof Error ? e.message : String(e));process.exitCode=1;});
