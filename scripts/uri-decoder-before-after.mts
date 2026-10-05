// Offline synthetic control; never send malformed URLs to production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { record } from './database/contracts.mts';
const require = createRequire(import.meta.url);
const old = 'C:/Users/gfahe/.codex/worktrees/quality-gates/DoIt/node_modules/decode-uri-component';
const metadata: unknown = JSON.parse(readFileSync(old + '/package.json', 'utf8'));
assert.ok(record(metadata));
assert.equal(metadata.version, '0.2.2');
const evidence = [];
for (const [name, path] of [
  ['old-0.2.2', old],
  ['fixed-0.5.0-adapter', require.resolve('../vendor/decode-uri-component-compat')],
] as const) {
  const started = Date.now();
  const run = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(path)})('%ab'.repeat(32768));`],
    { timeout: 2000, encoding: 'utf8' },
  );
  evidence.push({
    name,
    elapsedMs: Date.now() - started,
    status: run.status,
    timedOut: (record(run.error) ? run.error.code : undefined) === 'ETIMEDOUT',
    stderr: (run.stderr || '').slice(0, 300),
  });
}
const before = evidence[0],
  after = evidence[1];
assert.ok(before && after);
assert.ok(
  before.timedOut || before.status !== 0,
  'Old control must exhibit the malformed-input failure',
);
assert.equal(after.status, 0);
assert.equal(after.timedOut, false);
writeFileSync(
  'test-results/ios-security-103/before-after.json',
  JSON.stringify(
    {
      at: new Date().toISOString(),
      input: '32768 invalid percent-encoded bytes, local only',
      evidence,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(evidence));
