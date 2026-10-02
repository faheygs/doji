// Approved mobile-only candidates. No backend/portal deployment or automatic retries.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync,writeFileSync,readdirSync,mkdirSync,copyFileSync,existsSync } from 'node:fs';
import { resolve,dirname } from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const cliRoot='C:/Users/gfahe/AppData/Roaming/npm/node_modules/eas-cli';
const cli=`${cliRoot}/bin/run`,root=resolve('test-results/mobile-release-100-21'),candidate=resolve(root,'upload');
const read=p=>readFileSync(p,'utf8'),json=p=>JSON.parse(read(p));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const save=(name,data)=>writeFileSync(resolve(root,name),typeof data==='string'?data:JSON.stringify(data,null,2),{flag:'wx'});
const walk=(dir,prefix='')=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>{assert.ok(!e.isSymbolicLink());return e.isDirectory()?walk(resolve(dir,e.name),prefix+e.name+'/'):[prefix+e.name];});
const allowed=new Set(['app','assets','components','constants','contexts','contracts','hooks','lib','stores','types','utils','scripts','app.json','babel.config.js','eas.json','google-services.json','index.ts','package.json','package-lock.json','tsconfig.json','.easignore']);
const required=['hooks/useAppAnnouncement.ts','hooks/useUpcomingDoji.ts','lib/requestSignal.ts','lib/rpcQueryError.ts','lib/apiFailureTelemetry.ts','lib/scaleReadGateway.ts','lib/feedQueries.ts','lib/notificationHistoryQueue.ts','contexts/ReportFlowContext.tsx','scripts/verify-build-env.mjs'];
function verify(){
 const m=json(resolve(root,'manifest.json'));
 assert.deepEqual(walk(candidate).sort(),Object.keys(m.files).sort());
 for(const [f,h] of Object.entries(m.files)){assert.equal(hash(resolve(candidate,f)),h,`Candidate drift: ${f}`);assert.equal(hash(resolve(f)),h,`Workspace drift: ${f}`);}
 const app=json(resolve(candidate,'app.json')).expo,eas=json(resolve(candidate,'eas.json'));
 assert.equal(app.version,'1.0.8');assert.equal(app.ios.buildNumber,'100');assert.equal(app.android.versionCode,21);
 assert.equal(app.extra.eas.projectId,'064b68b6-f138-4962-8aeb-f00970ba39c8');
 assert.equal(eas.build.production.ios.resourceClass,'m-medium');assert.equal(eas.build.production.android.resourceClass,'medium');
 assert.equal(eas.build.production.autoIncrement,false);assert.equal(eas.submit.production.android.track,'alpha');
 assert.equal(eas.submit.production.ios.ascAppId,'6768727326');
 for(const f of required)assert.ok(m.files[f],f);
 return m;
}
const mode=process.argv[2];
mkdirSync(root,{recursive:true});
if(mode==='prepare'){
 assert.ok(!existsSync(candidate),'Preserve existing candidate');
 const ignore=await require(`${cliRoot}/build/vcs/local.js`).Ignore.createForCopyingAsync(resolve('.'));
 function copy(prefix=''){for(const e of readdirSync(resolve(prefix||'.'),{withFileTypes:true})){
  const f=prefix+e.name;if(ignore.ignores(f))continue;assert.ok(!e.isSymbolicLink(),f);
  if(e.isDirectory())copy(f+'/');else{mkdirSync(dirname(resolve(candidate,f)),{recursive:true});copyFileSync(f,resolve(candidate,f));}
 }}copy();
 const files=Object.fromEntries(walk(candidate).sort().map(f=>{
  assert.ok(allowed.has(f.split('/')[0]),`Unexpected upload path ${f}`);
  assert.ok(!/(^|\/)\.env|\.(?:pem|key|p8|p12|jks|mobileprovision)$/.test(f),`Secret-like path ${f}`);
  if(f.startsWith('scripts/'))assert.equal(f,'scripts/verify-build-env.mjs');
  return [f,hash(resolve(candidate,f))];
 }));
 save('manifest.json',{at:new Date().toISOString(),version:'1.0.8',ios:100,android:21,files,requiredFixes:required});
 save('cost-preflight.json',{at:new Date().toISOString(),source:'Signed-in Expo billing + EAS history',plan:'Starter',includedCredit:45,usedCredit:26,remainingCredit:19,pairCredit:3,delayedUsageReserve:6,additionalSpend:0,concurrency:1,sentry:{plan:'Developer',errors:101,includedErrors:5000,paymentMethod:false,additionalSpend:0},settingsChanged:false});
 verify();console.log(JSON.stringify({verified:true,files:Object.keys(files).length,candidate,ios:100,android:21}));
}else if(mode==='verify')console.log(JSON.stringify({verified:true,files:Object.keys(verify().files).length}));
else if(mode==='bundle'){
 verify();const platform=process.argv[3];assert.ok(['ios','android'].includes(platform));
 require('@expo/env').load(resolve('.'),{silent:true});
 const env={...process.env,...json('eas.json').build.production.env,CI:'1',SENTRY_DISABLE_AUTO_UPLOAD:'true'};
 const output=execFileSync(process.execPath,['node_modules/expo/bin/cli','export','--platform',platform,'--output-dir',resolve(root,`bundle-${platform}`),'--no-bytecode','--max-workers','2'],{env,encoding:'utf8',timeout:600000,maxBuffer:6e6});
 save(`bundle-${platform}.log`,output);verify();console.log(`${platform} production JavaScript bundle validated.`);
}else if(mode==='ios'||mode==='android'){
 verify();assert.equal(process.argv[3],'--approved');
 for(const p of ['ios','android'])assert.ok(existsSync(resolve(root,`bundle-${p}/metadata.json`)),`Missing ${p} bundle`);
 const credit=json(resolve(root,'cost-preflight.json'));assert.ok(credit.remainingCredit>=credit.pairCredit+credit.delayedUsageReserve);
 assert.ok(Date.now()-Date.parse(credit.at)<3600000,'Refresh cost check');
 const tests=json('test-results/mobile-regression-20260928.json');assert.equal(tests.success,true);assert.equal(tests.numFailedTests,0);
 assert.ok(!existsSync(resolve(root,`${mode}-attempt.json`)),'Never repeat an ambiguous launch');
 const history=JSON.parse(execFileSync(process.execPath,[cli,'build:list','--platform',mode,'--limit','10','--json','--non-interactive'],{cwd:candidate,encoding:'utf8',timeout:60000}));
 const next=mode==='ios'?100:21;
 assert.ok(history.every(b=>Number(b.appBuildVersion)<next),'Build already used');
 assert.ok(history.every(b=>['FINISHED','ERRORED','CANCELED'].includes(b.status)),'Active build exists');
 save(`${mode}-history.json`,history.map(b=>({id:b.id,status:b.status,build:b.appBuildVersion,createdAt:b.createdAt})));
 save(`${mode}-attempt.json`,{at:new Date().toISOString(),platform:mode,build:next,destination:mode==='ios'?'TestFlight':'Google Play Closed testing Alpha; upload after build'});
 const args=[cli,'build','--platform',mode,'--profile','production','--freeze-credentials','--non-interactive','--no-wait','--json','--message','Mobile query reliability: empty announcements, portable timeouts, feed cancellation and safe failure diagnostics; device verification required'];
 if(mode==='ios')args.push('--auto-submit-with-profile','testing');
 try{
  const raw=execFileSync(process.execPath,args,{cwd:candidate,env:{...process.env,EAS_NO_VCS:'1',EAS_PROJECT_ROOT:candidate},encoding:'utf8',stdio:['ignore','pipe','inherit'],timeout:600000,maxBuffer:8e6});
  const builds=JSON.parse(raw).map(b=>({id:b.id,status:b.status,platform:b.platform,appVersion:b.appVersion,appBuildVersion:b.appBuildVersion,url:`https://expo.dev/accounts/faheybaby/projects/doit-challenge-app/builds/${b.id}`}));
  save(`${mode}-build.json`,builds);console.log(JSON.stringify(builds));
 }catch(e){save(`${mode}-launch-error.txt`,String(e.stdout??'')+'\n'+String(e.message));console.error('Inspect exact EAS jobs before any retry; launch marker retained.');process.exitCode=1;}
}else throw new Error('Use prepare, verify, bundle ios|android, ios|android --approved');
