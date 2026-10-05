// Portal-only release: patch the exact current production artifact, not the dirty tree.
import assert from 'node:assert/strict';
import { readFile, writeFile, cp, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import type { BinaryLike } from 'node:crypto';
import { readBrowserSource } from '../website/browser-source.mts';
const base='test-results/employee-access-release/site';
const root='test-results/portal-queue-health-release';
const site=`${root}/site`;
const oldBundle='admin-portal/admin-app-20260926employee1.js';
const newBundle='admin-portal/admin-app-20260926health1.js';
const read=async (p: string)=>(await readFile(p,'utf8')).replaceAll('\r\n','\n');
const hash=(b: BinaryLike)=>createHash('sha256').update(b).digest('hex');
await mkdir(root,{recursive:true});
const baseline=[];
for(const path of ['index.html','admin-portal/index.html',oldBundle,'admin-portal/admin.css']){
 const r=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);
 const body=Buffer.from(await r.arrayBuffer());
 assert.equal(hash(body),hash(await readFile(`${base}/${path}`)),`Live baseline drift: ${path}`);
 baseline.push({path,sha256:hash(body)});
}
await cp(base,site,{recursive:true});
let bundle=await read(`${base}/${oldBundle}`);
const runtimeStart=bundle.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');
assert.ok(runtimeStart>0);
let runtime=bundle.slice(runtimeStart).trimEnd();
const localRuntime=(readBrowserSource('portal.js')).trimEnd();
for(const [start,end] of [['    function formatDeadline(', '    function mapLiveWork('],['    function deadlineMarkup(', '    function visibleQueueRows('],['    function renderMetrics(', '    function platformHealthStatus(']] as const){
 const a=runtime.indexOf(start),b=runtime.indexOf(end,a),c=localRuntime.indexOf(start),d=localRuntime.indexOf(end,c);
 assert.ok(a>=0&&b>a&&c>=0&&d>c);
 runtime=runtime.slice(0,a)+localRuntime.slice(c,d)+runtime.slice(b);
}
assert.equal(runtime,localRuntime,'Only the three reviewed runtime functions changed');
const healthStart=bundle.indexOf('/* Portal presentation only:');
const healthEnd=bundle.indexOf("(() => {\n  const storageKey = 'doji-admin-session-v1';",healthStart);
const oldHealth=bundle.slice(healthStart,healthEnd).trimEnd();
const localHealth=readBrowserSource('admin-portal/health-model.js').replaceAll('\r\n','\n').trimEnd();
const addition=localHealth.slice(localHealth.indexOf('  const reviewClosed'),localHealth.indexOf('  const api ='));
assert.equal(localHealth.replace(addition,'').replace('labels, reviewDeadline, reviewQueue','labels'),oldHealth,'Only queue classifiers added to health model');
bundle=bundle.slice(0,healthStart)+localHealth+'\n\n'+bundle.slice(healthEnd,runtimeStart)+runtime+'\n';
await writeFile(`${site}/${newBundle}`,bundle);
const css=await read('website/admin-portal/admin.css');
const start=css.indexOf('.adminPortalPage .slaList [data-tone="overdue"]');
const end=css.indexOf('.adminPortalPage .mobileReviewDeadline',start);
assert.ok(start>=0&&end>start);
const addedCss=css.slice(start,end);
assert.equal(css.replace(addedCss,''),await read(`${base}/admin-portal/admin.css`),'Only queue severity styles changed');
await writeFile(`${site}/admin-portal/admin.css`,css);
for(const path of ['index.html','admin-portal/index.html']){
 const html=(await read(`${base}/${path}`)).replace(oldBundle,newBundle).replace('admin.css?v=20260925ap','admin.css?v=20260926health1');
 await writeFile(`${site}/${path}`,html);
}
await writeFile(`${root}/release.json`,JSON.stringify({baseline,newBundle,changed:['index.html','admin-portal/index.html','admin-portal/admin.css',newBundle],workerCodeChanged:false,databaseChanged:false},null,2));
console.log('Prepared exact portal-only queue release; auth, Worker, database and other assets unchanged.');
