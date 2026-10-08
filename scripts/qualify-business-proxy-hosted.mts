// Bounded business-only qualification; never logs request metadata or credentials.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync, spawn } from 'node:child_process';
import { cf, account, inventory } from './prepare-safety-launch.mts';
import { pages, database } from './business-disabled-release-reads.mts';
import { evidenceRecord } from './release-evidence.mts';
import { buildBusinessIdentity } from '../website/build-business-identity.mts';
import type { BusinessIdentityConfig } from '../website/business-portal/identity/config.mts';
const root = 'test-results/business-v2-runtime-20261005',
  mode = process.argv[2];
assert.ok(mode && ['deploy', 'repair', 'observe'].includes(mode));
if (mode === 'deploy' || mode === 'repair') {
  const repair = mode === 'repair',
    prefix = repair ? 'proxy-final' : 'proxy-qualified';
  const expected = evidenceRecord(
    evidenceRecord(
      JSON.parse(
        await readFile(
          `${root}/${repair ? 'proxy-qualified-deployed' : 'request-signal-deployed'}.json`,
          'utf8',
        ),
      ),
    ).after,
  );
  const before = await pages();
  assert.deepEqual(before, expected);
  const db = database();
  assert.equal(db.event_window, false);
  assert.equal(db.overdue_sample, 0);
  const js = await readFile(`${root}/pages/business-portal/config.js`, 'utf8');
  const configPrefix = 'window.DOJI_BUSINESS_IDENTITY_CONFIG = Object.freeze(';
  assert.ok(js.startsWith(configPrefix) && js.endsWith(');\n'));
  const config: BusinessIdentityConfig = JSON.parse(js.slice(configPrefix.length, -3));
  const output = `${root}/${repair ? 'pages-final' : 'pages-qualified'}`;
  await buildBusinessIdentity(output, config);
  await writeFile(
    `${root}/${prefix}-candidate.json`,
    JSON.stringify({ at: new Date().toISOString(), before, assets: await inventory(output) }),
    { flag: 'wx' },
  );
  try {
    execFileSync(
      process.execPath,
      [
        'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
        'pages',
        'deploy',
        output,
        '--project-name',
        'doji-business',
        '--branch',
        'main',
        '--commit-dirty=true',
        '--commit-message',
        'Bounded business proxy runtime failure classification',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 180000,
        env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
      },
    );
  } catch {
    throw Error('Unknown deployment result; inspect before retry.');
  }
  const after = await pages();
  for (const name of ['doji-admin', 'doji-site']) assert.deepEqual(after[name], before[name]);
  await writeFile(
    `${root}/${prefix}-deployed.json`,
    JSON.stringify({ at: new Date().toISOString(), after }),
    { flag: 'wx' },
  );
  console.log('Business proxy classification deployed; other sites unchanged.');
} else {
  const p = evidenceRecord(await cf('/pages/projects/doji-business')),
    id = String(evidenceRecord(p.canonical_deployment).id);
  const child = spawn(
    process.execPath,
    [
      'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
      'pages',
      'deployment',
      'tail',
      id,
      '--project-name',
      'doji-business',
      '--format',
      'json',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account } },
  );
  let raw = '';
  child.stdout.on('data', (chunk) => {
    raw += String(chunk);
    if (raw.length > 100000) raw = raw.slice(-50000);
  });
  child.stderr.resume();
  try {
    await new Promise<void>((r) => {
      setTimeout(r, 5000);
    });
    const response = await fetch('https://business.dojipro.com/api/session', {
      headers: { origin: 'https://business.dojipro.com' },
      signal: AbortSignal.timeout(15000),
    });
    await response.body?.cancel();
    console.log(JSON.stringify({ anonymousStatus: response.status }));
    await new Promise<void>((r) => {
      setTimeout(r, 8000);
    });
    const categories = [];
    for (const match of raw.matchAll(/"message"\s*:\s*\[([\s\S]*?)\]/g)) {
      try {
        const parts: unknown = JSON.parse('[' + match[1] + ']');
        if (Array.isArray(parts) && parts[0] === 'business_proxy_boundary')
          categories.push(
            parts.filter(
              (v) =>
                typeof v === 'number' ||
                [
                  'business_proxy_boundary',
                  'redirect',
                  'cookie',
                  'request',
                  'upstream',
                  'response',
                ].includes(String(v)),
            ),
          );
      } catch {
        /* Not a complete bounded message. */
      }
    }
    console.log(JSON.stringify({ categories }));
    await writeFile(
      `${root}/proxy-observation-${Date.now()}.json`,
      JSON.stringify({ at: new Date().toISOString(), status: response.status, categories }),
      { flag: 'wx' },
    );
  } finally {
    raw = '';
    child.kill();
  }
}
