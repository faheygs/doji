import test from 'node:test';
import assert from 'node:assert/strict';
import { adminBundlePath } from './admin-bundle-path.mts';

test('coverage follows the generated HTML entry across release names', () => {
  for (const version of ['20260925ap', '20261002d', 'future-release']) {
    assert.equal(
      adminBundlePath(`<script src="/admin-portal/admin-app-${version}.js" defer></script>`),
      `admin-portal/admin-app-${version}.js`,
    );
  }
});
test('coverage reads the local file behind the generated cache version', () => {
  for (const quote of ['"', "'"]) {
    assert.equal(
      adminBundlePath(`<script defer src=${quote}/admin-portal/admin-app-release.js?v=0123456789abcdef${quote}></script>`),
      'admin-portal/admin-app-release.js',
    );
  }
});
test('missing, external, traversal and duplicate entries fail closed', () => {
  for (const html of [
    '',
    '<script src="https://example.test/admin-app-a.js"></script>',
    '<script src="/admin-portal/admin-app-../x.js"></script>',
    '<script src="/admin-portal/admin-app-a.js"></script>'.repeat(2),
    '<script src="/admin-portal/admin-app-a.js?v=0123456789abcdef"></script>'.repeat(2),
    '<script src="/admin-portal/admin-app-a.js?v=../secret"></script>',
    '<script src="/admin-portal/admin-app-a.js?v=0123456789abcdef&file=other"></script>',
    '<script src="/admin-portal/admin-app-a.js#fragment"></script>',
  ]) {
    assert.throws(() => adminBundlePath(html));
  }
});
