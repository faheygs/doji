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
  buildMobileWorkflowStagingEdge,
} from './build-staging-edge.mts';

test('mobile reporting has its own staging-only package, exact egress and bundled shared contract', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'doji-mobile-observations-test-'));
  const previous = globalThis.fetch;
  globalThis.fetch = () => { throw Error('Unexpected external request'); };
  try {
    const target = await buildMobileWorkflowStagingEdge(join(scratch, 'package'));
    assert.deepEqual(await readdir(join(target, 'supabase/functions')), ['mobile-workflow-report']);
    const manifest = JSON.parse(await readFile(join(target, 'manifest.json'), 'utf8'));
    assert.equal(manifest.projectRef, 'ohrcupagdoilkwhecict');
    assert.ok(manifest.inputs.includes('contracts/mobileWorkflowTelemetry.ts'));
    const entry = await readFile(join(target, 'supabase/functions/mobile-workflow-report/index.ts'), 'utf8');
    assert.ok(entry.indexOf('globalThis.fetch =') < entry.indexOf("await import('./handler.ts')"));
    assert.ok(entry.includes("redirect: 'error'"));
    const install = new Function('Deno', 'Request', 'globalThis', entry.replace("await import('./handler.ts');", ''));
    const settings = { DOJI_ENVIRONMENT: 'staging', SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co' };
    const sent: Request[] = [];
    const isolated = { fetch: async (request: Request, init: RequestInit) => {
      sent.push(request); assert.equal(init.redirect, 'error'); return new Response(null, { status: 204 });
    } };
    install({ env: { get: (name: keyof typeof settings) => settings[name] } }, Request, isolated);
    await isolated.fetch(new Request(`${settings.SUPABASE_URL}/auth/v1/user`), {});
    assert.equal(sent.length, 1);
    for (const url of ['https://tvixsmqxotuvyjqzmjla.supabase.co/auth/v1/user', `${settings.SUPABASE_URL}/rest/v1/profiles`, `${settings.SUPABASE_URL}/auth/v1/user?token=private`])
      assert.throws(() => isolated.fetch(new Request(url), {}), /destination rejected/);
    assert.throws(() => install({ env: { get: () => 'production' } }, Request, isolated), /bindings rejected/);
    const code = await readFile(join(target, 'supabase/functions/mobile-workflow-report/handler.ts'), 'utf8');
    assert.equal(manifest.sha256, createHash('sha256').update(code).digest('hex'));
    assert.ok(!code.includes('../../../contracts/'));
  } finally { globalThis.fetch = previous; await rm(scratch, { recursive: true, force: true }); }
});

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
      'employee-sentry',
      'bounded-body',
      'employee-mobile-workflows',
      'mobile-workflow-read',
    ])
      assert.ok(manifest.inputs.includes(`infra/portal-identity/${module}.mts`));
    assert.ok(
      manifest.inputs.every(
        (file: string) =>
          file === 'supabase/functions/admin-development/index.ts' ||
          file === 'contracts/mobileWorkflowTelemetry.ts' ||
          file.startsWith('infra/portal-identity/'),
      ),
    );
    const entry = await readFile(
      join(output, 'supabase/functions/admin-development/index.ts'),
      'utf8',
    );
    assert.equal(manifest.sha256, createHash('sha256').update(entry).digest('hex'));
    assert.ok(entry.includes('ADMIN_DEVELOPMENT_MOBILE_WORKFLOW_READS_ENABLED'));
    assert.doesNotMatch(entry, /record_mobile_workflow_counts_v1|MOBILE_WORKFLOW_REPORTING_ENABLED/);
    assert.deepEqual(await readdir(join(output, 'supabase/functions')), ['admin-development']);
    assert.doesNotMatch(entry, /from ["']\.\./);
    await assert.rejects(buildAdminDevelopmentEdge(output));
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});
