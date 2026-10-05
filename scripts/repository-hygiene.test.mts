import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hygieneIssues } from './repository-hygiene.mts';

test('rejects committed local cache, dependency and generated artifact paths', () => {
  const files = [
    'supabase/.temp/project-ref',
    'supabase/.temp/pooler-url',
    'supabase\\.temp\\linked-project.json',
    'node_modules/example/index.ts',
    'infra/example/node_modules/example/index.ts',
    'test-results/evidence.json',
    'website/admin-portal/test-results/output.json',
    'coverage/report.json',
    '.expo/settings.json',
    '.claude/worktrees/source.ts',
    '.codex/cache.json',
    'artifacts/upload.aab',
    '.artifacts/sdk/state.json',
    'website/.admin-dist/index.html',
    'website/.business-dist/index.html',
    'website/.safety-preview/index.html',
    'website/.business-admin-qa-20261005/index.html',
    'infra/example/.wrangler/state.json',
    'modules/example/android/.gradle/state.bin',
  ];
  assert.equal(hygieneIssues(files).length, files.length);
});

test('rejects environment files and signing material without reading their values', () => {
  const files = [
    '.env',
    '.env.local',
    '.env.production',
    'website/.env.example',
    'keys/device.p8',
    'keys/upload.jks',
    'keys/private.key',
    'keys/client.p12',
    'keys/app.mobileprovision',
    'build.tsbuildinfo',
  ];
  assert.equal(hygieneIssues(files).length, files.length);
});

test('retains source, migrations, fixtures, public config, history and required generated JS', () => {
  assert.deepEqual(
    hygieneIssues([
      '.env.example',
      'google-services.json',
      'supabase/config.toml',
      'supabase/migrations/001_initial_schema.sql',
      'docs/drafts/rollback.sql',
      'docs/ANDROID_DIAGNOSTIC_BUILD_28_2026-10-04.md',
      'scripts/fixtures/result.json',
      'scripts/database/clean-room.mts',
      'scripts/verify-build-env.mjs',
      'vendor/decode-uri-component-compat/index.cjs',
      'website/browser-source.mts',
      'assets/icon-ios.png',
      'store-assets/google-play/icon-512.png',
      'modules/doji-test-environment/android/build.gradle',
    ]),
    [],
  );
});

test('reports deterministic deduplicated paths', () => {
  assert.deepEqual(hygieneIssues(['.env.local', '.env', '.env.local']), [
    '.env: only the reviewed root .env.example may be committed',
    '.env.local: only the reviewed root .env.example may be committed',
  ]);
});
