// Local-only regression; child deadlines prevent a regressed decoder hanging CI.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { record } from './database/contracts.mts';
const root = resolve(process.env.URI_TEST_ROOT || '.');
const fromRoot = createRequire(resolve(root, 'package.json'));
const queryPath = fromRoot.resolve('query-string');
const fromQuery = createRequire(queryPath);
const decoder: unknown = fromQuery('decode-uri-component');
function decode(input: unknown): unknown {
  assert.equal(typeof decoder, 'function');
  if (typeof decoder !== 'function') throw Error('Decoder export missing');
  return Reflect.apply(decoder, undefined, [input]);
}
const query = fromRoot('query-string') as typeof import('query-string');

test('actual query-string dependency resolves to the adapter and fixed upstream', () => {
  assert.match(
    fromQuery.resolve('decode-uri-component'),
    /vendor[\\/]decode-uri-component-compat[\\/]index.cjs$/,
  );
  const lock: unknown = JSON.parse(readFileSync(resolve(root, 'package-lock.json'), 'utf8'));
  assert.ok(record(lock) && record(lock.packages));
  const upstream = lock.packages['node_modules/decode-uri-component-upstream'];
  assert.ok(record(upstream));
  assert.equal(upstream.name, 'decode-uri-component');
  assert.equal(upstream.version, '0.5.0');
  assert.ok(typeof upstream.integrity === 'string' && upstream.integrity.startsWith('sha512-'));
  assert.ok(
    !Object.values(lock.packages).some(
      (p) =>
        record(p) &&
        p.version === '0.2.2' &&
        typeof p.resolved === 'string' &&
        p.resolved.includes('/decode-uri-component/'),
    ),
  );
});

const cases: [string, string][] = [
  ['', ''],
  ['hello+world', 'hello world'],
  ['%2B+%252B', '+ %2B'],
  ['%2F%3F%23', '/?#'],
  ['%F0%9F%98%80', '😀'],
  ['%E4%BD%A0%E5%A5%BD', '你好'],
  ['%C3%A5%ab', 'å%ab'],
  ['%', '%'],
  ['%G0', '%G0'],
  ['%C0%AF', '%C0%AF'],
  ['%ED%A0%80', '%ED%A0%80'],
  ['%F4%90%80%80', '%F4%90%80%80'],
  ['%F0%9F%98', '%F0%9F%98'],
  ['%C2', '�'],
  ['%FE%FF', '��'],
  ['%84%D7%25%88%90', '%84%D7%%88%90'],
  ['%252525', '%2525'],
];
for (const [input, expected] of cases)
  test(`decoder fixture ${JSON.stringify(input)}`, () => assert.equal(decode(input), expected));
for (const input of [null, undefined, 1, true, {}, []])
  test(`reject ${typeof input}:${String(input)}`, () =>
    assert.throws(() => decode(input), TypeError));

test('query parser retains repeats, null/empty, spaces, encoded delimiters and one-level decoding', () => {
  assert.deepEqual(
    {
      ...query.parse(
        'name=Gavin+Fahey&plus=%2B&x=1&x=2&empty=&flag&returnTo=%2Fprofile%3Fa%3D1%26b%3D2&encoded=%252F',
      ),
    },
    {
      name: 'Gavin Fahey',
      plus: '+',
      x: ['1', '2'],
      empty: '',
      flag: null,
      returnTo: '/profile?a=1&b=2',
      encoded: '%2F',
    },
  );
  assert.deepEqual(
    { ...query.parse('tag[]=one&tag[]=two', { arrayFormat: 'bracket' }) },
    { tag: ['one', 'two'] },
  );
  assert.equal(query.parse('bad=%C3%A5%ab').bad, 'å%ab');
  assert.equal(query.parse('x=%2B', { decode: false }).x, '%2B');
});

test('query-string URL and fragment parsing preserve navigation parameters', () => {
  const url = 'doji://member/test?tab=posts&label=%F0%9F%98%80#hello+world';
  const parsed = query.parseUrl(url, { parseFragmentIdentifier: true });
  assert.equal(parsed.url, 'doji://member/test');
  assert.deepEqual({ ...parsed.query }, { tab: 'posts', label: '😀' });
  assert.equal(parsed.fragmentIdentifier, 'hello world');
  const values = { target: '/profile?tab=posts', plus: '+', unicode: '😀', text: 'two words' };
  assert.deepEqual({ ...query.parse(query.stringify(values)) }, values);
});

test('malformed input terminates within a bounded child process via real query-string', () => {
  const child = spawnSync(
    process.execPath,
    [
      '-e',
      `
    const assert = require('node:assert/strict');
    const q = require(${JSON.stringify(queryPath)});
    for (const size of [32, 256, 4096, 32768]) {
      for (const token of ['%ab', '%E0%80%80', '%84%D7%25%88%90', '%F0%9F%98']) {
        const value = q.parse('value=' + token.repeat(size)).value;
        assert.equal(typeof value, 'string');
        assert.ok(value.length > 0);
      }
    }
  `,
    ],
    { timeout: 8000, encoding: 'utf8' },
  );
  assert.ifError(child.error);
  assert.equal(child.status, 0, child.stderr);
});

test('installed Expo Router fallback navigates using the patched parser', () => {
  const routerRoot = dirname(fromRoot.resolve('expo-router/package.json'));
  const { getStateFromPath } = fromRoot(
    resolve(routerRoot, 'build/react-navigation/core/getStateFromPath.js'),
  ) as typeof import('expo-router/build/react-navigation/core/getStateFromPath.js');
  const config = { screens: { Shop: 'shop', Member: 'member/:username' } };
  const shop = getStateFromPath('/shop?label=hello+world&plus=%2B&bad=%C3%A5%ab', config);
  const shopRoute = shop?.routes[0];
  assert.ok(shopRoute);
  assert.equal(shopRoute.name, 'Shop');
  assert.deepEqual({ ...shopRoute.params }, { label: 'hello world', plus: '+', bad: 'å%ab' });
  const member = getStateFromPath('/member/test?tab=posts', config);
  const memberRoute = member?.routes[0];
  assert.ok(memberRoute && record(memberRoute.params));
  assert.equal(memberRoute.name, 'Member');
  assert.equal(memberRoute.params.username, 'test');
  assert.equal(memberRoute.params.tab, 'posts');
});
