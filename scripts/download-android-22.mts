// Download the exact finished, owner-approved AAB. No remote mutation.
import {createHash} from 'node:crypto';
import {writeFileSync,existsSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {createEasReadClient} from './eas-read-client.mts';
import {evidenceRecord} from './release-evidence.mts';
const client=createEasReadClient();
(async()=>{
 const id='cf3d2743-b4e5-4712-8319-555ed8986619';
 const b=await client.build(id);
 assert.equal(b.project.id,'064b68b6-f138-4962-8aeb-f00970ba39c8');
 assert.equal(b.appVersion,'1.0.8');assert.equal(b.appBuildVersion,'22');assert.equal(b.status,'FINISHED');
 const root=resolve('test-results/mobile-release-101-22'),dest=resolve(root,'doji-1.0.8-22.aab'),record=resolve(root,'android-artifact.json');
 if(existsSync(dest)){
  const a=evidenceRecord(JSON.parse(readFileSync(record,'utf8')));assert.equal(a.buildId,id);
  assert.equal(createHash('sha256').update(readFileSync(dest)).digest('hex'),a.sha256);
  console.log(JSON.stringify(a));return;
 }
 const url=b.artifacts?.applicationArchiveUrl||b.artifacts?.buildUrl;assert.ok(url);
 const response=await fetch(url);assert.ok(response.ok,`Artifact HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());assert.ok(bytes.length>1000000);assert.equal(bytes.subarray(0,2).toString(),'PK');
 writeFileSync(dest,bytes,{flag:'wx'});
 const a={path:dest,buildId:id,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 writeFileSync(record,JSON.stringify(a,null,2),{flag:'wx'});console.log(JSON.stringify(a));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
