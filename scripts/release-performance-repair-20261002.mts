import {readBrowserSource} from '../website/browser-source.mts';
// Narrow, independently deployable artifacts. Never uploads the dirty workspace.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cli, cf, ref, account, hash, inventory } from './prepare-safety-launch.mts';
import { transform } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceText,evidenceNumber,evidenceAssets,firstEvidence} from './release-evidence.mts';
const root = 'test-results/performance-repair-20261002';
const slug = 'employee-portal-v2';
const mode = process.argv[2];
const read = (p:string) => readFile(p, 'utf8').then(s => s.replaceAll('\r\n', '\n'));
const json = (p:string) => read(p).then(JSON.parse).then(evidenceRecord);
const save = (name:string, value:unknown) => writeFile(`${root}/${name}`, JSON.stringify(value, null, 2), { flag: 'wx' });
async function preserve(path:string, value:string) {
  try { assert.equal(await readFile(path, 'utf8'), value); }
  catch (error) { if (!(error instanceof Error&&'code'in error&&error.code === 'ENOENT')) throw error; await writeFile(path, value, { flag: 'wx' }); }
}
const functions = () => evidenceArray(evidenceRecord(cli(['functions', 'list', '--project-ref', ref, '--output-format', 'json'])).functions);
const secretDigests = () => evidenceArray(evidenceRecord(cli(['secrets', 'list', '--project-ref', ref, '--output-format', 'json'])).secrets);
const stableSecrets = (list:unknown) => evidenceArray(list).map(({ name, value, digest }) => ({ name, value, digest }));
async function api(path:string, init:RequestInit = {}) {
  const token = (await read('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(token);
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, { ...init, headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45000) });
  assert.ok(response.ok, `Cloudflare ${response.status}`); return response;
}
async function worker() {
  const base = '/workers/scripts/doji-orchestrator';
  const settings = evidenceRecord(await cf(base + '/settings'));
  for (const binding of evidenceArray(settings.bindings || [])) if (binding.type === 'secret_text') assert.equal(binding.text, undefined);
  const form = await (await api(base + '/content/v2')).formData();
  const files = [...form.values()].filter(v => typeof v !== 'string');
  assert.equal(files.length, 1);assert.ok(files[0]); assert.equal(files[0].name, 'index.js');
  return { settings, schedules: await cf(base + '/schedules'), source: await files[0].text(), deployments: await cf(base + '/deployments') };
}
async function pages() {
  const result:Record<string,{id:unknown;configHash:string}> = {};
  for (const name of ['doji-admin', 'doji-business', 'doji-site']) {
    const p = evidenceRecord(await cf('/pages/projects/' + name));
    result[name] = { id: evidenceAt(p,'canonical_deployment').id, configHash: hash(JSON.stringify(p.deployment_configs)) };
  }
  return result;
}
function releaseWindow() {
  const w = firstEvidence(cli(['db', 'query', '--linked', '--file', 'scripts/portal-editorial-release-window.sql', '--output-format', 'json']),'release_window');
  assert.equal(w.active, 0); assert.equal(w.overdue, 0); assert.equal(w.locks, 0);
  assert.ok(w.next && Date.parse(evidenceText(w.next)) > Date.parse(evidenceText(w.at)) + 25 * 60000);
  return w;
}
assert.equal((await read('supabase/.temp/project-ref')).trim(), ref);
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const cloud = await worker();
  await preserve(`${root}/worker-before.js`, cloud.source);
  const start = cloud.source.indexOf('// src/outbox-relay.ts');
  const end = cloud.source.indexOf('\n// src/', start + 5);
  assert.ok(start > 0 && end > start);
  let source = await read('infra/doji-orchestrator/src/outbox-relay.ts');
  source = source.replace("import { DurableObject } from 'cloudflare:workers';", 'import { DurableObject as DurableObject2 } from "cloudflare:workers";')
    .replace("import { captureWorkerException } from './sentry';", '').replace("import { sendOperationalAlert } from './operational-health';", '')
    .replace('export class OutboxRelayAlarm extends DurableObject<Env>', 'class OutboxRelayAlarm extends DurableObject2<Env>')
    .replaceAll('UPSTREAM_TIMEOUT_MS', 'OUTBOX_REQUEST_TIMEOUT_MS').replaceAll('RECOVERY_TIMEOUT_MS', 'OUTBOX_RETRY_TIMEOUT_MS');
  const block = '// src/outbox-relay.ts\n' + (await transform(source, { loader: 'ts', target: 'es2022' })).code;
  const candidate = cloud.source.slice(0, start) + block + cloud.source.slice(end);
  assert.equal(candidate.replace(block, cloud.source.slice(start, end)), cloud.source);
  await preserve(`${root}/worker-after.js`, candidate);
  cli(['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge-before`], false);
  await cp(`${root}/edge-before`, `${root}/edge-after`, { recursive: true });
  const assets = await inventory(`${root}/edge-before`);
  const sqlPath = assets.filter(a => a.path.endsWith('/restricted-sql.mts'));
  assert.equal(sqlPath.length, 1);assert.ok(sqlPath[0]);
  await cp('infra/portal-identity-candidate/restricted-sql.mts', `${root}/edge-after/${sqlPath[0].path}`);
  for (const dir of ['edge-before', 'edge-after']) await writeFile(`${root}/${dir}/supabase/config.toml`, `project_id = "employee-performance-repair"\n[functions.${slug}]\nverify_jwt = false\n`);
  await cp('test-results/employee-root-20261001/site', `${root}/site`, { recursive: true });
  const bundlePath = 'admin-portal/admin-app-20260925ap.js';
  const oldBundle = await read(`${root}/site/${bundlePath}`);
  const before = (await read(`${root}/portal-before.js`)).trimEnd();
  assert.equal(oldBundle.split(before).length, 2, 'Exact live portal source not found; stop for review');
  const live = await fetch('https://admin.dojipro.com/' + bundlePath, { signal: AbortSignal.timeout(20000) });
  assert.equal(live.status, 200); assert.equal((await live.text()).replaceAll('\r\n', '\n'), oldBundle);
  await writeFile(`${root}/site/${bundlePath}`, oldBundle.replace(before, (readBrowserSource('portal.js')).trimEnd()));
  await writeFile(`${root}/site/portal.js`, readBrowserSource('portal.js'));
  await save('candidate.json', { at: new Date().toISOString(), worker: { ...cloud, source: undefined, beforeHash: hash(cloud.source), afterHash: hash(candidate) },
    pages: await pages(), functions: functions(), secrets: secretDigests(), sqlPath: sqlPath[0].path,
    edge: await inventory(`${root}/edge-after`), site: await inventory(`${root}/site`) });
  console.log('Prepared separate relay, employee SQL and admin UI artifacts from exact live baselines. No deployments.');
} else {
  const c = await json(`${root}/candidate.json`);
  if (mode === 'cache-bust') {
    const previous = await json(`${root}/portal-verified.json`);
    const p = await pages(); assert.equal(evidenceAt(p,'doji-admin').id, previous.deployment);
    assert.deepEqual(await inventory(`${root}/site`), c.site);
    const oldAsset = evidenceText(c.asset || 'admin-portal/admin-app-20260925ap.js');
    const newAsset = 'admin-portal/admin-app-20261002b.js';
    assert.notEqual(oldAsset, newAsset);
    await cp(`${root}/site/${oldAsset}`, `${root}/site/${newAsset}`);
    for (const entry of ['index.html', 'admin-portal/index.html']) {
      const path = `${root}/site/${entry}`, html = await read(path);
      assert.equal(html.split(oldAsset).length, 2);
      await writeFile(path, html.replace(oldAsset, newAsset));
    }
    await save(`candidate-before-${Date.now()}.json`, c);
    c.pages = p; c.site = await inventory(`${root}/site`); c.asset = newAsset;
    await writeFile(`${root}/candidate.json`, JSON.stringify(c, null, 2));
  } else if (mode === 'refresh-portal') {
    assert.deepEqual(await inventory(`${root}/site`), c.site);
    const path = `${root}/site/${c.asset || 'admin-portal/admin-app-20260925ap.js'}`;
    const bundle = await read(path), old = (await read(`${root}/site/portal.js`)).trimEnd();
    assert.equal(bundle.split(old).length, 2);
    await writeFile(path, bundle.replace(old, (readBrowserSource('portal.js')).trimEnd()));
    await writeFile(`${root}/site/portal.js`, readBrowserSource('portal.js'));
    await save(`candidate-before-${Date.now()}.json`, c);
    c.site = await inventory(`${root}/site`);
    await writeFile(`${root}/candidate.json`, JSON.stringify(c, null, 2));
  } else if (mode === 'worker') {
    const now = await worker(); assert.equal(hash(now.source), evidenceAt(c,'worker').beforeHash);
    assert.deepEqual(now.settings, evidenceAt(c,'worker').settings); assert.deepEqual(now.schedules, evidenceAt(c,'worker').schedules);
    const source = await readFile(`${root}/worker-after.js`); assert.equal(hash(source), evidenceAt(c,'worker').afterHash);
    const s = now.settings;
    const metadata = { main_module: 'index.js', compatibility_date: s.compatibility_date, compatibility_flags: s.compatibility_flags,
      bindings: evidenceArray(s.bindings).filter(b => b.type !== 'secret_text'), keep_bindings: ['secret_text'], usage_model: s.usage_model,
      logpush: s.logpush, observability: s.observability, tags: s.tags, tail_consumers: s.tail_consumers, placement: s.placement };
    await save('worker-started.json', { at: new Date().toISOString(), window: releaseWindow() });
    const form = new FormData(); form.set('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.set('index.js', new Blob([source], { type: 'application/javascript+module' }), 'index.js');
    const r = await (await api('/workers/scripts/doji-orchestrator', { method: 'PUT', body: form })).json(); assert.equal(r.success, true);
    const after = await worker(); assert.equal(hash(after.source), evidenceAt(c,'worker').afterHash);
    assert.deepEqual(after.settings, evidenceAt(c,'worker').settings); assert.deepEqual(after.schedules, evidenceAt(c,'worker').schedules);
    await save('worker-verified.json', { at: new Date().toISOString(), deployments: after.deployments, bindingsAndSchedulesUnchanged: true });
  } else if (mode === 'edge' || mode === 'verify-edge') {
    if (mode === 'edge') assert.deepEqual(functions(), c.functions);
    assert.deepEqual(stableSecrets(secretDigests()), stableSecrets(c.secrets));
    assert.deepEqual(await inventory(`${root}/edge-after`), c.edge);
    if (mode === 'edge') {
      await save('edge-started.json', { at: new Date().toISOString(), window: releaseWindow() });
      cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge-after`], false);
    }
    const after = functions(); assert.deepEqual(after.filter(f => f.slug !== slug), evidenceArray(c.functions).filter(f => f.slug !== slug));
    assert.equal(after.find(f => f.slug === slug)?.version, evidenceNumber(evidenceArray(c.functions).find(f => f.slug === slug)?.version) + 1);
    assert.equal(after.find(f => f.slug === slug)?.status, 'ACTIVE');
    assert.deepEqual(stableSecrets(secretDigests()), stableSecrets(c.secrets));
    await mkdir(`${root}/edge-verified`, { recursive: true });
    cli(['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge-verified`], false);
    for (const f of evidenceAssets(c.edge).filter(f => !f.path.includes('/.temp/') && f.path !== 'supabase/config.toml'))
      assert.equal(await read(`${root}/edge-verified/${f.path}`), await read(`${root}/edge-after/${f.path}`), f.path);
    await save('edge-verified.json', { at: new Date().toISOString(), function: after.find(f => f.slug === slug), otherFunctionsAndSecretsUnchanged: true });
  } else if (mode === 'portal' || mode === 'verify-portal') {
    assert.deepEqual(await inventory(`${root}/site`), c.site);
    if (mode === 'portal') {
    assert.deepEqual(await pages(), c.pages);
    await save(`portal-started-${Date.now()}.json`, { at: new Date().toISOString(), rollback: evidenceAt(c,'pages','doji-admin').id });
    try { execFileSync(process.execPath, ['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js', 'pages', 'deploy', `${root}/site`, '--project-name', 'doji-admin', '--branch', 'main', '--commit-dirty=true', '--commit-message', 'Load only visible admin data; preserve independent employee authentication'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account } }); }
    catch { throw Error('Portal deployment response unavailable; inspect status before retrying.'); }
    }
    const p = await pages(); assert.notEqual(evidenceAt(p,'doji-admin').id, evidenceAt(c,'pages','doji-admin').id);
    for (const name of ['doji-business', 'doji-site']) assert.deepEqual(p[name], evidenceAt(c,'pages',name));
    assert.equal(evidenceAt(p,'doji-admin').configHash, evidenceAt(c,'pages','doji-admin').configHash);
    for (const path of ['index.html', c.asset || 'admin-portal/admin-app-20260925ap.js']) {
      const r = await fetch('https://admin.dojipro.com/' + path, { signal: AbortSignal.timeout(20000), cache: 'no-store' });
      assert.equal(r.status, 200); assert.equal(hash(Buffer.from(await r.arrayBuffer())), evidenceAssets(c.site).find(f => f.path === path)?.sha256);
    }
    const verified = { at: new Date().toISOString(), deployment: evidenceAt(p,'doji-admin').id, otherSitesAndConfigurationUnchanged: true };
    await save(`portal-verified-${Date.now()}.json`, verified);
    await writeFile(`${root}/portal-verified.json`, JSON.stringify(verified, null, 2));
  } else throw Error('Unknown release step');
  console.log(`${mode}: exact artifact verified; unrelated deployment boundaries preserved.`);
}
