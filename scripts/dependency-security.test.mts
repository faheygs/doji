// Exercise quoting only: never execute fixture strings in a shell.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const devtoolsRequire = createRequire(require.resolve('react-devtools-core'));
const quote = devtoolsRequire('shell-quote') as {
  quote(args: (string | { comment: string })[]): string;
  parse(source: string): unknown[];
};

test('actual devtools dependency rejects line breaks after a comment token', () => {
  for (const newline of ['\n', '\r', '\u2028', '\u2029']) {
    assert.throws(() => quote.quote(['echo', { comment: 'fixture' }, `first${newline}second`]), TypeError);
  }
});

test('patched quoting preserves normal arguments without executing them', () => {
  const args = ['echo', 'two words', "single'quote", 'double"quote', '$literal', 'a;b', '', '日本語'];
  assert.deepEqual(quote.parse(quote.quote(args)), args);
});

test('archived test artifacts are ignored on both host path formats', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
    jest: { testPathIgnorePatterns: string[]; modulePathIgnorePatterns: string[] };
  };
  for (const patterns of [pkg.jest.testPathIgnorePatterns, pkg.jest.modulePathIgnorePatterns]) {
    const ignored = (path: string) => patterns.some(pattern => new RegExp(pattern).test(path));
    assert.equal(ignored('C:\\repo\\test-results\\archive\\test.ts'), true);
    assert.equal(ignored('/repo/test-results/archive/test.ts'), true);
    assert.equal(ignored('/repo/website/test-results/test.ts'), true);
    assert.equal(ignored('/repo/__tests__/lib/test.ts'), false);
    assert.equal(ignored('C:\\repo\\__tests__\\lib\\test.ts'), false);
  }
});
