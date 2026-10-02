// Local-only coverage runner. Replaces only the previous coverage output, never
// release evidence. No deployment, credentials, database or provider access.
const { spawnSync } = require('node:child_process');
const { rmSync, mkdirSync } = require('node:fs');
const path = require('node:path');
const { writeFileSync } = require('node:fs');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, 'test-results/coverage/current');
const browserCheck = spawnSync(process.execPath, ['scripts/check-test-browser.mjs'], {
  cwd: root, stdio: 'inherit',
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
    'jest.coverage.config.cjs',
    '--runInBand',
    '--json',
    '--outputFile',
    path.join(output, 'jest-results.json'),
  ],
  { cwd: root, stdio: 'inherit' },
);
const offline = spawnSync(process.execPath, ['scripts/run-offline-coverage.cjs'], {
  cwd: root,
  stdio: 'inherit',
});
const prepare = spawnSync(process.execPath, ['scripts/prepare-browser-coverage.cjs'], {
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
          '--config=website/playwright.coverage.config.mjs',
        ],
        { cwd: root, stdio: 'inherit' },
      )
    : { status: 1 };
const merge = spawnSync(process.execPath, ['scripts/merge-coverage.cjs'], {
  cwd: root,
  stdio: 'inherit',
});
const gate = spawnSync(process.execPath, ['scripts/check-coverage.cjs'], {
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
        Object.entries({ tests, offline, prepare, browser, merge, gate }).map(([name, result]) => [
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
