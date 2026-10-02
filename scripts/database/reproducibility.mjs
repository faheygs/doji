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
import { root } from './config.mjs';

const output = resolve(root, 'test-results/database');
const name = `source-only-${randomUUID()}`;
const target = resolve(output, name);
assert.equal(relative(output, target), name);
assert.ok(!existsSync(target));
mkdirSync(target, { recursive: true });
const inventory = [];
const groups = [
  ['scripts', /\.(mjs|cjs|sql)$/],
  ['scripts/database', /\.(mjs|json)$/],
  ['supabase/migrations', /\.sql$/],
  ['supabase/tests', /\.sql$/],
  ['docs/drafts', /\.sql$/],
  ['infra/portal-identity-candidate', /\.mjs$/],
];
const report = { startedAt: new Date().toISOString(), status: 'failed', inventory };
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
  const exitCode = await new Promise((resolveRun, reject) => {
    const child = execFile(process.execPath, ['scripts/database/clean-room.mjs'], {
      cwd: target,
      env: process.env,
      timeout: 600000,
      maxBuffer: 4 * 1024 * 1024,
    });
    child.stdout.on('data', (chunk) => process.stdout.write(chunk));
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
    child.on('error', reject);
    child.on('close', resolveRun);
  });
  report.run = JSON.parse(
    readFileSync(resolve(target, 'test-results/database/clean-room.json'), 'utf8'),
  );
  assert.equal(exitCode, 0, 'Source-only database run must pass');
  assert.equal(report.run.status, 'passed');
  assert.ok(!report.run.cleanupError);
  report.status = 'passed';
} catch (error) {
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  // Delete only this run's exact generated source copy, never a checkout or baseline.
  assert.equal(relative(output, target), name);
  assert.match(name, /^source-only-[0-9a-f-]{36}$/);
  rmSync(target, { recursive: true, force: true });
  report.finishedAt = new Date().toISOString();
  writeFileSync(resolve(output, 'reproducibility.json'), JSON.stringify(report, null, 2) + '\n');
}
