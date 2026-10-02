// Validate local EAS archive inputs; never uploads or starts builds.
import {readFileSync,readdirSync,writeFileSync,lstatSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const base='test-results/mobile-release-20260926';
const allowed=new Set(['app','assets','components','constants','contexts','contracts','hooks','lib','stores','types','utils','scripts',
  'app.json','babel.config.js','eas.json','google-services.json','index.ts','package.json','package-lock.json','tsconfig.json','.easignore']);
const walk=(root,prefix='')=>readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
  const rel=prefix+entry.name;
  assert.ok(!entry.isSymbolicLink(),`Unexpected archive symlink ${rel}`);
  return entry.isDirectory()?walk(`${root}/${entry.name}`,`${rel}/`):[rel];
});
const manifests={};
for(const platform of ['ios','android']) {
  const root=`${base}/${platform}-archive-verified`;
  const files=walk(root).sort();
  for(const file of files) {
    assert.ok(allowed.has(file.split('/')[0]),`Unexpected upload root: ${file}`);
    assert.ok(!/(^|\/)\.env|\.(?:pem|key|p8|p12|jks|mobileprovision)$/.test(file),`Secret-like archive file: ${file}`);
    if(file.startsWith('scripts/')) assert.equal(file,'scripts/verify-build-env.mjs');
  }
  for(const required of ['index.ts','app.json','package-lock.json','google-services.json','scripts/verify-build-env.mjs',
    'contexts/ReportFlowContext.tsx','lib/apiFailureTelemetry.ts','assets/icon-ios.png','assets/adaptive-icon.png'])
    assert.ok(files.includes(required),`Missing required mobile input ${required}`);
  const app=JSON.parse(readFileSync(`${root}/app.json`,'utf8')).expo;
  assert.equal(app.version,'1.0.8'); assert.equal(app.ios.buildNumber,'98'); assert.equal(app.android.versionCode,19);
  const hashes=Object.fromEntries(files.map(file=>[file,createHash('sha256').update(readFileSync(`${root}/${file}`)).digest('hex')]));
  // Every included file is byte-for-byte the checked workspace source.
  for(const [file,hash] of Object.entries(hashes))
    assert.equal(hash,createHash('sha256').update(readFileSync(file)).digest('hex'),`Stale archive file ${file}`);
  manifests[platform]={files:hashes,fileCount:files.length,bytes:files.reduce((total,file)=>total+lstatSync(`${root}/${file}`).size,0)};
}
assert.deepEqual(manifests.ios.files,manifests.android.files,'Both platforms must use identical reviewed JS/config inputs');
writeFileSync(`${base}/archive-manifest.json`,JSON.stringify({verifiedAt:new Date().toISOString(),version:'1.0.8',iosBuild:98,androidVersionCode:19,manifests},null,2));
console.log(JSON.stringify({status:'passed',iosFiles:manifests.ios.fileCount,androidFiles:manifests.android.fileCount,bytesPerArchive:manifests.ios.bytes,identicalInputs:true,cloudBuildsQueued:false},null,2));
