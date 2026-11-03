import { describe, expect, it } from 'vitest';
import { healthSummary, healthSummaryLabel } from './employee-health-summary';
const at = Date.parse('2026-11-03T12:00:00Z');
const fixture = () => ({
  enabled: true,
  available: true,
  observed_at: new Date(at).toISOString(),
  stale: false,
  operational: { available: true, healthy: true },
  workflows: { available: true, enabled: true },
});
describe('bounded cached health summary', () => {
  it('preserves timestamps and discards unknown details; never claims full platform health', () => {
    const parsed = healthSummary({ ...fixture(), secret: 'discard' });
    expect(JSON.stringify(parsed)).not.toContain('discard');
    expect(healthSummaryLabel(parsed, false, true, at)).toBe('Health: limited coverage');
    expect(
      healthSummaryLabel(
        healthSummary({ ...fixture(), operational: { available: true, healthy: false } }),
        false,
        true,
        at,
      ),
    ).toBe('Health: attention needed');
  });
  it('keeps stopped, future, absent, failed and offline readings distinct', () => {
    expect(healthSummaryLabel(healthSummary(fixture()), false, true, at + 180001)).toBe(
      'Health: outdated',
    );
    expect(healthSummaryLabel(healthSummary(fixture()), false, true, at - 30001)).toBe(
      'Health: outdated',
    );
    expect(healthSummaryLabel(healthSummary({ ...fixture(), stale: true }), false, true, at)).toBe(
      'Health: outdated',
    );
    expect(
      healthSummaryLabel(healthSummary({ enabled: true, available: false }), false, true, at),
    ).toBe('Health: unavailable');
    expect(
      healthSummaryLabel(healthSummary({ ...fixture(), operational: {} }), false, true, at),
    ).toBe('Health: unavailable');
    expect(healthSummaryLabel(healthSummary(fixture()), true, true, at)).toBe(
      'Health: unavailable',
    );
    expect(healthSummaryLabel(healthSummary(fixture()), false, false, at)).toBe('Health: offline');
    expect(healthSummaryLabel(undefined, false, true, at)).toBe('Health: checking');
    expect(healthSummaryLabel(healthSummary({ enabled: false }), false, true, at)).toBeNull();
  });
  it('rejects malformed responses rather than manufacturing a healthy observation', () => {
    for (const value of [
      null,
      {},
      { enabled: 'true' },
      { enabled: true },
      { ...fixture(), observed_at: 'invalid' },
      { ...fixture(), stale: null },
      { ...fixture(), operational: [] },
      { ...fixture(), workflows: null },
    ])
      expect(() => healthSummary(value)).toThrow();
  });
});
