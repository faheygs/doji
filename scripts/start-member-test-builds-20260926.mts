// One-shot launch of the explicitly approved test candidates. Never retry blindly.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {evidenceAt,evidenceRecord,evidenceArray} from './release-evidence.mts';
const root=resolve('test-results/mobile-release-20260926');
const candidate=resolve(root,'ios-archive-verified'); // Both platform inputs hash-identical.
const marker=resolve(root,'launch-attempt.json');
assert.ok(!existsSync(marker),'A launch was already attempted; inspect EAS before doing anything else');
execFileSync(process.execPath,['scripts/verify-mobile-archives.mts'],{stdio:'inherit'});
const app=evidenceAt(JSON.parse(readFileSync(resolve(candidate,'app.json'),'utf8')),'expo');
const config=evidenceRecord(JSON.parse(readFileSync(resolve(candidate,'eas.json'),'utf8')));
assert.equal(evidenceAt(app,'extra','eas').projectId,'064b68b6-f138-4962-8aeb-f00970ba39c8');
assert.equal(evidenceAt(app,'ios').buildNumber,'98'); assert.equal(evidenceAt(app,'android').versionCode,19);
assert.equal(evidenceAt(config,'build','production','ios').resourceClass,'m-medium');
assert.equal(evidenceAt(config,'build','production','android').resourceClass,'medium');
assert.equal(evidenceAt(config,'submit','testing','android').track,'internal');
assert.equal(evidenceAt(config,'submit','production','ios').ascAppId,'6768727326');
writeFileSync(marker,JSON.stringify({attemptedAt:new Date().toISOString(),candidate,ios:98,android:19,submissionProfile:'testing'},null,2));
const cli='C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/bin/run';
try {
 const raw=execFileSync(process.execPath,[cli,'build','--platform','all','--profile','production',
  '--auto-submit-with-profile','testing','--freeze-credentials','--non-interactive','--no-wait','--json',
  '--message','Member reliability: reporting recovery, comments resilience, sanitized telemetry; device testing required'],{
   cwd:candidate,env:{...process.env,EAS_NO_VCS:'1',EAS_PROJECT_ROOT:candidate},encoding:'utf8',
   stdio:['ignore','pipe','inherit'],timeout:600_000,maxBuffer:8*1024*1024});
 const builds=evidenceArray(JSON.parse(raw));
 const records=builds.map(({id,status,platform,appVersion,appBuildVersion,createdAt,project})=>
  ({id,status,platform,appVersion,appBuildVersion,createdAt,url:`https://expo.dev/accounts/${project && evidenceRecord(project).ownerAccount ? evidenceAt(project,'ownerAccount').name??'faheybaby':'faheybaby'}/projects/doit-challenge-app/builds/${id}`}));
 writeFileSync(resolve(root,'launched-builds.json'),JSON.stringify(records,null,2));
 console.log(JSON.stringify(records,null,2));
} catch(error) {
 const failure=evidenceRecord(error);
 // Partial success is possible: retain evidence and require exact-ID reconciliation.
 writeFileSync(resolve(root,'launch-error.txt'),String(failure.stdout??'')+'\n'+String(failure.message));
 console.error('Launch did not return a complete build list. Inspect EAS history and saved launch-error.txt; do not rerun.');
 process.exitCode=1;
}
