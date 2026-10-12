// Local-only capture into the existing protected release folder. No provider or deploy calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createActionSecretCapture } from './business-action-secret-capture.mts';

assert.equal(process.argv.length, 3);
const release = process.argv[2];
assert.ok(release);
assert.match(release, /^business-owned-release-[A-Za-z0-9]+$/);
const directory = resolve('.artifacts', release);
const destination = resolve(directory, 'reset-webhook-secret.txt');
assert.ok(existsSync(resolve(directory, 'runtime-before.json')));
assert.ok(!existsSync(destination), 'Never replace an existing signing secret');
execFileSync('git', ['check-ignore', destination], { stdio: 'pipe' });
const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
execFileSync(
  'icacls',
  [directory, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'],
  { stdio: 'pipe' },
);
const server = createActionSecretCapture((secret) => {
  assert.ok(secret.length >= 20);
  writeFileSync(destination, secret, { flag: 'wx', mode: 0o600 });
  console.log('Dedicated reset webhook secret saved securely. Value omitted.');
}, 'recovery');
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  console.log(`Local recovery-secret handoff: http://127.0.0.1:${address.port}/`);
});
setTimeout(() => {
  server.close();
  server.closeAllConnections();
}, 15 * 60000).unref();
