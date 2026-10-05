// Local synthetic benchmark evidence only; no service credentials or live URLs.
import assert from 'node:assert/strict';
import { record } from '../database/contracts.mts';

export interface TimingStats {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}
export interface BenchmarkRun {
  label: string;
  clients: number;
  seconds: number;
  rate: number | null;
  weights: Record<string, number>;
  exitCode: number | null;
  aborted: boolean;
  sqlTimeouts: number;
  wallMs: number;
  completed: TimingStats;
  skipped: number;
  failed: number;
  perScript: Record<string, TimingStats>;
}

export function jsonRecord(source: string) {
  const value: unknown = JSON.parse(source);
  assert.ok(record(value), 'Expected a local JSON evidence object');
  return value;
}
export function loadState(source: string) {
  const value = jsonRecord(source);
  assert.ok(typeof value.db === 'string' && /^heavy_load_qa_[0-9]+$/.test(value.db));
  assert.equal(value.container, 'supabase_db_employee-cutover-verify');
  return { ...value, db: value.db, container: 'supabase_db_employee-cutover-verify' };
}
export function functionHashes(value: unknown) {
  assert.ok(record(value), 'Expected a function hash map');
  return Object.fromEntries(
    Object.entries(value).map(([key, row]) => {
      assert.ok(
        record(row) &&
          typeof row.hash === 'string' &&
          (row.acl === null || typeof row.acl === 'string'),
      );
      return [key, { hash: row.hash, acl: row.acl }];
    }),
  );
}
export function metricSamples(source: string) {
  const value: unknown = JSON.parse(source);
  assert.ok(Array.isArray(value), 'Expected metric samples');
  return value.flatMap((row: unknown) => {
    // Sampling failures remain in evidence, but cannot become numeric samples.
    if (!record(row) || typeof row.temp_bytes !== 'number' || !Number.isFinite(row.temp_bytes))
      return [];
    assert.ok(typeof row.blocked === 'number' && Number.isFinite(row.blocked));
    assert.ok(typeof row.deadlocks === 'number' && Number.isFinite(row.deadlocks));
    return [{ temp_bytes: row.temp_bytes, blocked: row.blocked, deadlocks: row.deadlocks }];
  });
}
