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
    'web/apps/admin/dist/index.html',
    'web/apps/business/dist/assets/index.js',
    'web/apps/site/.next/build-manifest.json',
    'web/apps/site/out/index.html',
    'web/apps/site/generated/privacy.html',
    'web/apps/site/public/legacy-safety/form.js',
    'web/apps/site/public/safety-removal/config.js',
    'web/apps/site/next-env.d.ts',
    'web/playwright-report/index.html',
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
      'supabase/overlays/rollback.sql',
      'docs/releases/ANDROID_DIAGNOSTICS.md',
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

test('keeps implementation drafts and dated diaries out of the current handbook', () => {
  for (const file of [
    'docs/drafts/feature.sql',
    'docs/change.sql',
    'docs/NOTE_2026-10-13.md',
    'infra/portal-identity-candidate/runtime.mts',
    'infra/business-email-candidate/sender.mts',
  ]) assert.equal(hygieneIssues([file]).length, 1);
  assert.deepEqual(hygieneIssues([
    'supabase/overlays/feature.sql',
    'docs/releases/NOTE_2026-10-13.md',
    'docs/legal/BUSINESS_TERMS_REVIEW.md',
    'infra/portal-identity/runtime.mts',
    'infra/business-email/sender.mts',
  ]), []);
});

test('rejects scratch output without rejecting maintained mock and fixture contracts', () => {
  for (const file of ['build.log', 'draft.tmp', 'old.bak', 'cache.temp', 'runner/.last-run.json'])
    assert.equal(hygieneIssues([file]).length, 1);
  assert.deepEqual(
    hygieneIssues([
      '__mocks__/expo-image.tsx',
      'scripts/fixtures/synthetic.json',
      'web/tests/browser/business-fixture.ts',
      'web/apps/site/prepare-assets.mts',
      'web/apps/site/app/sitemap.ts',
    ]),
    [],
  );
});
