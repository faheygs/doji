// Bounded repair retry only after both original jobs failed before compilation.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {evidenceAt,evidenceRecord,evidenceArray} from './release-evidence.mts';
const require=createRequire(import.meta.url);
const cliRoot='C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli=`${cliRoot}/bin/run`;
const root=resolve('test-results/mobile-release-20260926');
const candidate=resolve(root,'upload-r2');
const marker=resolve(root,'retry-attempt.json');
assert.ok(!existsSync(marker),'Retry already attempted; reconcile exact EAS IDs');
for(const id of ['c2525d69-9f63-4b99-9962-fda30b456fac','1bf9af99-c63a-4430-a11a-8f9f3ab1cd79']) {
 const b=evidenceRecord(JSON.parse(execFileSync(process.execPath,[cli,'build:view',id,'--json'],{encoding:'utf8',timeout:30000})));
 assert.equal(b.status,'ERRORED');
}
// Successful bundle artifacts plus fresh npm ci / tests are recorded before retry.
for(const platform of ['ios','android']) assert.ok(existsSync(resolve(root,`${platform}-bundle-check-r2/metadata.json`)));
assert.ok(existsSync(resolve(root,'candidate-r2/node_modules/.package-lock.json')));
assert.ok(!existsSync(candidate),'Never overwrite a prior upload directory');
await require(`${cliRoot}/build/vcs/local.js`).makeShallowCopyAsync(resolve(root,'candidate-r2'),candidate);
const walk=(dir:string,prefix=''):string[]=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);
const files=walk(candidate).sort();
const old=evidenceAt(JSON.parse(readFileSync(resolve(root,'archive-manifest.json'),'utf8')),'manifests','ios','files');
assert.deepEqual(files,Object.keys(old).sort(),'No added upload paths');
const hashes:Record<string,string>={};
for(const file of files) {
 hashes[file]=createHash('sha256').update(readFileSync(resolve(candidate,file))).digest('hex');
 const workspaceHash=createHash('sha256').update(readFileSync(file)).digest('hex');
 assert.equal(hashes[file],workspaceHash,`Workspace/archive drift: ${file}`);
 if(!['package.json','package-lock.json'].includes(file)) assert.equal(hashes[file],old[file],`Unexpected retry change: ${file}`);
}
writeFileSync(resolve(root,'retry-manifest.json'),JSON.stringify({verifiedAt:new Date().toISOString(),files:hashes},null,2));
writeFileSync(marker,JSON.stringify({attemptedAt:new Date().toISOString(),candidate,reason:'Strict dependency installation repaired; originals both ERRORED',maximumAdditionalCreditUseUSD:3},null,2));
const records=[];
for(const platform of ['ios','android']) {
 const args=[cli,'build','--platform',platform,'--profile','production','--freeze-credentials','--non-interactive','--no-wait','--json',
  '--message','Member reliability test candidate; strict clean-install repair; not a public release'];
 if(platform==='ios') args.push('--auto-submit-with-profile','testing','--what-to-test',
  'Test reporting and retry feedback, comments loading after refresh and posting, member login persistence during separate portal use, native notifications, foreground recovery and the ten-minute participation window. Do not use real harmful material.');
 try {
  const raw=execFileSync(process.execPath,args,{cwd:candidate,env:{...process.env,EAS_NO_VCS:'1',EAS_PROJECT_ROOT:candidate},encoding:'utf8',stdio:['ignore','pipe','inherit'],timeout:600000,maxBuffer:8*1024*1024});
  for(const b of evidenceArray(JSON.parse(raw))) records.push({id:b.id,status:b.status,platform:b.platform,appVersion:b.appVersion,appBuildVersion:b.appBuildVersion,
   url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}`});
  writeFileSync(resolve(root,'retry-builds.json'),JSON.stringify(records,null,2));
  console.log(JSON.stringify(records,null,2));
 } catch(error) {
  const failure=evidenceRecord(error);
  writeFileSync(resolve(root,`retry-${platform}-error.txt`),String(failure.stdout??'')+'\n'+String(failure.message));
  console.error(`Partial failure for ${platform}; stop and reconcile exact IDs before any retry.`);
  process.exitCode=1; break;
 }
}
