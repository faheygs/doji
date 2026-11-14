import { describe, expect, it } from 'vitest';
import { healthSnapshot } from './employee-health';
const row = {
  platform: 'android',
  phase: 'feed_read',
  outcome: 'request_failed',
  count: 3,
  capped: true,
  received_at: '2026-11-04T23:10:00Z',
};
const source = {
  source: 'device_reported',
  enabled: true,
  checked_at: '2026-11-04T23:30:00Z',
  rows: [row],
};
const read = (value: unknown) =>
  healthSnapshot({ operational: {}, sentry: {}, mobile_workflows: value }).mobile_workflows;
describe('device workflow projection', () => {
  it('keeps only bounded counts and receipt times, not identities or arbitrary fields', () => {
    const result = read({ ...source, key: 'private', rows: [{ ...row, actor: 'private' }] });
    expect(result.status).toBe('ready');
    expect(result.rows[0]).toEqual(row);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('distinguishes absent, malformed, disabled and empty', () => {
    for (const value of [
      undefined,
      {},
      { ...source, rows: [row, row] },
      { ...source, rows: [{ ...row, outcome: ['request_failed'] }] },
      { ...source, rows: [{ ...row, count: 24000000001 }] },
    ])
      expect(read(value).status).toBe('unavailable');
    expect(read({ ...source, enabled: false })).toEqual({
      status: 'disabled',
      checked_at: null,
      rows: [],
    });
    expect(read({ ...source, rows: [] }).status).toBe('ready');
  });
});
