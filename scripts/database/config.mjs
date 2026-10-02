import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const image = 'public.ecr.aws/supabase/postgres:17.6.1.159';
export const authImage = 'docker.io/supabase/gotrue:v2.197.0';
export const storageImage = 'public.ecr.aws/supabase/storage-api:v1.69.11';
export const engine =
  process.env.DOJI_TEST_ENGINE ||
  (process.platform === 'win32' ? 'C:/Program Files/RedHat/Podman/podman.exe' : 'docker');

export function isLocalEngineEndpoint(endpoint) {
  if (/^unix:\/\/\//.test(endpoint) || /^npipe:\/\/\/\/\.\/pipe\//.test(endpoint)) return true;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'ssh:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function verifyOwnedContainer(info, name) {
  assert.match(name || '', /^doji-db-test-[0-9a-f-]{36}$/);
  assert.equal(info.Config.Labels['com.doji.test.clean-room'], name.slice('doji-db-test-'.length));
  assert.equal(info.HostConfig.NetworkMode, 'none');
  assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
  assert.ok(!(info.Mounts || []).some((m) => m.Type === 'bind'), 'Host mounts are forbidden');
}

export function verifyLocalEngine() {
  const executable = basename(engine.replaceAll('\\', '/'));
  assert.match(
    executable,
    /^(docker|podman)(\.exe)?$/,
    'Only a local Docker or Podman engine is supported',
  );
  for (const variable of ['DOCKER_HOST', 'CONTAINER_HOST']) {
    if (process.env[variable])
      assert.ok(
        isLocalEngineEndpoint(process.env[variable]),
        'Remote engine overrides are forbidden',
      );
  }
  const read = (args) =>
    execFileSync(engine, args, { encoding: 'utf8', timeout: 10000, maxBuffer: 1024 * 1024 });
  if (executable.startsWith('docker')) {
    const context = read(['context', 'show']).trim();
    const info = JSON.parse(read(['context', 'inspect', context]))[0];
    assert.ok(
      isLocalEngineEndpoint(info.Endpoints.docker.Host),
      'A local Docker context is required',
    );
  } else {
    const connections = JSON.parse(read(['system', 'connection', 'list', '--format=json']));
    const selected = process.env.CONTAINER_CONNECTION
      ? connections.find((c) => c.Name === process.env.CONTAINER_CONNECTION)
      : connections.find((c) => c.Default);
    // Native Linux Podman has no remote connection; Windows requires a local VM.
    if (selected)
      assert.ok(isLocalEngineEndpoint(selected.URI), 'A loopback Podman machine is required');
    else assert.equal(process.platform, 'linux', 'No local Podman machine configured');
  }
}
