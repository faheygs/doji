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
test('missing, external, traversal and duplicate entries fail closed', () => {
  for (const html of [
    '',
    '<script src="https://example.test/admin-app-a.js"></script>',
    '<script src="/admin-portal/admin-app-../x.js"></script>',
    '<script src="/admin-portal/admin-app-a.js"></script>'.repeat(2),
  ]) {
    assert.throws(() => adminBundlePath(html));
  }
});
