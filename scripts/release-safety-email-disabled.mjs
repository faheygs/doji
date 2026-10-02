// Narrow release: one NEW, disabled Edge function. No migrations, secret writes,
// schedules or member deployments. Credentials remain in process memory only.
import {readFile, writeFile, mkdir, cp, readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const ref = 'tvixsmqxotuvyjqzmjla';
const slug = 'safety-removal-alerts';
const root = 'test-results/safety-email-disabled-release-20260929';
const hash = data => createHash('sha256').update(data).digest('hex');
const read = path => readFile(path, 'utf8');
const json = async path => JSON.parse(await read(path));
const save = (name, value) => writeFile(`${root}/${name}`, JSON.stringify(value, null, 2), {flag: 'wx'});
function cli(args, parse = true) {
  let out;
  try { out = execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', ...args], {encoding: 'utf8', timeout: 60_000, maxBuffer: 5e6, stdio: ['ignore', 'pipe', 'pipe']}); }
  catch { throw new Error(`Supabase CLI ${args.slice(0, 2).join(' ')} failed; no credential output retained`); }
  return parse ? JSON.parse(out.slice(out.indexOf('{'))) : out;
}
const functions = () => cli(['functions', 'list', '--project-ref', ref, '--output-format', 'json']).functions;
const secrets = () => cli(['secrets', 'list', '--project-ref', ref, '--output-format', 'json']);
const platformSecrets = new Set(['SUPABASE_ANON_KEY', 'SUPABASE_DB_URL', 'SUPABASE_JWKS', 'SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_URL']);
function compareSecretMetadata(actual, expected) {
  // Deployment refreshes platform-owned timestamps, not their values. Keep every
  // digest and all custom-secret metadata strict; ignore only these timestamps.
  const stable = data => data.secrets.map(secret => platformSecrets.has(secret.name)
    ? Object.fromEntries(Object.entries(secret).filter(([key]) => key !== 'updated_at')) : secret);
  assert.deepEqual(stable(actual), stable(expected), 'Secret digests and custom metadata unchanged');
}
const files = [
  `supabase/functions/${slug}/index.ts`,
  'supabase/functions/deno.d.ts',
  'supabase/functions/_shared/safety-removal-alerts.ts',
  'supabase/functions/_shared/safety-removal-cloudflare.ts',
  'supabase/functions/_shared/employee-service-headers.ts',
  'supabase/functions/_shared/doji-email.ts',
];
async function inventory(dir, prefix = '') {
  const result = [];
  for (const item of await readdir(dir, {withFileTypes: true})) result.push(...item.isDirectory() ? await inventory(`${dir}/${item.name}`, `${prefix}${item.name}/`) : [`${prefix}${item.name}`]);
  return result.sort();
}
async function manifest(dir) {
  // CLI-generated linkage metadata is not bundled function source.
  return Promise.all((await inventory(dir)).filter(path => path !== 'supabase/.temp/linked-project.json').map(async path => ({path, sha256: hash(await readFile(`${dir}/${path}`))})));
}
async function assertManifest(dir, expected) { assert.deepEqual(await manifest(dir), expected, 'Exact release artifact required'); }
async function deploy(dir) {
  cli(['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', dir], false);
}
async function request(path, key) {
  const response = await fetch(`https://${ref}.supabase.co/functions/v1/${slug}/${path}`, {method: 'POST', headers: key ? {apikey: key} : {}, redirect: 'error', signal: AbortSignal.timeout(25_000)});
  const body = await response.json().catch(() => ({}));
  // Only this source-controlled handler's non-sensitive projection is retained.
  return {httpStatus: response.status, ...Object.fromEntries(Object.entries(body).filter(([key]) => ['message', 'verifiedDestination', 'dispatcherEnabled', 'reference', 'providerId', 'status', 'terminal'].includes(key)))};
}
async function main() {
  const mode = process.argv[2];
  assert.ok(['prepare', 'run', 'verify'].includes(mode));
  assert.equal((await read('supabase/.temp/project-ref')).trim(), ref);
  await mkdir(root, {recursive: true});
  if (mode === 'prepare') {
    const before = functions();
    assert.ok(!before.some(v => v.slug === slug), 'New-function-only release; inspect existing function before proceeding');
    await save('functions-before.json', before);
    await save('secrets-before.json', secrets()); // Metadata/digests only, never values.
    for (const path of files) {
      await mkdir(`${root}/final/${path.slice(0, path.lastIndexOf('/'))}`, {recursive: true});
      await cp(path, `${root}/final/${path}`);
    }
    await writeFile(`${root}/final/supabase/config.toml`, `project_id = "safety-email-disabled-release"\n[functions.${slug}]\nverify_jwt = false\n`);
    await save('final-manifest.json', await manifest(`${root}/final`));
    console.log('Prepared exact disabled function artifact; existing functions and secret digests captured.');
    return;
  }
  const before = await json(`${root}/functions-before.json`);
  const finalManifest = await json(`${root}/final-manifest.json`);
  await assertManifest(`${root}/final`, finalManifest);
  if (mode === 'run') {
    assert.equal(process.argv[3], '--deploy-reviewed-artifact');
    assert.deepEqual(functions(), before, 'Concurrent function change: stop');
    assert.deepEqual(secrets(), await json(`${root}/secrets-before.json`), 'Concurrent secret change: stop');
    const keyRows = cli(['projects', 'api-keys', '--project-ref', ref, '--reveal', '--output-format', 'json']).keys;
    const serviceKey = keyRows.find(k => k.type === 'secret' && k.name === 'default')?.api_key;
    const publicKey = keyRows.find(k => k.type === 'publishable')?.api_key;
    assert.ok(serviceKey?.startsWith('sb_secret_'), 'Existing default service credential required');
    assert.ok(publicKey?.startsWith('sb_publishable_'), 'Existing publishable key required for negative check');
    const expiresAt = Date.now() + 15 * 60_000;
    await cp(`${root}/final`, `${root}/probe`, {recursive: true, errorOnExist: true, force: false});
    const probe = (await read('scripts/fixtures/safety-email-runtime-probe.ts')).replaceAll('../../supabase/functions/_shared/', './');
    await writeFile(`${root}/probe/supabase/functions/_shared/safety-email-runtime-probe.ts`, probe);
    await writeFile(`${root}/probe/supabase/functions/${slug}/index.ts`, `import {safetyEmailRuntimeProbe} from '../_shared/safety-email-runtime-probe.ts';\nDeno.serve(request => {\n let keys = [];\n try { keys = Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}')); } catch {}\n keys.push(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');\n return safetyEmailRuntimeProbe(request, {serviceKeys: keys.filter(key => typeof key === 'string' && key.length > 0), enabled: Deno.env.get('SAFETY_REMOVAL_ALERTS_ENABLED') ?? '', accountId: Deno.env.get('SAFETY_CLOUDFLARE_ACCOUNT_ID') ?? '', token: Deno.env.get('SAFETY_CLOUDFLARE_EMAIL_TOKEN') ?? '', expiresAt: ${expiresAt}});\n});\n`);
    await save('probe-manifest.json', {expiresAt, files: await manifest(`${root}/probe`)});
    await save('deployment-attempt.json', {at: new Date().toISOString(), scope: slug});
    let verificationError;
    try {
      await deploy(`${root}/probe`);
      const unauth = await request('verify');
      const publicDenied = await request('verify', publicKey);
      assert.equal(unauth.httpStatus, 401, 'Anonymous request denied');
      assert.equal(publicDenied.httpStatus, 401, 'Public-key request denied');
      const preflight = await request('verify', serviceKey);
      await save('runtime-preflight.json', {at: new Date().toISOString(), unauth, publicDenied, preflight});
      assert.equal(preflight.httpStatus, 200, 'Dedicated token verified destination read');
      assert.equal(preflight.verifiedDestination, true);
      assert.equal(preflight.dispatcherEnabled, false);
      // Durable local intent prevents this release driver from automatically resending.
      // Cloudflare has no idempotency guarantee; ambiguity requires inspection, not retry.
      await save('dedicated-canary-attempt.json', {at: new Date().toISOString(), state: 'started', automaticRetry: false});
      const outcome = await request('canary', serviceKey);
      await save('dedicated-canary-result.json', {at: new Date().toISOString(), ...outcome});
      assert.equal(outcome.httpStatus, 200, 'Canary not confirmed; inspect provider, never retry automatically');
      assert.ok(['delivered', 'queued'].includes(outcome.status));
      console.log(JSON.stringify({dedicatedCredentialCanary: outcome.status, providerId: outcome.providerId}));
    } catch (error) {
      verificationError = error;
      await save('qualification-failed.json', {at: new Date().toISOString(), message: error.message});
    } finally {
      // Replace the temporary private verifier even when its test fails. Final entry
      // has no verification/canary route and immediately fails closed while disabled.
      await assertManifest(`${root}/final`, finalManifest);
      await deploy(`${root}/final`);
      await save('final-deployed.json', {at: new Date().toISOString(), temporaryVerifierRemoved: true});
    }
    if (verificationError) throw verificationError;
  }
  const after = functions();
  assert.deepEqual(after.filter(v => v.slug !== slug), before, 'Existing function inventory must be unchanged');
  const secretsAfter = secrets();
  compareSecretMetadata(secretsAfter, await json(`${root}/secrets-before.json`));
  await save('secrets-after.json', secretsAfter);
  const released = after.find(v => v.slug === slug);
  assert.equal(released?.status, 'ACTIVE');
  assert.equal(released.verify_jwt, false);
  const disabled = await request('');
  const removedProbe = await request('verify');
  assert.equal(disabled.httpStatus, 503);
  assert.equal(disabled.message, 'Dispatcher disabled');
  assert.deepEqual(removedProbe, disabled);
  await mkdir(`${root}/download`, {recursive: true});
  cli(['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/download`], false);
  for (const path of files.filter(p => !p.endsWith('/deno.d.ts'))) {
    assert.equal(hash((await read(`${root}/download/${path}`)).replaceAll('\r\n', '\n')), hash((await read(`${root}/final/${path}`)).replaceAll('\r\n', '\n')), `Deployed source ${path}`);
  }
  const checks = cli(['db', 'query', '--linked', '--file', 'scripts/portal-triage-member-canary.sql', '--output-format', 'json']).rows;
  const result = {at: new Date().toISOString(), function: {id: released.id, slug, version: released.version, sha256: released.ezbr_sha256}, existingFunctionsUnchanged: before.length, secretDigestsUnchanged: true, exactDeployedSource: true, dispatcherDisabled: true, temporaryVerifierRemoved: true, memberAndEmployeeReadChecks: checks};
  await save('verified.json', result);
  console.log(JSON.stringify(result));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
