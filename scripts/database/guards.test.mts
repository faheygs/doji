import test from 'node:test';
import assert from 'node:assert/strict';
import { image, authImage, storageImage, isLocalEngineEndpoint, verifyOwnedContainer } from './config.mts';
import { verifyTap } from './tap.mts';
import { readFileSync } from 'node:fs';
import { suites } from './extended.mts';
import { offlineContainer, firstRecord, errorOutput } from './contracts.mts';
import {pullWithRateLimitRetry} from './image-pull-retry.mts';

test('test images retain the verified manifests when the download registry changes', () => {
  assert.deepEqual([image, authImage, storageImage], [
    'docker.io/supabase/postgres:17.6.1.159@sha256:86a2e078779e5bdccda1f6f6c5063aa9779a322d1fface5fb408d051909b230f',
    'docker.io/supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b',
    'docker.io/supabase/storage-api:v1.69.11@sha256:97ed68d33417d253a45fe0a70f84324d92250a3e239bf18aa6cf87269dbf6727',
  ]);
});

test('explicit image preparation retries only bounded registry rate limits',async()=>{
 const delays:number[]=[];let calls=0;
 await pullWithRateLimitRetry(()=>{calls++;if(calls<3)throw Object.assign(Error('pull failed'),{stderr:'toomanyrequests: Rate exceeded'});},async ms=>{delays.push(ms);},()=>{});
 assert.equal(calls,3);assert.deepEqual(delays,[15000,30000]);
});
test('image preparation never retries permanent failures or accepts exhausted limits',async()=>{
 for(const message of ['unauthorized','manifest unknown','certificate verify failed']){
  let calls=0;
  await assert.rejects(pullWithRateLimitRetry(()=>{calls++;throw Error(message);},async()=>{throw Error('Unexpected wait');},()=>{}));
  assert.equal(calls,1);
 }
 let calls=0;const delays:number[]=[];
 await assert.rejects(pullWithRateLimitRetry(()=>{calls++;throw Error('429 Too Many Requests');},async ms=>{delays.push(ms);},()=>{}),/429/);
 assert.equal(calls,4);assert.deepEqual(delays,[15000,30000,60000]);
});

test('untrusted local engine payloads fail closed and errors remain bounded by callers', () => {
  for (const value of [
    null,
    {},
    [],
    [null],
    [{}],
    [{ HostConfig: null }],
    [{ HostConfig: { NetworkMode: 'bridge' } }],
    [{ HostConfig: { NetworkMode: 'none', PortBindings: { 5432: [] } } }],
  ])
    assert.throws(() => offlineContainer(value));
  assert.equal(
    offlineContainer([{ HostConfig: { NetworkMode: 'none', PortBindings: null } }]).HostConfig
      .NetworkMode,
    'none',
  );
  assert.deepEqual(firstRecord([{ valid: true }]), { valid: true });
  assert.equal(
    errorOutput(Object.assign(Error('fallback'), { stderr: Buffer.from('SQLSTATE') }), 'stderr'),
    'SQLSTATE',
  );
  assert.equal(errorOutput(Error('fallback'), 'stderr'), 'fallback');
});

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
    assert.match(source, /from '\.\/database\/owned-target\.mts'/, file);
    assert.doesNotMatch(source, /supabase_db_|--linked|\.env\.local/, file);
  }
});
