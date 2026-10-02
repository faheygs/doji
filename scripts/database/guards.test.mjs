import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalEngineEndpoint, verifyOwnedContainer } from './config.mjs';
import { verifyTap } from './tap.mjs';
import { readFileSync } from 'node:fs';
import { suites } from './extended.mjs';

test('only local engine endpoints are accepted', () => {
  for (const value of [
    'unix:///var/run/docker.sock',
    'npipe:////./pipe/docker_engine',
    'ssh://user@127.0.0.1:53000/run/podman.sock',
  ])
    assert.equal(isLocalEngineEndpoint(value), true);
  for (const value of [
    'ssh://server.example/run/docker.sock',
    'https://example.com',
    'tcp://127.0.0.1:2375',
    '',
    'ssh://localhost.example.com',
  ])
    assert.equal(isLocalEngineEndpoint(value), false);
});
test('TAP verifies actual complete assertions, not just an exit code or plan', () => {
  assert.equal(verifyTap('1..2\nok 1 - boundary\nok 2 - rollback\n'), 2);
  for (const output of [
    '1..0',
    '1..1',
    '1..2\nok 1\n',
    '1..1\nnot ok 1',
    'Bail out!\n1..1\nok 1',
    '1..1\nok 1 # SKIP optional',
    '1..1\nok 1 # TODO later',
    '1..1\nok 2',
    '1..1\n1..1\nok 1',
  ])
    assert.throws(() => verifyTap(output));
});
test('database operations require exact ownership, no network, no ports and no host mounts', () => {
  const id = '12345678-1234-4234-8234-123456789abc';
  const name = `doji-db-test-${id}`;
  const safe = {
    Config: { Labels: { 'com.doji.test.clean-room': id } },
    HostConfig: { NetworkMode: 'none', PortBindings: {} },
    Mounts: [],
  };
  verifyOwnedContainer(safe, name);
  assert.throws(() => verifyOwnedContainer(safe, 'supabase_db_employee-cutover-verify'));
  assert.throws(() => verifyOwnedContainer({ ...safe, Config: { Labels: {} } }, name));
  assert.throws(() =>
    verifyOwnedContainer({ ...safe, HostConfig: { NetworkMode: 'bridge' } }, name),
  );
  assert.throws(() =>
    verifyOwnedContainer(
      { ...safe, HostConfig: { ...safe.HostConfig, PortBindings: { 5432: [] } } },
      name,
    ),
  );
  assert.throws(() => verifyOwnedContainer({ ...safe, Mounts: [{ Type: 'bind' }] }, name));
  assert.equal(isLocalEngineEndpoint('npipe:////remote/pipe/docker_engine'), false);
});
test('allowlisted database children require the parent owned target', () => {
  for (const [file] of suites) {
    const source = readFileSync(file, 'utf8');
    assert.match(source, /from '\.\/database\/owned-target\.mjs'/, file);
    assert.doesNotMatch(source, /supabase_db_|--linked|\.env\.local/, file);
  }
});
