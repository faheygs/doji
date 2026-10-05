import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { record, firstRecord } from './contracts.mts';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const image = 'public.ecr.aws/supabase/postgres:17.6.1.159';
export const authImage = 'docker.io/supabase/gotrue:v2.197.0';
export const storageImage = 'public.ecr.aws/supabase/storage-api:v1.69.11';
export const engine =
  process.env.DOJI_TEST_ENGINE ||
  (process.platform === 'win32' ? 'C:/Program Files/RedHat/Podman/podman.exe' : 'docker');

export function isLocalEngineEndpoint(endpoint: string) {
  if (/^unix:\/\/\//.test(endpoint) || /^npipe:\/\/\/\/\.\/pipe\//.test(endpoint)) return true;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'ssh:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function verifyOwnedContainer(info: unknown, name: string) {
  assert.match(name || '', /^doji-db-test-[0-9a-f-]{36}$/);
  assert.ok(
    record(info) && record(info.Config) && record(info.Config.Labels) && record(info.HostConfig),
  );
  assert.equal(info.Config.Labels['com.doji.test.clean-room'], name.slice('doji-db-test-'.length));
  assert.equal(info.HostConfig.NetworkMode, 'none');
  const ports = info.HostConfig.PortBindings ?? {};
  assert.ok(record(ports));
  assert.equal(Object.keys(ports).length, 0);
  const mounts = info.Mounts ?? [];
  assert.ok(Array.isArray(mounts));
  assert.ok(
    !mounts.some((m: unknown) => !record(m) || m.Type === 'bind'),
    'Host mounts are forbidden',
  );
}

export function verifyLocalEngine() {
  const executable = basename(engine.replaceAll('\\', '/'));
  assert.match(
    executable,
    /^(docker|podman)(\.exe)?$/,
    'Only a local Docker or Podman engine is supported',
  );
  for (const variable of ['DOCKER_HOST', 'CONTAINER_HOST']) {
    const value = process.env[variable];
    if (value) assert.ok(isLocalEngineEndpoint(value), 'Remote engine overrides are forbidden');
  }
  const read = (args: string[]) =>
    execFileSync(engine, args, { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  if (executable.startsWith('docker')) {
    const context = read(['context', 'show']).trim();
    const info = firstRecord(JSON.parse(read(['context', 'inspect', context])));
    assert.ok(
      record(info.Endpoints) &&
        record(info.Endpoints.docker) &&
        typeof info.Endpoints.docker.Host === 'string',
    );
    assert.ok(
      isLocalEngineEndpoint(info.Endpoints.docker.Host),
      'A local Docker context is required',
    );
  } else {
    const connections: unknown = JSON.parse(
      read(['system', 'connection', 'list', '--format=json']),
    );
    assert.ok(Array.isArray(connections) && connections.every(record));
    const selected = process.env.CONTAINER_CONNECTION
      ? connections.find((c) => c.Name === process.env.CONTAINER_CONNECTION)
      : connections.find((c) => c.Default);
    // Native Linux Podman has no remote connection; Windows requires a local VM.
    if (selected) {
      assert.equal(typeof selected.URI, 'string');
      if (typeof selected.URI !== 'string') throw Error('Invalid local engine URI');
      assert.ok(isLocalEngineEndpoint(selected.URI), 'A loopback Podman machine is required');
    } else assert.equal(process.platform, 'linux', 'No local Podman machine configured');
  }
}
