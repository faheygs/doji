// Prove database tests work from source alone, without node_modules, .env files,
// retained databases or historical generated test-results artifacts.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { root } from './config.mts';
import { message, record } from './contracts.mts';

const output = resolve(root, 'test-results/database');
const name = `source-only-${randomUUID()}`;
const target = resolve(output, name);
assert.equal(relative(output, target), name);
assert.ok(!existsSync(target));
mkdirSync(target, { recursive: true });
const inventory: { path: string; sha256: string }[] = [];
const groups: [string, RegExp][] = [
  ['scripts', /\.(mjs|cjs|mts|cts|sql)$/],
  ['scripts/database', /\.(mjs|mts|json)$/],
  ['supabase/migrations', /\.sql$/],
  ['supabase/tests', /\.sql$/],
  ['docs/drafts', /\.sql$/],
  ['infra/portal-identity-candidate', /\.(mjs|mts)$/],
];
const report: {
  startedAt: string;
  status: string;
  inventory: typeof inventory;
  run?: unknown;
  error?: string;
  finishedAt?: string;
} = { startedAt: new Date().toISOString(), status: 'failed', inventory };
try {
  for (const [dir, pattern] of groups) {
    for (const file of readdirSync(resolve(root, dir)).sort()) {
      if (!pattern.test(file)) continue;
      const path = `${dir}/${file}`;
      assert.ok(lstatSync(resolve(root, path)).isFile(), 'Source files must not be symlinks');
      const destination = resolve(target, path);
      mkdirSync(dirname(destination), { recursive: true });
      copyFileSync(resolve(root, path), destination);
      inventory.push({
        path,
        sha256: createHash('sha256').update(readFileSync(destination)).digest('hex'),
      });
    }
  }
  for (const forbidden of ['node_modules', '.env', '.env.local', '.git', 'test-results'])
    assert.ok(!existsSync(resolve(target, forbidden)));
  console.log(
    'Source-only verification: no dependencies, credentials, Git state or retained test artifacts copied.',
  );
  const exitCode = await new Promise<number | null>((resolveRun, reject) => {
    const child = execFile(process.execPath, ['scripts/database/clean-room.mts'], {
      cwd: target,
      env: process.env,
      timeout: 600000,
      maxBuffer: 4 * 1024 * 1024,
    });
    child.stdout?.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', resolveRun);
  });
  report.run = JSON.parse(
    readFileSync(resolve(target, 'test-results/database/clean-room.json'), 'utf8'),
  );
  assert.equal(exitCode, 0, 'Source-only database run must pass');
  assert.ok(record(report.run), 'Source-only run must produce a report');
  assert.equal(report.run.status, 'passed');
  assert.ok(!report.run.cleanupError);
  report.status = 'passed';
} catch (error) {
  report.error = message(error);
  console.error(message(error));
  process.exitCode = 1;
} finally {
  // Delete only this run's exact generated source copy, never a checkout or baseline.
  assert.equal(relative(output, target), name);
  assert.match(name, /^source-only-[0-9a-f-]{36}$/);
  rmSync(target, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(output, 'reproducibility.json'), JSON.stringify(report, null, 2) + '\n');
}
