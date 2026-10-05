import test from 'node:test';
import assert from 'node:assert/strict';
import { functionHashes, jsonRecord, loadState, metricSamples } from './contracts.mts';

test('load evidence accepts only the exact local synthetic database target', () => {
  const valid = { db: 'heavy_load_qa_1234', container: 'supabase_db_employee-cutover-verify' };
  assert.deepEqual(loadState(JSON.stringify(valid)), valid);
  for (const patch of [
    { db: 'postgres' },
    { db: 'heavy_load_qa_1;drop' },
    { db: 123 },
    { container: 'production' },
    { container: null },
  ])
    assert.throws(() => loadState(JSON.stringify({ ...valid, ...patch })));
});

test('local JSON boundaries reject missing, array and primitive records', () => {
  for (const value of ['null', '[]', 'true', '123', '"text"', '{'])
    assert.throws(() => jsonRecord(value));
  assert.deepEqual(jsonRecord('{"passed":false}'), { passed: false });
});

test('function comparison retains nullable ACLs and rejects malformed hashes', () => {
  const rows = {
    'public.fn()': { hash: 'abc', acl: null },
    'public.other()': { hash: 'def', acl: '{}' },
  };
  assert.deepEqual(functionHashes(rows), rows);
  for (const value of [
    null,
    [],
    { bad: null },
    { bad: {} },
    { bad: { hash: 2, acl: null } },
    { bad: { hash: 'abc', acl: 2 } },
  ])
    assert.throws(() => functionHashes(value));
});

test('sampling errors cannot masquerade as measured temporary bytes or deadlocks', () => {
  const good = { temp_bytes: 1024, blocked: 0, deadlocks: 0 };
  assert.deepEqual(
    metricSamples(JSON.stringify([{ samplingError: 'test only' }, good, { temp_bytes: '2048' }])),
    [good],
  );
  for (const value of [
    null,
    {},
    [{ temp_bytes: 1, blocked: '0', deadlocks: 0 }],
    [{ temp_bytes: 1, blocked: 0 }],
  ])
    assert.throws(() => metricSamples(JSON.stringify(value)));
});
