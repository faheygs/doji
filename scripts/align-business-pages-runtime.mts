// Match the already-tested workerd request-cancellation configuration exactly.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { cf, account, inventory } from './prepare-safety-launch.mts';
import { evidenceRecord } from './release-evidence.mts';
import { pages, database } from './business-disabled-release-reads.mts';
const root = 'test-results/business-v2-runtime-20261005';
const candidate = evidenceRecord(JSON.parse(await readFile(`${root}/candidate.json`, 'utf8')));
assert.deepEqual(await inventory(`${root}/pages`), candidate.pages);
const before = await pages(),
  db = database();
assert.equal(db.event_window, false);
assert.equal(db.overdue_sample, 0);
const p = evidenceRecord(await cf('/pages/projects/doji-business'));
assert.equal(evidenceRecord(p.canonical_deployment).id, 'b5774124-bb75-4fe4-86b0-5ea0cec5c89a');
const settings = evidenceRecord(p.deployment_configs),
  production = evidenceRecord(settings.production);
assert.deepEqual(production.compatibility_flags, ['nodejs_compat']);
await writeFile(
  `${root}/request-signal-started.json`,
  JSON.stringify({
    at: new Date().toISOString(),
    before,
    previousFlags: production.compatibility_flags,
  }),
  { flag: 'wx' },
);
await cf('/pages/projects/doji-business', {
  method: 'PATCH',
  body: JSON.stringify({
    deployment_configs: {
      production: { compatibility_flags: ['nodejs_compat', 'enable_request_signal'] },
    },
  }),
});
const changed = evidenceRecord(
  evidenceRecord(await cf('/pages/projects/doji-business')).deployment_configs,
);
assert.deepEqual(changed.preview, settings.preview);
assert.deepEqual(
  { ...evidenceRecord(changed.production), compatibility_flags: production.compatibility_flags },
  production,
);
try {
  execFileSync(
    process.execPath,
    [
      'infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js',
      'pages',
      'deploy',
      `${root}/pages`,
      '--project-name',
      'doji-business',
      '--branch',
      'main',
      '--commit-dirty=true',
      '--commit-message',
      'Align business proxy request-cancellation runtime flag',
    ],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180000,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: account },
    },
  );
} catch {
  throw Error('Deployment response unavailable; inspect state without retrying.');
}
const after = await pages();
for (const name of ['doji-admin', 'doji-site']) assert.deepEqual(after[name], before[name]);
await writeFile(
  `${root}/request-signal-deployed.json`,
  JSON.stringify({ at: new Date().toISOString(), after }),
  { flag: 'wx' },
);
console.log(
  'Only business Pages runtime flags aligned with local qualification; artifact unchanged. Run hosted verification.',
);
