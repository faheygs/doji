import test from 'node:test';
import assert from 'node:assert/strict';
import { assessMigration, uncheckedModules } from './typescript-migration.mts';

test('migration guard accepts the exact legacy inventory and TypeScript additions', () => {
  assert.deepEqual(
    assessMigration(
      ['a.js', 'b.mjs', 'c.cjs', 'd.jsx', 'new.mts', 'new.ts'],
      ['a.js', 'b.mjs', 'c.cjs', 'd.jsx'],
    ),
    { remaining: 4, added: [], stale: [], duplicates: false },
  );
});
test('migration guard rejects new JavaScript rather than silently expanding scope', () => {
  assert.deepEqual(assessMigration(['a.js', 'new.js'], ['a.js']).added, ['new.js']);
});
test('conversion must remove the stale inventory entry', () => {
  assert.deepEqual(assessMigration(['a.mts'], ['a.mjs']).stale, ['a.mjs']);
});
test('duplicate baseline entries are rejected; git overlap is counted once', () => {
  assert.equal(assessMigration(['a.js', 'a.js'], ['a.js', 'a.js']).duplicates, true);
  assert.equal(assessMigration(['a.js', 'a.js'], ['a.js']).remaining, 1);
});

test('renaming a module without adding it to strict checking is rejected', () => {
  assert.deepEqual(uncheckedModules(['a.mts', 'b.cts', 'old.js', 'types.d.mts'], ['a.mts']), [
    'b.cts',
  ]);
  assert.deepEqual(uncheckedModules(['a.mts', 'a.mts', 'b.cts'], ['a.mts', 'b.cts']), []);
});
