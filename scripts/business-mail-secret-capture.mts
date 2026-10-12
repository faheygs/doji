// One-use local handoff for the owner-approved, sending-only business mail key.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createActionSecretCapture } from './business-action-secret-capture.mts';
assert.equal(process.argv.length, 2);
const directory = resolve('.artifacts/business-owned-release-2995nX');
const destination = resolve(directory, 'business-mail-key.txt');
assert.ok(existsSync(resolve(directory, 'runtime-before.json')));
assert.ok(!existsSync(destination), 'Do not replace an existing credential');
execFileSync('git', ['check-ignore', destination], { stdio: 'pipe' });
const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
execFileSync('icacls', [directory, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'], { stdio: 'pipe' });
const server = createActionSecretCapture((secret) => {
  assert.match(secret, /^re_[A-Za-z0-9_-]{20,}$/);
  writeFileSync(destination, secret, { flag: 'wx', mode: 0o600 });
  console.log('Business mail key saved securely; value omitted.');
}, 'recovery');
server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  console.log(`One-use business mail credential capture: http://127.0.0.1:${address.port}/`);
});
setTimeout(() => { server.close(); server.closeAllConnections(); }, 10 * 60000).unref();
