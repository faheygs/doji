// Local-only coverage runner. Replaces only the previous coverage output, never
// release evidence. No deployment, credentials, database or provider access.
import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, '..');
const output = path.resolve(root, 'test-results/coverage/current');
const browserCheck = spawnSync(process.execPath, ['scripts/check-test-browser.mts'], {
  cwd: root,
  stdio: 'inherit',
});
if (browserCheck.status !== 0) process.exit(browserCheck.status || 1);
if (path.relative(root, output) !== path.join('test-results', 'coverage', 'current')) {
  throw Error('Coverage output escaped its fixed directory');
}
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
const tests = spawnSync(
  process.execPath,
  [
    require.resolve('jest/bin/jest'),
    '--config',
    // Jest 29's CLI extension allowlist predates .cts. Node loads the typed
    // config natively; pass its unchanged serializable options through the
    // CLI's supported JSON-config path, without an untyped wrapper or loader.
    JSON.stringify(require('../jest.coverage.config.cts')),
    '--runInBand',
    '--json',
    '--outputFile',
    path.join(output, 'jest-results.json'),
  ],
  { cwd: root, stdio: 'inherit' },
);
const offline = spawnSync(process.execPath, ['scripts/run-offline-coverage.mts'], {
  cwd: root,
  stdio: 'inherit',
});
const prepare = spawnSync(process.execPath, ['scripts/prepare-browser-coverage.mts'], {
  cwd: root,
  stdio: 'inherit',
});
const browser =
  prepare.status === 0
    ? spawnSync(
        process.execPath,
        [
          require.resolve('@playwright/test/cli'),
          'test',
          '--config=website/playwright.coverage.config.mts',
        ],
        { cwd: root, stdio: 'inherit' },
      )
    : { status: 1, signal: null, error: undefined };
const merge = spawnSync(process.execPath, ['scripts/merge-coverage.mts'], {
  cwd: root,
  stdio: 'inherit',
});
const gate = spawnSync(process.execPath, ['scripts/check-coverage.mts'], {
  cwd: root,
  stdio: 'inherit',
});
writeFileSync(
  path.join(output, 'run-status.json'),
  JSON.stringify(
    {
      finishedAt: new Date().toISOString(),
      node: process.version,
      stages: Object.fromEntries(
        Object.entries({ tests, offline, prepare, browser, merge, gate } satisfies Record<
          string,
          Pick<SpawnSyncReturns<Buffer>, 'status' | 'signal' | 'error'>
        >).map(([name, result]) => [
          name,
          {
            status: result.status,
            signal: result.signal || null,
            error: result.error?.message || null,
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
process.exitCode = [tests, offline, prepare, browser, merge, gate].every(
  (result) => result.status === 0,
)
  ? 0
  : 1;
