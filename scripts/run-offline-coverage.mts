// Explicit allowlist only. Do not glob scripts/test-*: some are hosted or mutate
// local databases. The preload also rejects accidental real network requests.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const files = [
  'coverage-policy.test.mts',
  'test-employee-http.mts',
  'test-employee-browser-transport.mts',
  'test-employee-session-store-boundaries.mts',
  'test-employee-admission.mts',
  'test-employee-timing.mts',
  'test-employee-application-adapter.mts',
  'test-employee-resources.mts',
  'test-employee-proxy.mts',
  'test-employee-health.mts',
  'test-workos-session-reader.mts',
  'test-workos-employee-provider.mts',
  'test-portal-identity-verifier.mts',
  'test-employee-setup-return.mts',
  'test-business-http.mts',
  'test-restricted-portal-sql.mts',
  'test-portal-registration-boundaries.mts',
  'test-employee-storage-boundaries.mts',
  'test-business-identity-boundaries.mts',
  'test-business-contracts.mts',
  'test-employee-contracts.mts',
  'test-employee-runtime-boundaries.mts',
  'test-business-application-client.mts',
  'test-business-realtime.mts',
  'test-business-client-boundaries.mts',
  'test-admin-client-boundaries.mts',
  'test-admin-health-boundaries.mts',
];
let failed = false;
const results = [];
for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['--import', './scripts/coverage-node-hook.mts', `scripts/${file}`],
    {
      cwd: path.resolve(import.meta.dirname, '..'),
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  results.push({
    file,
    status: result.status,
    signal: result.signal || null,
    error: result.error?.message || null,
    // Keep bounded synthetic diagnostics even when the enclosing console is truncated.
    // Do not retry or turn a failed subprocess into a passing stage.
    failureOutput:
      result.status === 0 ? null : `${result.stdout || ''}\n${result.stderr || ''}`.slice(-24000),
  });
  if (result.status !== 0) failed = true;
}
const output = path.resolve(import.meta.dirname, '../test-results/coverage/current');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'offline-results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
