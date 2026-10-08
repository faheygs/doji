// Independent business Pages cutover only. Does not open DB registration gates.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { cf, account, inventory, hash } from './prepare-safety-launch.mts';
import { pages, database } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceAssets } from './release-evidence.mts';
const root = 'test-results/business-v2-runtime-20261005',
  site = root + '/pages';
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const save = (name: string, data: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
const project = async () => evidenceRecord(await cf('/pages/projects/doji-business'));
const mode = process.argv[2];
assert.ok(mode && ['configure', 'deploy', 'verify'].includes(mode));
const base = await read('baseline'),
  candidate = await read('candidate');
await read('probed');
const config = evidenceRecord(
  JSON.parse(await readFile('.artifacts/business-runtime/runtime.json', 'utf8')),
);
assert.deepEqual(await inventory(site), candidate.pages);
async function unchanged(otherOnly = false) {
  const now = await pages(),
    before = evidenceRecord(base.pages);
  for (const name of otherOnly
    ? ['doji-admin', 'doji-site']
    : ['doji-admin', 'doji-site', 'doji-business'])
    assert.deepEqual(now[name], before[name], name);
  const db = database(),
    old = evidenceRecord(base.database);
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  for (const key of ['contracts', 'policies', 'roles']) assert.equal(db[key], old[key], key);
}
if (mode === 'configure') {
  await unchanged();
  const p = await project();
  assert.equal(p.production_branch, 'main');
  const settings = evidenceRecord(p.deployment_configs),
    production = evidenceRecord(settings.production);
  assert.deepEqual(production.env_vars ?? {}, {});
  assert.deepEqual(production.compatibility_flags, []);
  await save(`pages-configure-started-${Date.now()}`, {
    at: new Date().toISOString(),
    prior: settings,
    rollback: evidenceRecord(p.canonical_deployment).id,
  });
  const token = (
    await readFile(
      'C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml',
      'utf8',
    )
  ).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
  assert.ok(token);
  const configured = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/doji-business`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        deployment_configs: {
          // Cloudflare requires the failure mode to match both environments.
          // No preview credentials or routes are added.
          preview: { fail_open: false },
          production: {
            env_vars: {
              BUSINESS_V2_ENABLED: { type: 'plain_text', value: 'true' },
              BUSINESS_V2_ENDPOINT: { type: 'plain_text', value: config.endpoint },
              BUSINESS_V2_PROXY_KEY: { type: 'secret_text', value: config.proxyKey },
            },
            compatibility_flags: ['nodejs_compat'],
            fail_open: false,
          },
        },
      }),
    },
  );
  const answer = evidenceRecord(await configured.json());
  if (!configured.ok || !answer.success) {
    const safe = JSON.stringify(answer.errors || [])
      .replaceAll(token, '[REDACTED]')
      .replaceAll(String(config.proxyKey), '[REDACTED]');
    throw Error(`Business Pages configuration rejected (${configured.status}): ${safe}`);
  }
  const after = evidenceRecord((await project()).deployment_configs),
    current = evidenceRecord(after.production);
  assert.deepEqual(after.preview, { ...evidenceRecord(settings.preview), fail_open: false });
  assert.deepEqual(
    {
      ...current,
      env_vars: production.env_vars,
      compatibility_flags: [],
      fail_open: production.fail_open,
    },
    production,
  );
  const env = evidenceRecord(current.env_vars);
  assert.equal(evidenceRecord(env.BUSINESS_V2_PROXY_KEY).type, 'secret_text');
  assert.equal(evidenceRecord(env.BUSINESS_V2_ENDPOINT).value, config.endpoint);
  assert.equal(evidenceRecord(env.BUSINESS_V2_ENABLED).value, 'true');
  await unchanged();
  await save('pages-configured', { at: new Date().toISOString(), businessProxyOnly: true });
  console.log(
    'Business Pages server-only proxy configured; prior deployment and all other sites unchanged.',
  );
} else {
  await read('pages-configured');
  if (mode === 'deploy') {
    await unchanged();
    await save('pages-deploy-started', {
      at: new Date().toISOString(),
      rollback: evidenceRecord(evidenceRecord(base.pages)['doji-business']).id,
    });
    try {
      execFileSync(
        process.execPath,
        [
          'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
          'pages',
          'deploy',
          site,
          '--project-name',
          'doji-business',
          '--branch',
          'main',
          '--commit-dirty=true',
          '--commit-message',
          'Independent business identity onboarding; DB admission still closed',
        ],
        {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 180000,
          env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
        },
      );
    } catch {
      throw Error(
        'Pages deployment response unavailable; inspect current deployment before any retry.',
      );
    }
  }
  await unchanged(true);
  const p = await project(),
    deployment = evidenceRecord(p.canonical_deployment);
  assert.equal(evidenceRecord(deployment.latest_stage).status, 'success');
  assert.notEqual(deployment.id, evidenceRecord(evidenceRecord(base.pages)['doji-business']).id);
  assert.deepEqual(p.domains, ['doji-business.pages.dev', 'business.dojipro.com']);
  for (const path of [
    'business-portal/config.js',
    'business-portal/access/access.js',
    'business-portal/application/application.js',
  ]) {
    const result = await fetch('https://business.dojipro.com/' + path, {
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(result.status, 200);
    assert.equal(
      hash(Buffer.from(await result.arrayBuffer())),
      evidenceAssets(candidate.pages).find((f) => f.path === path)?.sha256,
      path,
    );
  }
  const probes = [];
  for (const origin of ['https://business.dojipro.com', 'https://admin.dojipro.com']) {
    const result = await fetch('https://business.dojipro.com/api/session', {
      headers: { origin },
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(result.status, origin === 'https://business.dojipro.com' ? 401 : 403);
    probes.push({ origin, status: result.status });
  }
  const body = JSON.stringify({
      object: 'user_registration_action_context',
      id: 'action_pages_probe',
      user_data: { object: 'user_data', email: 'release-probe@example.invalid' },
    }),
    timestamp = Date.now();
  const signature = createHmac('sha256', String(config.actionSecret))
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const result = await fetch('https://business.dojipro.com/auth/workos-registration', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'workos-signature': `t=${timestamp}, v1=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(15000),
  });
  assert.equal(result.status, 200);
  const response = evidenceRecord(await result.json()),
    payload = evidenceRecord(response.payload);
  assert.equal(payload.verdict, 'Deny');
  assert.equal(
    response.signature,
    createHmac('sha256', String(config.actionSecret))
      .update(`${payload.timestamp}.${JSON.stringify(payload)}`)
      .digest('hex'),
  );
  await save('pages-verified', {
    at: new Date().toISOString(),
    deployment: deployment.id,
    probes,
    localSignedProbe: 'Deny',
    workosTestOutstanding: true,
    signupGatesClosed: true,
  });
  console.log(
    'Business Pages source verified live; cross-origin rejected; signed probe denied with DB gates closed. WorkOS-generated test outstanding.',
  );
}
