// Explicit allowlist only. Do not glob scripts/test-*: some are hosted or mutate
// local databases. The preload also rejects accidental real network requests.
const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const files = [
  'test-employee-http.mjs',
  'test-employee-browser-transport.mjs',
  'test-employee-session-store-boundaries.mjs',
  'test-employee-admission.mjs',
  'test-employee-application-adapter.mjs',
  'test-employee-resources.mjs',
  'test-employee-proxy.mjs',
  'test-employee-health.mjs',
  'test-workos-session-reader.mjs',
  'test-workos-employee-provider.mjs',
  'test-portal-identity-verifier.mjs',
  'test-employee-setup-return.mjs',
  'test-business-http.mjs',
  'test-restricted-portal-sql.mjs',
  'test-portal-registration-boundaries.mjs',
  'test-employee-storage-boundaries.mjs',
  'test-business-identity-boundaries.mjs',
  'test-employee-runtime-boundaries.mjs',
  'test-business-application-client.mjs',
  'test-business-realtime.mjs',
  'test-business-client-boundaries.mjs',
  'test-admin-client-boundaries.mjs',
  'test-admin-health-boundaries.mjs',
];
let failed = false;
const results = [];
for (const file of files) {
  const result = spawnSync(
    process.execPath,
    ['--import', './scripts/coverage-node-hook.mjs', `scripts/${file}`],
    {
      cwd: path.resolve(__dirname, '..'),
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
const output = path.resolve(__dirname, '../test-results/coverage/current');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'offline-results.json'), JSON.stringify(results, null, 2) + '\n');
process.exitCode = failed ? 1 : 0;
