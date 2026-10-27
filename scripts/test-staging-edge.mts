import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildStagingEdge,
  stagingFunctions,
  buildAdminDevelopmentEdge,
} from './build-staging-edge.mts';

test('staging packages unchanged named handlers behind fail-closed egress, with no deploy or credentials', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'doji-stage-edge-test-'));
  const original = globalThis.fetch;
  globalThis.fetch = () => {
    throw Error('Unexpected network request');
  };
  try {
    const output = join(scratch, 'package');
    await buildStagingEdge(output);
    const config = await readFile(join(output, 'supabase/config.toml'), 'utf8');
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.projectRef, 'ohrcupagdoilkwhecict');
    assert.equal(manifest.realDelivery, 'denied-unless-approved-admin-test-email');
    for (const name of stagingFunctions) {
      assert.ok(config.includes(`[functions.${name}]\nverify_jwt = false`));
      const source = await readFile(resolve('supabase/functions', name, 'index.ts'), 'utf8');
      assert.equal(
        await readFile(join(output, 'supabase/functions', name, 'handler.ts'), 'utf8'),
        source,
      );
      assert.equal(manifest.functions[name], createHash('sha256').update(source).digest('hex'));
      for (const file of await readdir(resolve('supabase/functions', name))) {
        if (file === 'index.ts') continue;
        assert.deepEqual(
          await readFile(join(output, 'supabase/functions', name, file)),
          await readFile(resolve('supabase/functions', name, file)),
        );
      }
      const entry = await readFile(join(output, 'supabase/functions', name, 'index.ts'), 'utf8');
      assert.ok(
        entry.indexOf('globalThis.fetch = stagingFetch') <
          entry.indexOf("await import('./handler.ts')"),
      );
    }
    const included = await readdir(join(output, 'supabase/functions'));
    assert.deepEqual(included.sort(), [...stagingFunctions, '_shared', 'deno.d.ts'].sort());
    await assert.rejects(buildStagingEdge(output));
    await assert.rejects(buildStagingEdge(resolve('test-results/staging-edge')));
  } finally {
    globalThis.fetch = original;
    await rm(scratch, { recursive: true, force: true });
  }
});

test('development gateway artifact includes shared resource authorization without other handlers or secrets', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'doji-development-edge-test-'));
  try {
    const output = await buildAdminDevelopmentEdge(join(scratch, 'package'));
    const manifest = JSON.parse(await readFile(join(output, 'manifest.json'), 'utf8'));
    assert.equal(manifest.projectRef, 'ohrcupagdoilkwhecict');
    assert.equal(manifest.function, 'admin-development');
    for (const module of [
      'admin-development',
      'employee-resources',
      'employee-storage-signer',
      'bounded-body',
    ])
      assert.ok(manifest.inputs.includes(`infra/portal-identity/${module}.mts`));
    assert.ok(
      manifest.inputs.every(
        (file: string) =>
          file === 'supabase/functions/admin-development/index.ts' ||
          file.startsWith('infra/portal-identity/'),
      ),
    );
    const entry = await readFile(
      join(output, 'supabase/functions/admin-development/index.ts'),
      'utf8',
    );
    assert.equal(manifest.sha256, createHash('sha256').update(entry).digest('hex'));
    assert.deepEqual(await readdir(join(output, 'supabase/functions')), ['admin-development']);
    assert.doesNotMatch(entry, /from ["']\.\./);
    await assert.rejects(buildAdminDevelopmentEdge(output));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
