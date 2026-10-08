// Owner-authorized iOS 104 / Android 29. Immutable mobile baselines, logging only.
// No submissions, credential mutations, retries, enforcement, or scheduled jobs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {evidenceRecord as record, evidenceAt as at, evidenceArray as rows, evidenceText as text} from './release-evidence.mts';
import {createEasReadClient} from './eas-read-client.mts';
const require = createRequire(import.meta.url);
const source = resolve('.');
const root = resolve('test-results/mobile-logging-20261007-v109');
const cli = 'C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli/bin/run';
const platforms = ['ios', 'android'] as const;
type Platform = typeof platforms[number];
const versions = {ios:104, android:29};
const costs = {ios:200, android:100};
const baseline = {ios:'D:/ChallengeApp/DoIt/test-results/ios-security-103', android:'D:/ChallengeApp/DoIt/test-results/android-diagnostics-28'};
const overlays = ['app/_layout.tsx','lib/androidReadEvidence.ts','lib/androidTestEnvironment.ts',
  'lib/memberReadDiagnostics.ts','lib/apiFailureTelemetry.ts','lib/commandGateway.ts','lib/apiQueryCache.ts',
  'lib/mobileDiagnosticContext.ts','lib/mobileDiagnosticObservers.ts','lib/mobileDiagnosticSentry.ts','lib/diagnosticOperations.ts'];
const json = (p:string) => record(JSON.parse(readFileSync(p,'utf8')));
const hash = (p:string) => createHash('sha256').update(readFileSync(p)).digest('hex');
const candidate = (p:Platform) => resolve(root,p,'upload');
const save = (p:string,v:unknown) => {mkdirSync(dirname(p),{recursive:true});writeFileSync(p,JSON.stringify(v,null,2)+'\n',{flag:'wx'});};
const walk = (p:string,prefix=''):string[] => readdirSync(p,{withFileTypes:true}).flatMap(e=>{
  if (!prefix && ['node_modules','.expo'].includes(e.name)) return [];
  assert.ok(!e.isSymbolicLink(),'Unexpected symbolic link');
  return e.isDirectory()?walk(resolve(p,e.name),prefix+e.name+'/'):[prefix+e.name];
});
function copy(from:string,file:string,to:string) {mkdirSync(dirname(resolve(to,file)),{recursive:true});copyFileSync(resolve(from,file),resolve(to,file));}
function verify(p:Platform) {
  const m=json(resolve(root,p,'manifest.json')), files=record(m.files), dest=candidate(p);
  assert.deepEqual(walk(dest).sort(),Object.keys(files).sort());
  for(const [f,d] of Object.entries(files)) assert.equal(hash(resolve(dest,f)),d,f);
  for(const f of overlays) assert.equal(hash(resolve(source,f)),files[f],`Tested source changed: ${f}`);
  const original=json(resolve(baseline[p],'upload/app.json'));
  at(original,'expo').version='1.0.9';
  at(original,'expo',p)[p==='ios'?'buildNumber':'versionCode']=p==='ios'?String(versions[p]):versions[p];
  assert.deepEqual(json(resolve(dest,'app.json')),original,'Only release version and target build number change');
  assert.equal(at(original,'expo').version,'1.0.9');
  const ignore=require('ignore')().add(readFileSync(resolve(dest,'.easignore'),'utf8'));
  for(const f of walk(dest)) assert.ok(!ignore.ignores(f),`Excluded ${f}`);
  for(const f of ['.env','website/index.html','infra/worker.ts','supabase/migrations/private.sql','test-results/probe.json']) assert.ok(ignore.ignores(f));
  assert.equal(hash(resolve(dest,'eas.json')),hash(resolve(baseline[p],'upload/eas.json')));
  return m;
}
function prepare(p:Platform) {
  const dest=candidate(p);assert.ok(!existsSync(dest),'Candidate already exists; do not overwrite');
  const old=record(json(resolve(baseline[p],'manifest.json')).files);
  for(const [f,d] of Object.entries(old)) {assert.equal(hash(resolve(baseline[p],'upload',f)),d,`Baseline changed: ${f}`);copy(resolve(baseline[p],'upload'),f,dest);}
  for(const f of overlays) copy(source,f,dest);
  const app=json(resolve(dest,'app.json'));at(app,'expo',p)[p==='ios'?'buildNumber':'versionCode']=p==='ios'?String(versions[p]):versions[p];
  at(app,'expo').version='1.0.9';
  writeFileSync(resolve(dest,'app.json'),JSON.stringify(app,null,2)+'\n');
  const pkg=json(resolve(dest,'package.json')), lock=json(resolve(dest,'package-lock.json'));
  at(pkg,'dependencies')['expo-network']='57.0.2';
  at(lock,'packages','','dependencies')['expo-network']='57.0.2';
  at(lock,'packages')['node_modules/expo-network']=at(json('package-lock.json'),'packages','node_modules/expo-network');
  assert.equal(at(lock,'packages','node_modules/expo-network').version,'57.0.2');
  writeFileSync(resolve(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');
  writeFileSync(resolve(dest,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
  const files=Object.fromEntries(walk(dest).sort().map(f=>[f,hash(resolve(dest,f))]));
  const changed=Object.keys(files).filter(f=>files[f]!==old[f]);
  assert.ok(changed.every(f=>[...overlays,'app.json','package.json','package-lock.json'].includes(f)));
  save(resolve(root,p,'manifest.json'),{at:new Date().toISOString(),version:'1.0.9',build:versions[p],platform:p,baseline:baseline[p],files,changed,
    scope:'Expanded privacy-bounded diagnostics, no confirmed production timeout repair',deviceAcceptance:'Not yet tested',automaticSubmission:false});
  verify(p);console.log(JSON.stringify({prepared:p,build:versions[p],files:Object.keys(files).length,changed}));
}
function bundle(p:Platform) {
  verify(p);
  require('@expo/env').load('D:/ChallengeApp/DoIt',{silent:true});
  const output=resolve(root,p,'bundle');assert.ok(!existsSync(output),'Preserve bundle evidence');
  const log=execFileSync(process.execPath,[resolve('node_modules/expo/bin/cli'),'export','--platform',p,'--output-dir',output,'--no-bytecode','--source-maps','--max-workers','2'],{
    cwd:candidate(p),env:{...process.env,...at(json(resolve(candidate(p),'eas.json')),'build','production','env'),CI:'1',EXPO_NO_DOTENV:'1',SENTRY_DISABLE_AUTO_UPLOAD:'true'},encoding:'utf8',timeout:600000,maxBuffer:12e6});
  writeFileSync(resolve(root,p,'bundle.log'),log,{flag:'wx'});
  const sources=walk(output).filter(f=>f.endsWith('.map')).flatMap(f=>{
    const m=json(resolve(output,f));assert.ok(Array.isArray(m.sources)&&Array.isArray(m.sourcesContent));
    const names=m.sources as string[], contents=m.sourcesContent as string[];
    return names.map((name,i)=>({name,content:contents[i]??''}));
  });
  for(const name of ['mobileDiagnosticContext','mobileDiagnosticObservers','mobileDiagnosticSentry','diagnosticOperations']) assert.ok(sources.some(s=>s.name.endsWith('/'+name+'.ts')),`Missing ${name}`);
  assert.ok(sources.some(s=>/decode-uri-component-upstream\/index.js$/.test(s.name)&&s.content.includes('function utf8SequenceLength')));
  assert.ok(!sources.some(s=>s.content.includes('function decodeComponents(components, split)')));
  save(resolve(root,p,'bundle-proof.json'),{at:new Date().toISOString(),platform:p,sources:sources.length,loggingIncluded:true,patchedDecoder:true});
  verify(p);console.log(`${p} exact candidate bundle verified`);
}
async function preflight() {
  const {metric,plan}=await createEasReadClient().buildCreditUsage('faheybaby');
  const history=rows(JSON.parse(execFileSync(process.execPath,[cli,'build:list','--limit','20','--json','--non-interactive'],{cwd:candidate('android'),encoding:'utf8',timeout:60000})));
  const ours=platforms.flatMap(p=>existsSync(resolve(root,p,'build.json'))?rows(JSON.parse(readFileSync(resolve(root,p,'build.json'),'utf8'))):[]);
  const ids=new Set(ours.map(b=>b.id));
  assert.ok(history.some(b=>Date.now()-Date.parse(text(b.createdAt))>86400000),'History coverage insufficient');
  assert.ok(history.every(b=>ids.has(b.id)||['FINISHED','ERRORED','CANCELED'].includes(text(b.status))),'Unknown active build');
  for(const p of platforms) assert.ok(history.filter(b=>b.platform===p.toUpperCase()&&!ids.has(b.id)).every(b=>Number(b.appBuildVersion)<versions[p]),'Version conflict');
  const recent=history.filter(b=>Date.now()-Date.parse(text(b.createdAt))<=86400000);
  assert.ok(recent.every(b=>ids.has(b.id)),'Unknown delayed usage');
  const pending=platforms.filter(p=>!existsSync(resolve(root,p,'attempt.json'))).reduce((s,p)=>s+costs[p],0);
  // Reserve own new jobs even if billing has not reflected them. Stop rather than risk overage.
  const reserve=recent.reduce((s,b)=>s+(b.platform==='IOS'?200:100),0);
  const remaining=metric.limit-metric.value;
  assert.ok(remaining>=pending+reserve,'Insufficient included credit after delayed usage reserve');
  return {at:new Date().toISOString(),plan,includedCents:metric.limit,usedCents:metric.value,remainingCents:remaining,pendingCents:pending,reserveCents:reserve,overageAuthorized:false,
    history:history.map(b=>({id:b.id,platform:b.platform,status:b.status,build:b.appBuildVersion,createdAt:b.createdAt}))};
}
function nativeChecks() {
  const dependencies=json('package-lock.json');
  for(const p of platforms) {
    verify(p);
    const packages=at(json(resolve(candidate(p),'package-lock.json')),'packages');
    // Exports resolve installed dependencies from the parent workspace. Prove every
    // locked package matches that tested dependency tree (root scripts are excluded).
    for(const [name,value] of Object.entries(packages)) if(name) assert.deepEqual(value,at(dependencies,'packages')[name],`Dependency drift: ${name}`);
    const raw=execFileSync(process.execPath,[resolve('node_modules/expo-modules-autolinking/bin/expo-modules-autolinking'),'resolve','--platform',p==='ios'?'apple':'android','--json'],{cwd:candidate(p),encoding:'utf8',timeout:60000,maxBuffer:5e6});
    const autolink=JSON.parse(raw) as {modules:{packageName:string;packageVersion:string}[]};
    assert.ok(autolink.modules.some(m=>m.packageName==='expo-network'&&m.packageVersion==='57.0.2'),`Missing native network module: ${p}`);
    save(resolve(root,p,'autolink-proof.json'),{at:new Date().toISOString(),networkModule:'57.0.2',platform:p});
  }
  const nativeRoot=resolve(root,'android','prebuild');assert.ok(!existsSync(nativeRoot),'Preserve native evidence');
  for(const f of walk(candidate('android'))) copy(candidate('android'),f,nativeRoot);
  const log=execFileSync(process.execPath,[resolve('node_modules/expo/bin/cli'),'prebuild','--platform','android','--no-install'],{cwd:nativeRoot,env:{...process.env,CI:'1',EXPO_NO_DOTENV:'1'},encoding:'utf8',timeout:300000,maxBuffer:8e6});
  writeFileSync(resolve(root,'android','prebuild.log'),log,{flag:'wx'});
  const application=readFileSync(resolve(nativeRoot,'android/app/src/main/java/com/doit/challengeapp/MainApplication.kt'),'utf8');
  const installer='com.doji.network.DojiReadResponseHints.install("tvixsmqxotuvyjqzmjla.supabase.co", "doji-orchestrator.faheygs.workers.dev")';
  assert.equal(application.split(installer).length,2);assert.ok(application.indexOf(installer)<application.indexOf('loadReactNative(this)'));
  const helper='plugins/android-read-diagnostics/DojiReadResponseHints.java';
  assert.equal(hash(resolve(nativeRoot,'android/app/src/main/java/com/doji/network/DojiReadResponseHints.java')),hash(resolve(candidate('android'),helper)));
  const expoDir=resolve(dirname(require.resolve('expo/package.json')),'android/src/main/java/expo/modules/fetch');
  assert.equal((readFileSync(resolve(expoDir,'ExpoFetchModule.kt'),'utf8').match(/Doji passive read observer/g)||[]).length,1);
  assert.equal(readFileSync(resolve(expoDir,'DojiReadResponseHints.java'),'utf8'),readFileSync(resolve(candidate('android'),helper),'utf8').replace('package com.doji.network;','package expo.modules.fetch;'));
  save(resolve(root,'native-proof.json'),{at:new Date().toISOString(),passed:true,autolinkBoth:true,androidPrebuild:true,deviceAcceptance:false,iosNativeCompilation:'EAS required; not tested locally'});
  for(const p of platforms) verify(p);
  console.log('Both native module resolutions and Android prebuild verified; no device acceptance claimed.');
}
async function launch(p:Platform) {
  verify(p);assert.equal(process.argv[4],'--approved');
  assert.ok(!existsSync(resolve(root,p,'attempt.json')),'No duplicate launches');
  for(const platform of platforms) assert.equal(json(resolve(root,platform,'bundle-proof.json')).loggingIncluded,true);
  assert.equal(json(resolve(root,'native-proof.json')).passed,true);
  const tests=json(resolve(root,'regression.json'));assert.equal(tests.success,true);assert.equal(tests.numFailedTests,0);assert.ok(Number(tests.numPassedTests)>=1287);
  assert.ok(Date.now()-Number(tests.startTime)<7200000,'Refresh regression tests');
  save(resolve(root,p,'cost-preflight.json'),await preflight());
  save(resolve(root,p,'attempt.json'),{at:new Date().toISOString(),platform:p,build:versions[p],automaticSubmission:false,ownerApproved:true});
  try {
    const raw=execFileSync(process.execPath,[cli,'build','--platform',p,'--profile','production','--freeze-credentials','--non-interactive','--no-wait','--json','--message',`1.0.9 (${versions[p]}): expanded privacy-bounded request, device, session and recovery diagnostics. No confirmed timeout root-cause fix. No automatic submission.`],{
      cwd:candidate(p),env:{...process.env,EAS_NO_VCS:'1',EAS_PROJECT_ROOT:candidate(p)},encoding:'utf8',stdio:['ignore','pipe','inherit'],timeout:600000,maxBuffer:8e6});
    const jobs=rows(JSON.parse(raw)).map(b=>({id:b.id,platform:b.platform,status:b.status,version:b.appVersion,build:b.appBuildVersion,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}`}));
    assert.equal(jobs.length,1);assert.equal(jobs[0]?.platform,p.toUpperCase());assert.equal(jobs[0]?.build,String(versions[p]));
    save(resolve(root,p,'build.json'),jobs);console.log(JSON.stringify(jobs));
  } catch {console.error('Launch failed or outcome ambiguous: inspect history, never retry automatically.');process.exitCode=1;}
}
const mode=process.argv[2], requested=process.argv[3];
assert.ok(requested==='ios'||requested==='android'||mode==='preflight'||mode==='native','Choose ios or android');
const p=requested as Platform;
if(mode==='prepare') prepare(p);
else if(mode==='verify') {verify(p);console.log(`${p} immutable logging candidate verified`);}
else if(mode==='bundle') bundle(p);
else if(mode==='native') nativeChecks();
else if(mode==='preflight') console.log(JSON.stringify(await preflight()));
else if(mode==='launch') await launch(p);
else throw Error('Use prepare|verify|bundle|preflight|launch <platform>; launch needs --approved');
