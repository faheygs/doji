// Runtime assertions for tests: missing DOM/fixture values fail instead of being
// hidden behind non-null casts. These helpers do not run in the shipped portal.
import assert from 'node:assert/strict';
export function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined, 'Expected test value to be present');
  return value;
}
export function record(value: unknown): Record<string, unknown> {
  const isRecord = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item);
  assert.ok(isRecord(value));
  return value;
}
