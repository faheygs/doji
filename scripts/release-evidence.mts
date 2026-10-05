// Structural validation for historical release evidence. These helpers perform
// no I/O and never authorize a deployment or turn missing data into a pass.
import assert from 'node:assert/strict';
export function evidenceRecord(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Expected release evidence object',
  );
  return value as Record<string, unknown>;
}
export function evidenceArray(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value), 'Expected release evidence array');
  return value.map(evidenceRecord);
}
export function evidenceAt(value: unknown, ...path: string[]): Record<string, unknown> {
  let result = evidenceRecord(value);
  for (const key of path) result = evidenceRecord(result[key]);
  return result;
}
export function evidenceNumber(value: unknown): number {
  assert.ok(typeof value === 'number' && Number.isFinite(value), 'Expected finite release evidence number');
  return value;
}
export function evidenceText(value: unknown): string {
  assert.ok(typeof value === 'string', 'Expected release evidence string');
  return value;
}
export function evidenceRows(value: unknown): Record<string, unknown>[] {
  const rows = evidenceRecord(value).rows;
  assert.ok(Array.isArray(rows), 'Expected release query rows');
  return rows.map(evidenceRecord);
}
export function firstEvidence(value: unknown, key: string): Record<string, unknown> {
  const row = evidenceRows(value)[0];
  assert.ok(row, 'Missing release evidence row');
  return evidenceRecord(row[key]);
}
export interface ReleaseBaseline extends Record<string, unknown> {
  functions: Record<string, Record<string, unknown>>;
}
export function releaseBaseline(value: unknown): ReleaseBaseline {
  const baseline = evidenceRecord(value);
  const functions = Object.fromEntries(
    Object.entries(evidenceRecord(baseline.functions)).map(([name, definition]) => [
      name,
      evidenceRecord(definition),
    ]),
  );
  return { ...baseline, functions };
}
export function evidenceStrings(value: unknown): string[] {
  assert.ok(
    Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string'),
    'Expected release evidence names',
  );
  return value;
}
export interface PagesReleaseProject {
  name: string;
  domains: string[];
  production_branch: string;
  canonical_deployment: {
    id: string;
    url: string;
    latest_stage: { status: string };
    uses_functions: boolean;
    is_skipped?: boolean;
  } | null;
}
export interface PagesReleaseDomain {
  name: string;
  status: string;
}
export function evidenceAssets(value: unknown): {path: string;sha256: string}[] {
  assert.ok(Array.isArray(value), 'Expected release asset manifest');
  return value.map(entry=>{const asset=evidenceRecord(entry);assert.ok(typeof asset.path==='string' && typeof asset.sha256==='string', 'Invalid release asset');return {path:asset.path,sha256:asset.sha256};});
}
