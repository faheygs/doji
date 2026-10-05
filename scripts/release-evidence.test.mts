import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evidenceRecord,
  evidenceRows,
  evidenceStrings,
  firstEvidence,
  releaseBaseline,
  evidenceArray,
  evidenceAssets,
} from './release-evidence.mts';

test('historical evidence parsing rejects absent and malformed contracts', () => {
  for (const value of [null, undefined, [], 1, 'text']) assert.throws(() => evidenceRecord(value));
  for (const value of [{}, { rows: null }, { rows: {} }, { rows: [null] }])
    assert.throws(() => evidenceRows(value));
  for (const value of [{ rows: [] }, { rows: [{}] }, { rows: [{ baseline: [] }] }])
    assert.throws(() => firstEvidence(value, 'baseline'));
  for (const value of [null, {}, [1], ['valid', null]]) assert.throws(() => evidenceStrings(value));
  for (const value of [{}, { functions: [] }, { functions: { missing: null } }])
    assert.throws(() => releaseBaseline(value));
});

test('validated evidence preserves exact historical data and does not mutate the input', () => {
  const value = {
    functions: { 'example()': { hash: 'exact-hash', grants: ['member'] } },
    policies: [{ name: 'unchanged' }],
    active: 0,
  };
  const previous = structuredClone(value);
  assert.deepEqual(firstEvidence({ rows: [{ baseline: value }] }, 'baseline'), value);
  assert.deepEqual(releaseBaseline(value), value);
  assert.deepEqual(value, previous);
  assert.deepEqual(evidenceStrings(['first', 'second']), ['first', 'second']);
  assert.deepEqual(evidenceRows({ rows: [] }), []);
});

test('asset and evidence arrays reject malformed entries without inventing evidence', () => {
  for (const value of [undefined, {}, [null], [1]]) assert.throws(() => evidenceArray(value));
  for (const value of [undefined, {}, [null], [{}], [{path: 4, sha256: 'x'}], [{path:'x',sha256:null}]]) assert.throws(() => evidenceAssets(value));
  const assets = [{path:'exact.js',sha256:'unchanged',extra:'not a manifest field'}];
  assert.deepEqual(evidenceAssets(assets),[{path:'exact.js',sha256:'unchanged'}]);
  assert.deepEqual(evidenceArray([{status:'verified'}]),[{status:'verified'}]);
  assert.deepEqual(evidenceAssets([]),[]);
});
