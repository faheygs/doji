import {readBrowserSource} from '../website/browser-source.mts';
// Exact employee-only diagnostic/latency artifacts. No database or shared Worker deployment.
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceText,evidenceAssets} from './release-evidence.mts';
const root = 'test-results/employee-latency-20261002', old = 'test-results/performance-repair-20261002';
const slug = 'employee-portal-v2', asset = 'admin-portal/admin-app-20261002c.js';
const read = (p:string) => readFile(p, 'utf8').then(s => s.replaceAll('\r\n', '\n'));
const json = (p:string) => read(p).then(JSON.parse).then(evidenceRecord);
const save = (p:string, value:unknown) => writeFile(`${root}/${p}`, JSON.stringify(value, null, 2), { flag: 'wx' });
const functions = () => evidenceArray(evidenceRecord(cli(['functions', 'list', '--project-ref', ref, '--output-format', 'json'])).functions);
const secrets = () => JSON.parse(JSON.stringify(evidenceArray(evidenceRecord(cli(['secrets', 'list', '--project-ref', ref, '--output-format', 'json'])).secrets).map(({name,value,digest}) => ({name,value,digest}))));
async function pages() {
  const result:Record<string,{id:unknown;configHash:string}> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const p = evidenceRecord(await cf('/pages/projects/' + name));
    result[name] = { id: evidenceAt(p,'canonical_deployment').id, configHash: hash(JSON.stringify(p.deployment_configs)) };
  }
  return result;
}
const mode = process.argv[2];
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const p = await pages();
  assert.equal(evidenceAt(p,'doji-admin').id, 'f11c69bd-20d6-46b1-be54-6c34642d0a4a');
  const fs = functions(); assert.equal(fs.find(f => f.slug === slug)?.version, 7);
  await mkdir(`${root}/edge-before`, { recursive: true });
  cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge-before`], false);
  await cp(`${root}/edge-before`, `${root}/edge-after`, { recursive: true });
  const runtime = `supabase/functions/${slug}/runtime`;
  // The released runtime is otherwise the exact inspected local source.
  for (const name of ['employee-runtime.mts', 'employee-proxy.mts']) {
    assert.equal(await read(`${root}/edge-before/${runtime}/${name}`), await read(`${old}/edge-verified/${runtime}/${name}`));
    await cp(`infra/portal-identity-candidate/${name}`, `${root}/edge-after/${runtime}/${name}`);
  }
  await cp('infra/portal-identity-candidate/employee-timing.mts', `${root}/edge-after/${runtime}/employee-timing.mts`);
  for (const dir of ['edge-before','edge-after']) await writeFile(`${root}/${dir}/supabase/config.toml`, `project_id = "employee-latency"\n[functions.${slug}]\nverify_jwt = false\n`);
  await cp(`${old}/site`, `${root}/site`, { recursive: true });
  const oldAsset = 'admin-portal/admin-app-20261002b.js';
  const baseline = await read(`${old}/site/${oldAsset}`);
  assert.equal(await (await fetch('https://admin.dojipro.com/' + oldAsset)).text(), baseline);
  // Replace only transport bundle and portal source, retaining all other live assets/configuration.
  const start = baseline.indexOf('var DojiEmployeeTransport ='), end = baseline.indexOf('\n/* Portal presentation only:', start);
  assert.ok(start >= 0 && end > start);
  const bundle = await build({ stdin: { contents: "export { createEmployeeBrowserTransport as create } from './employee-browser-transport.mts';", resolveDir: resolve('infra/portal-identity-candidate') }, bundle:true,write:false,format:'iife',globalName:'DojiEmployeeTransport',platform:'browser',target:'es2022' });
  let next = baseline.slice(0,start) + evidenceText(bundle.outputFiles[0]?.text).trimEnd() + '\n' + baseline.slice(end);
  const before = (await read(`${old}/site/portal.js`)).trimEnd();
  assert.equal(next.split(before).length, 2);
  next = next.replace(before, (readBrowserSource('portal.js')).trimEnd());
  await writeFile(`${root}/site/${asset}`, next);
  await writeFile(`${root}/site/portal.js`, readBrowserSource('portal.js'));
  for (const path of ['index.html','admin-portal/index.html']) {
    const html = await read(`${root}/site/${path}`);
    assert.ok(html.includes(evidenceText(oldAsset.split('/').at(-1))));
    await writeFile(`${root}/site/${path}`, html.replaceAll(evidenceText(oldAsset.split('/').at(-1)), evidenceText(asset.split('/').at(-1))));
  }
  await build({entryPoints:['infra/portal-identity-candidate/employee-pages-worker.mts'],bundle:true,outfile:`${root}/site/_worker.js`,format:'esm',platform:'neutral',target:'es2022',external:['node:*']});
  await save('candidate.json', { at:new Date().toISOString(), functions:fs, secrets:secrets(), pages:p, edge:await inventory(`${root}/edge-after`), site:await inventory(`${root}/site`) });
  console.log('Exact employee-only release prepared; production unchanged.');
} else {
  const c = await json(`${root}/candidate.json`);
  if (mode === 'prepare-style') {
    const r = await json(`${root}/region-candidate.json`), v = await json(`${root}/region-verified.json`), p = await pages();
    assert.equal(evidenceAt(p,'doji-admin').id,v.deployment); assert.deepEqual(await inventory(`${root}/site`),r.site);
    await cp(`${root}/site`,`${root}/site-before-style`,{recursive:true});
    const path = 'admin-portal/admin.css';
    const before = await read(`${root}/site/${path}`), after = await read(`website/${path}`);
    const line = '.adminPortalPage .opsHero .portalButton:hover { background: #303541; color: #fff; }\n';
    assert.equal(after.replace(line,''),before,'Only exact hover rule may change');
    await writeFile(`${root}/site/${path}`,after);
    for(const html of ['index.html','admin-portal/index.html']) await writeFile(`${root}/site/${html}`,(await read(`${root}/site/${html}`)).replace('/admin-portal/admin.css?v=20260925ap','/admin-portal/admin.css?v=20261002a'));
    await save('style-candidate.json',{at:new Date().toISOString(),pages:p,site:await inventory(`${root}/site`)});
  } else if(mode === 'style' || mode === 'verify-style') {
    const r = await json(`${root}/style-candidate.json`); assert.deepEqual(await inventory(`${root}/site`),r.site);
    if(mode === 'style') {
      assert.deepEqual(await pages(),r.pages); await save('style-started.json',{at:new Date().toISOString(),rollback:evidenceAt(r,'pages','doji-admin').id});
      execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Keep health refresh hover contrast accessible'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
    }
    const p = await pages(); assert.notEqual(evidenceAt(p,'doji-admin').id,evidenceAt(r,'pages','doji-admin').id);
    assert.equal(evidenceAt(p,'doji-admin').configHash,evidenceAt(r,'pages','doji-admin').configHash);
    for(const name of ['doji-business','doji-site']) assert.deepEqual(p[name],evidenceAt(r,'pages',name));
    for(const path of ['index.html','admin-portal/admin.css']) assert.equal(hash(Buffer.from(await(await fetch('https://admin.dojipro.com/'+path+'?v=20261002a',{cache:'no-store'})).arrayBuffer())),evidenceAssets(r.site).find(f=>f.path===path)?.sha256);
    await save('style-verified.json',{at:new Date().toISOString(),deployment:evidenceAt(p,'doji-admin').id,otherSitesAndConfigUnchanged:true});
  } else if (mode === 'prepare-region') {
    const verified = await json(`${root}/portal-verified.json`), p = await pages();
    assert.equal(evidenceAt(p,'doji-admin').id, verified.deployment);
    assert.deepEqual(await inventory(`${root}/site`),c.site);
    await cp(`${root}/site`,`${root}/site-before-region`,{recursive:true});
    const baseline = await read(`${root}/site/${asset}`);
    const start = baseline.indexOf('var DojiEmployeeTransport ='), end = baseline.indexOf('\n/* Portal presentation only:',start);
    assert.ok(start >= 0 && end > start);
    const transport = await build({stdin:{contents:"export { createEmployeeBrowserTransport as create } from './employee-browser-transport.mts';",resolveDir:resolve('infra/portal-identity-candidate')},bundle:true,write:false,format:'iife',globalName:'DojiEmployeeTransport',platform:'browser',target:'es2022'});
    const newAsset = 'admin-portal/admin-app-20261002d.js';
    await writeFile(`${root}/site/${newAsset}`,baseline.slice(0,start)+evidenceText(transport.outputFiles[0]?.text).trimEnd()+'\n'+baseline.slice(end));
    for(const path of ['index.html','admin-portal/index.html']) await writeFile(`${root}/site/${path}`,(await read(`${root}/site/${path}`)).replaceAll(evidenceText(asset.split('/').at(-1)),evidenceText(newAsset.split('/').at(-1))));
    await build({entryPoints:['infra/portal-identity-candidate/employee-pages-worker.mts'],bundle:true,outfile:`${root}/site/_worker.js`,format:'esm',platform:'neutral',target:'es2022',external:['node:*']});
    await save('region-candidate.json',{at:new Date().toISOString(),pages:p,site:await inventory(`${root}/site`),asset:newAsset});
  } else if (mode === 'region' || mode === 'verify-region') {
    const r = await json(`${root}/region-candidate.json`);
    assert.deepEqual(await inventory(`${root}/site`),r.site);
    if(mode === 'region') {
      assert.deepEqual(await pages(),r.pages);
      await save('region-started.json',{at:new Date().toISOString(),rollback:evidenceAt(r,'pages','doji-admin').id});
      execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Owner-approved employee-only Oregon locality'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
    }
    const p = await pages(); assert.notEqual(evidenceAt(p,'doji-admin').id,evidenceAt(r,'pages','doji-admin').id);
    assert.equal(evidenceAt(p,'doji-admin').configHash,evidenceAt(r,'pages','doji-admin').configHash);
    for(const name of ['doji-business','doji-site']) assert.deepEqual(p[name],evidenceAt(r,'pages',name));
    for(const path of ['index.html',r.asset]) assert.equal(hash(Buffer.from(await(await fetch('https://admin.dojipro.com/'+path,{cache:'no-store'})).arrayBuffer())),evidenceAssets(r.site).find(f=>f.path===path)?.sha256);
    await save('region-verified.json',{at:new Date().toISOString(),deployment:evidenceAt(p,'doji-admin').id,otherSitesAndConfigUnchanged:true});
  } else if (mode === 'edge' || mode === 'verify-edge') {
    assert.deepEqual(await inventory(`${root}/edge-after`), c.edge);
    assert.deepEqual(secrets(), c.secrets);
    if (mode === 'edge') {
      assert.deepEqual(functions(), c.functions);
      await save('edge-started.json', { at:new Date().toISOString(), rollbackVersion:7 });
      cli(['functions','deploy',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge-after`],false);
    }
    const fs = functions();
    assert.equal(fs.find(f => f.slug === slug)?.version, 8);
    assert.deepEqual(fs.filter(f => f.slug !== slug),evidenceArray(c.functions).filter(f => f.slug !== slug));
    assert.deepEqual(secrets(), c.secrets);
    await mkdir(`${root}/edge-verified`,{recursive:true});
    cli(['functions','download',slug,'--project-ref',ref,'--use-api','--workdir',`${root}/edge-verified`],false);
    for (const f of evidenceAssets(c.edge).filter(f => f.path.startsWith('supabase/functions/')))
      assert.equal(await read(`${root}/edge-verified/${f.path}`),await read(`${root}/edge-after/${f.path}`));
    await save('edge-verified.json',{at:new Date().toISOString(),version:8,otherFunctionsAndSecretsUnchanged:true});
  } else if (mode === 'portal' || mode === 'verify-portal') {
    assert.deepEqual(await inventory(`${root}/site`),c.site);
    if (mode === 'portal') {
      assert.deepEqual(await pages(),c.pages);
      await save('portal-started.json',{at:new Date().toISOString(),rollback:evidenceAt(c,'pages','doji-admin').id});
      execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Measure employee request latency and remove duplicate post-MFA session read'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:180000,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:account}});
    }
    const p = await pages(); assert.notEqual(evidenceAt(p,'doji-admin').id,evidenceAt(c,'pages','doji-admin').id);
    assert.equal(evidenceAt(p,'doji-admin').configHash,evidenceAt(c,'pages','doji-admin').configHash);
    for(const name of ['doji-business','doji-site']) assert.deepEqual(p[name],evidenceAt(c,'pages',name));
    for(const path of ['index.html',asset]) assert.equal(hash(Buffer.from(await(await fetch('https://admin.dojipro.com/'+path,{cache:'no-store'})).arrayBuffer())),evidenceAssets(c.site).find(f=>f.path===path)?.sha256);
    await save('portal-verified.json',{at:new Date().toISOString(),deployment:evidenceAt(p,'doji-admin').id,otherSitesAndConfigUnchanged:true});
  } else throw Error('Unknown mode');
  console.log(`${mode}: exact artifacts verified.`);
}
