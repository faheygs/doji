// Read-only status for the exact approved release. Never starts or retries jobs.
const {writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const base='C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/build';
const SessionManager=require(`${base}/user/SessionManager`).default;
const {createGraphqlClient}=require(`${base}/commandUtils/context/contextUtils/createGraphqlClient`);
const {BuildQuery}=require(`${base}/graphql/queries/BuildQuery`);
const {SubmissionQuery}=require(`${base}/graphql/queries/SubmissionQuery`);
const session=new SessionManager({setActor(){}});
const client=createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
const ids={ios:'656091cd-e218-46fc-86c9-be9bb3c61b46',android:'cf3d2743-b4e5-4712-8319-555ed8986619'};
const submissionId='5b8137ba-b1cd-44f7-aead-8e3217e0dd26';
(async()=>{
 const builds=await Promise.all(Object.entries(ids).map(async([platform,id])=>{
  const b=await BuildQuery.byIdAsync(client,id,{useCache:false});
  assert.equal(b.project.id,'064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion,'1.0.8');assert.equal(b.appBuildVersion,platform==='ios'?'101':'22');
  return {id,platform,status:b.status,version:b.appVersion,build:b.appBuildVersion,createdAt:b.createdAt,completedAt:b.completedAt,queuePosition:b.queuePosition,error:b.error,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${id}`};
 }));
 const s=await SubmissionQuery.byIdAsync(client,submissionId,{useCache:false});
 const result={at:new Date().toISOString(),builds,iosSubmission:{id:s.id,status:s.status,error:s.error,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/submissions/${s.id}`}};
 writeFileSync(resolve('test-results/mobile-release-101-22/latest-status.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
