// Owner-approved static-only deployment. Never changes existing projects/backends.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { cf, account, inventory, hash } from './prepare-safety-launch.mjs';
const [folder, mode] = process.argv.slice(2);
assert.match(folder || '', /^test-results\/business-closed-[A-Za-z0-9]+$/);
assert.ok(['publish', 'verify', 'verify-domain'].includes(mode));
const candidate = JSON.parse(await readFile(`${folder}/candidate.json`, 'utf8'));
assert.equal(candidate.project, 'doji-business');
assert.equal(candidate.mode, 'closed-static-only');
assert.deepEqual(await inventory(`${folder}/public`), candidate.assets);
const qualification = JSON.parse(await readFile(`${folder}/qualification.json`, 'utf8'));
assert.equal(qualification.passed, true);
assert.deepEqual(qualification.assets, candidate.assets);
const safe = p => ({ name: p.name, domains: p.domains, branch: p.production_branch, deploymentId: p.canonical_deployment?.id || null });
const others = rows => rows.filter(p => ['doji-admin', 'doji-site'].includes(p.name)).map(safe).sort((a,b) => a.name.localeCompare(b.name));
const save = (name, value) => writeFile(`${folder}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
if (mode === 'publish') {
  await assert.rejects(access(`${folder}/publish-started.json`), 'Already attempted: inspect status, do not blindly retry');
  const rows = await cf('/pages/projects');
  assert.equal(others(rows).length, 2);
  assert.ok(!rows.some(p => p.name === candidate.project || p.domains?.includes('business.dojipro.com')), 'Business hosting already exists; inspect before reuse');
  await save('baseline', others(rows));
  await save('publish-started', { at: new Date().toISOString(), assets: candidate.assets });
  // Current account already authenticated; no credentials, billing or Git changes.
  const cli = args => execFileSync(process.execPath, ['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js', ...args], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    stdio: ['ignore','pipe','pipe'], encoding: 'utf8', timeout: 180000, maxBuffer: 1000000,
  });
  try {
    await save('created', { output: cli(['pages','project','create',candidate.project,'--production-branch','main']) });
    const created = await cf(`/pages/projects/${candidate.project}`);
    assert.equal(created.canonical_deployment, null);
    assert.equal(created.production_branch, 'main');
    await save('uploaded', { output: cli(['pages','deploy',resolve(folder, 'public'),'--project-name',candidate.project,'--branch','main','--commit-dirty=true','--commit-message','Closed business portal: static only, no signup']) });
  } catch {
    throw Error('Deployment did not confirm completion. Inspect exact project before any retry. No automatic retry.');
  }
}
const now = await cf(`/pages/projects/${candidate.project}`);
const deployment = now.canonical_deployment;
assert.equal(deployment?.latest_stage?.status, 'success');
assert.ok(!deployment.is_skipped);
assert.equal(deployment.uses_functions, false);
assert.deepEqual(others(await cf('/pages/projects')), JSON.parse(await readFile(`${folder}/baseline.json`, 'utf8')));
const verified = [];
const origin = mode === 'verify-domain' ? candidate.origin : deployment.url;
if (mode === 'verify-domain') {
  const domains = await cf(`/pages/projects/${candidate.project}/domains`);
  assert.equal(domains.find(d => d.name === 'business.dojipro.com')?.status, 'active');
}
for (const asset of candidate.assets.filter(a => !a.path.startsWith('_'))) {
  const response = await fetch(`${origin}/${asset.path}`, { signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 200, asset.path);
  assert.equal(hash(Buffer.from(await response.arrayBuffer())), asset.sha256, asset.path);
  verified.push(asset.path);
}
const response = await fetch(origin, { signal: AbortSignal.timeout(15000) });
assert.match(response.headers.get('content-security-policy') || '', /connect-src 'none'/);
assert.match(response.headers.get('content-security-policy') || '', /form-action 'none'/);
assert.match(response.headers.get('x-robots-tag') || '', /noindex/);
for (const path of ['/business-portal/access/', '/business-portal/application/']) {
  const redirected = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  assert.equal(redirected.status, 302);
  assert.equal(new URL(redirected.headers.get('location'), origin).href, `${origin}/`);
}
for (const path of ['/business-portal/config.js', '/functions/v1/business-auth', '/business-terms/', '/business-privacy/']) {
  const absent = await fetch(origin + path, { redirect: 'manual', signal: AbortSignal.timeout(15000) });
  // Every legacy business-portal path redirects to the gate, other paths are 404.
  assert.equal(absent.status, path.startsWith('/business-portal/') ? 302 : 404);
}
const result = { at: new Date().toISOString(), deploymentId: deployment.id, url: deployment.url, origin, project: candidate.project,
  usesFunctions: deployment.uses_functions, domains: now.domains, verified, otherProjectsUnchanged: true };
await writeFile(`${folder}/verified.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
