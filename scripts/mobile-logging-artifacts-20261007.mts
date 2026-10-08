// Exact release artifacts and upload inventory. No builds, store writes or retries.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createRequire} from 'node:module';
import {createEasReadClient} from './eas-read-client.mts';
const require=createRequire(import.meta.url);
const root=resolve('test-results/mobile-logging-20261007-v109');
for(const [platform,build,id,extension] of [
  ['android','29','10041d43-e34e-4baa-b4e6-802668e3f345','aab'],
  ['ios','104','707f0753-3f70-4a22-a8f5-ce3d0aac6a49','ipa'],
] as const) {
  const b=await createEasReadClient().buildAssessment(id);
  assert.equal(b.status,'FINISHED');assert.equal(b.platform,platform.toUpperCase());
  assert.equal(b.project.id,'064b68b6-f138-4962-8aeb-f00970ba39c8');
  assert.equal(b.appVersion,'1.0.9');assert.equal(b.appBuildVersion,build);
  const path=resolve(root,platform,`doji-1.0.9-${build}.${extension}`);
  const recordPath=resolve(root,platform,'artifact.json');
  if(existsSync(path)) {
    const evidence=JSON.parse(readFileSync(recordPath,'utf8')) as {buildId:string;sha256:string};
    assert.equal(evidence.buildId,id);assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),evidence.sha256);
  } else {
    const url=b.artifacts?.applicationArchiveUrl||b.artifacts?.buildUrl;
    assert.ok(url&&new URL(url).protocol==='https:');
    const response=await fetch(url,{signal:AbortSignal.timeout(120000)});assert.ok(response.ok);
    const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>1000000);assert.equal(bytes.subarray(0,2).toString(),'PK');
    writeFileSync(path,bytes,{flag:'wx'});
    writeFileSync(recordPath,JSON.stringify({at:new Date().toISOString(),buildId:id,platform,version:'1.0.9',build,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),path},null,2),{flag:'wx'});
  }
  const signals:string[]=[];
  for(const url of b.logFiles) {
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});assert.ok(response.ok);
    for(const raw of (await response.text()).split('\n')) {
      let line=raw;try {const item=JSON.parse(raw) as {msg?:string};line=item.msg??raw;}catch{/* plain build log */}
      if(line.length<700&&/Successfully uploaded|Source Map Upload Report|File upload complete|Uploaded \d+.*debug information|Production build environment verified|uploaded.*sentry/i.test(line)) signals.push(line);
    }
  }
  console.log(JSON.stringify({platform,status:b.status,artifact:JSON.parse(readFileSync(recordPath,'utf8')),uploadSignals:[...new Set(signals)]}));
}
const base='C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/build';
const Session=require(base+'/user/SessionManager').default;
const session=new Session({setActor(){}});
const client=require(base+'/commandUtils/context/contextUtils/createGraphqlClient').createGraphqlClient({accessToken:session.getAccessToken(),sessionSecret:session.getSessionSecret()});
const submissions=await require(base+'/graphql/queries/SubmissionQuery').SubmissionQuery.allForAppAsync(client,'064b68b6-f138-4962-8aeb-f00970ba39c8',{limit:5,platform:'IOS'});
console.log(JSON.stringify({recentAppleUploads:submissions.map((s:{id:string;status:string;platform:string})=>({id:s.id,status:s.status,platform:s.platform}))}));
