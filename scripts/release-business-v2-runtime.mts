// Approved business-only runtime wiring. Database/signup gates are never changed here.
import assert from 'node:assert/strict';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes, createHmac } from 'node:crypto';
import { cli, cf, ref, hash, inventory } from './prepare-safety-launch.mts';
import {
  functions,
  secrets,
  pages,
  database,
  linkedWorkspace,
} from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceArray, evidenceRows } from './release-evidence.mts';
import { runtimeSourceClosure } from './business-runtime-source-closure.mts';
import { createBusinessRuntime } from '../infra/portal-identity-candidate/business-runtime.mts';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
import type { BusinessRuntimeConfig } from '../infra/portal-identity-candidate/business-runtime.mts';
const root = 'test-results/business-v2-runtime-20261005',
  slug = 'business-portal-v2';
const secretRoot = '.artifacts/business-runtime',
  configPath = `${secretRoot}/runtime.json`;
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'configure', 'deploy', 'verify', 'enable', 'probe'].includes(mode));
const save = (name: string, data: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const configuration = async (): Promise<BusinessRuntimeConfig> =>
  JSON.parse(await readFile(configPath, 'utf8'));
function gatesClosed() {
  const rows = evidenceRows(
    cli([
      'db',
      'query',
      `begin read only;set local statement_timeout='4s';
 select jsonb_build_object('session',(select enabled from business_session_private.settings where singleton),
 'registration',(select registration_enabled from business_session_private.settings where singleton),
 'realm',coalesce((select enabled from portal_identity_private.realms where realm='business'),false),
 'accounts',(select count(*) from (select 1 from business_private.accounts limit 2) q)) as gates;rollback;`,
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]),
  );
  assert.deepEqual(evidenceRecord(rows[0]?.gates), {
    session: false,
    registration: false,
    realm: false,
    accounts: 0,
  });
}
async function guard(before: Record<string, unknown>, secretSteps: number, deployed: boolean) {
  const now = functions();
  assert.equal(now.length, evidenceArray(before.functions).length);
  for (const old of evidenceArray(before.functions)) {
    const current = now.find((f) => f.id === old.id);
    assert.ok(current);
    if (old.slug === slug && deployed) {
      assert.equal(current.version, Number(old.version) + secretSteps + 1);
      continue;
    }
    assert.deepEqual({ ...current, version: old.version }, old, `Function drift ${old.slug}`);
    assert.equal(current.version, Number(old.version) + secretSteps);
  }
  const currentSecrets = secrets();
  for (const old of evidenceArray(before.secrets)) {
    const current = currentSecrets.find((s) => s.name === old.name);
    assert.ok(current);
    if (old.name === 'BUSINESS_V2_ENABLED')
      assert.equal(current.value, hash(secretSteps === 2 ? 'true' : 'false'));
    else
      assert.deepEqual({ ...current, updated_at: old.updated_at }, old, `Secret drift ${old.name}`);
  }
  const added = currentSecrets.filter(
    (s) => !evidenceArray(before.secrets).some((o) => o.name === s.name),
  );
  assert.equal(added.length, secretSteps ? 1 : 0);
  if (secretSteps) {
    assert.equal(added[0]?.name, 'BUSINESS_V2_CONFIG');
    assert.equal(added[0]?.value, hash(JSON.stringify(await configuration())));
  }
  assert.deepEqual(await pages(), before.pages, 'Pages drift');
  const db = database(),
    old = evidenceRecord(before.database);
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  for (const key of ['contracts', 'policies', 'roles']) assert.equal(db[key], old[key], key);
  gatesClosed();
}
await mkdir(root, { recursive: true });
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
if (mode === 'prepare') {
  await assert.rejects(access(`${root}/baseline.json`), 'Preparation already exists');
  await assert.rejects(access(configPath), 'Do not replace runtime keys');
  const before = {
    at: new Date().toISOString(),
    functions: functions(),
    secrets: secrets(),
    pages: await pages(),
    database: database(),
  };
  assert.ok(before.functions.some((f) => f.slug === slug));
  assert.ok(!before.secrets.some((s) => s.name === 'BUSINESS_V2_CONFIG'));
  assert.equal(before.secrets.find((s) => s.name === 'BUSINESS_V2_ENABLED')?.value, hash('false'));
  assert.equal(before.database.event_window, false);
  assert.equal(before.database.overdue_sample, 0);
  gatesClosed();
  const provider = evidenceRecord(
    evidenceRecord(
      JSON.parse(
        await readFile(`${linkedWorkspace}/.artifacts/workos-production/credentials.json`, 'utf8'),
      ),
    ).business,
  );
  assert.equal(provider.environment, 'environment_01M3T5131BPKBR7F6P2MAG6SBJ');
  assert.equal(provider.clientId, 'client_01M3T51363MDZZK6X8DB7NS32N');
  const widgets = evidenceArray(await cf('/challenges/widgets')).filter(
    (w) => w.name === 'Doji Business Onboarding',
  );
  assert.equal(widgets.length, 1);
  const widget = evidenceRecord(await cf(`/challenges/widgets/${widgets[0]?.sitekey}`));
  assert.deepEqual(widget.domains, ['business.dojipro.com']);
  assert.equal(widget.mode, 'managed');
  const config: BusinessRuntimeConfig = {
    enabled: true,
    signupEnabled: true,
    realm: 'business',
    origin: 'https://business.dojipro.com',
    endpoint: `https://${ref}.supabase.co/functions/v1/${slug}`,
    clientId: String(provider.clientId),
    apiKey: String(provider.apiKey),
    database: JSON.parse(await readFile(`${secretRoot}/database.json`, 'utf8')),
    actionSecret: await readFile(`${secretRoot}/action-secret.txt`, 'utf8'),
    turnstileSecret: String(widget.secret),
    encryptionKey: randomBytes(32).toString('hex'),
    proxyKey: randomBytes(32).toString('hex'),
    termsVersion: 'business-terms-20260930-v1',
    privacyVersion: 'business-privacy-20260930-v1',
  };
  assert.ok(config.apiKey.startsWith('sk_') && widget.secret && widget.sitekey);
  createBusinessRuntime(config, {
    createClient: () => {
      throw Error('No connection during validation');
    },
  });
  await writeFile(configPath, JSON.stringify(config), { flag: 'wx', mode: 0o600 });
  await writeFile(`${secretRoot}/runtime.env`, `BUSINESS_V2_CONFIG=${JSON.stringify(config)}\n`, {
    flag: 'wx',
    mode: 0o600,
  });
  const base = `${root}/edge/supabase/functions/${slug}`;
  await mkdir(`${base}/runtime`, { recursive: true });
  const all = await runtimeSourceClosure('infra/portal-identity-candidate', 'business-runtime.mts');
  for (const file of all) {
    assert.ok(/^[a-z0-9-]+\.mts$/.test(file));
    await writeFile(
      `${base}/runtime/${file}`,
      await readFile(`infra/portal-identity-candidate/${file}`),
      { flag: 'wx' },
    );
  }
  const entry = await readFile(`supabase/functions/${slug}/index.ts`, 'utf8');
  assert.equal(entry.split('../../../infra/portal-identity-candidate/').length, 2);
  await writeFile(
    `${base}/index.ts`,
    entry.replace('../../../infra/portal-identity-candidate/', './runtime/'),
    { flag: 'wx' },
  );
  await writeFile(`${base}/deno.json`, await readFile(`supabase/functions/${slug}/deno.json`), {
    flag: 'wx',
  });
  await writeFile(
    `${root}/edge/supabase/config.toml`,
    `project_id = "business-v2-runtime"\n[functions.${slug}]\nverify_jwt = false\nimport_map = "./functions/${slug}/deno.json"\n`,
    { flag: 'wx' },
  );
  await mkdir(`${root}/rollback`, { recursive: true });
  cli(
    [
      'functions',
      'download',
      slug,
      '--project-ref',
      ref,
      '--use-api',
      '--workdir',
      `${root}/rollback`,
    ],
    false,
  );
  await buildBusinessIdentity(`${root}/pages`, {
    enabled: true,
    origin: config.origin,
    turnstileSiteKey: String(widget.sitekey),
    termsVersion: config.termsVersion,
    privacyVersion: config.privacyVersion,
    termsUrl: config.origin + '/business-terms/',
    privacyUrl: config.origin + '/business-privacy/',
  });
  await save('baseline', before);
  await save('candidate', {
    at: new Date().toISOString(),
    assets: await inventory(`${root}/edge`),
    pages: await inventory(`${root}/pages`),
    rollback: await inventory(`${root}/rollback`),
  });
  console.log(
    'Prepared exact business runtime/Pages artifacts, protected configuration and prior Edge rollback. No production changes.',
  );
} else {
  const before = await read('baseline'),
    candidate = await read('candidate');
  assert.deepEqual(
    (await inventory(`${root}/edge`)).filter((f) => !f.path.includes('/.temp/')),
    candidate.assets,
  );
  if (mode === 'configure') {
    await guard(before, 0, false);
    await save('configure-started', { at: new Date().toISOString() });
    cli(
      ['secrets', 'set', '--env-file', resolve(`${secretRoot}/runtime.env`), '--project-ref', ref],
      false,
    );
    await guard(before, 1, false);
    await save('configured', { at: new Date().toISOString(), enabled: false });
    console.log(
      'Business-only runtime configuration installed; endpoint and database gates remain disabled.',
    );
  } else if (mode === 'deploy') {
    await read('configured');
    await guard(before, 1, false);
    await save('deploy-started', { at: new Date().toISOString() });
    cli(
      ['functions', 'deploy', slug, '--project-ref', ref, '--use-api', '--workdir', `${root}/edge`],
      false,
    );
    await guard(before, 1, true);
    console.log('Business runtime deployed disabled. Run verify before enable.');
  } else if (mode === 'verify') {
    await guard(before, 1, true);
    const folder = `${root}/download-${Date.now()}`;
    await mkdir(folder, { recursive: true });
    cli(
      ['functions', 'download', slug, '--project-ref', ref, '--use-api', '--workdir', folder],
      false,
    );
    const files = await inventory(folder),
      required = await runtimeSourceClosure(`${root}/edge`, `supabase/functions/${slug}/index.ts`);
    for (const source of evidenceArray(candidate.assets)) {
      const path = String(source.path);
      if (!required.has(path)) continue;
      const found = files.filter((f) => f.path.endsWith('/' + path.split('/').at(-1)));
      assert.equal(found.length, 1, path);
      assert.equal(
        hash((await readFile(`${folder}/${found[0]?.path}`, 'utf8')).replaceAll('\r\n', '\n')),
        hash((await readFile(`${root}/edge/${path}`, 'utf8')).replaceAll('\r\n', '\n')),
        path,
      );
    }
    const response = await fetch(`https://${ref}.supabase.co/functions/v1/${slug}/api/session`, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 503);
    assert.equal(await response.text(), '');
    await save('verified', { at: new Date().toISOString(), sourceVerified: true, disabled: true });
    console.log('Exact business runtime source verified; endpoint disabled.');
  } else if (mode === 'enable') {
    await read('verified');
    await guard(before, 1, true);
    await save('enable-started', { at: new Date().toISOString() });
    cli(['secrets', 'set', 'BUSINESS_V2_ENABLED=true', '--project-ref', ref], false);
    await guard(before, 2, true);
    await save('enabled', { at: new Date().toISOString(), databaseGatesClosed: true });
    console.log(
      'Business ingress enabled for qualification only; database signup/session gates remain closed.',
    );
  } else {
    await read('enabled');
    await guard(before, 2, true);
    const config = await configuration();
    const body = JSON.stringify({
      object: 'user_registration_action_context',
      id: 'action_release_probe',
      user_data: { object: 'user_data', email: 'release-probe@example.invalid' },
    });
    const timestamp = Date.now(),
      signature = createHmac('sha256', config.actionSecret)
        .update(`${timestamp}.${body}`)
        .digest('hex');
    const results = [];
    for (const valid of [false, true]) {
      const response = await fetch(config.endpoint + '/auth/workos-registration', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-doji-portal-proxy-key': config.proxyKey,
          'workos-signature': `t=${timestamp}, v1=${valid ? signature : '0'.repeat(64)}`,
        },
        body,
        signal: AbortSignal.timeout(15000),
      });
      assert.equal(response.status, valid ? 200 : 401);
      const data = evidenceRecord(await response.json());
      if (valid) {
        const payload = evidenceRecord(data.payload);
        assert.equal(payload.verdict, 'Deny');
        assert.equal(
          data.signature,
          createHmac('sha256', config.actionSecret)
            .update(`${payload.timestamp}.${JSON.stringify(payload)}`)
            .digest('hex'),
        );
      }
      results.push({ signed: valid, status: response.status, verdict: valid ? 'Deny' : null });
    }
    await save('probed', {
      at: new Date().toISOString(),
      results,
      providerGeneratedRequest: false,
      signupStillDisabled: true,
    });
    console.log(
      'Hosted runtime rejects forged signatures and signs Deny for valid local probe; WorkOS-generated test still required.',
    );
  }
}
