import { describe, it, expect } from 'vitest';
import { monitorHistory } from './monitor-history';
const at = '2026-11-04T01:00:00Z';
const fixture = () => ({
  enabled: true,
  available: true,
  latest: [
    { monitor: 'worker', state: 'healthy', observed_at: at, family: null },
    { monitor: 'watchdog', state: null, observed_at: null, family: null },
  ],
  incidents: [
    {
      id: 1,
      monitor: 'worker',
      family: 'domain-outbox-delayed',
      opened_at: at,
      last_observed_at: at,
      ended_at: at,
      ended_reason: 'superseded',
    },
  ],
});
describe('bounded monitor incident projection', () => {
  it('retains source time and distinguishes missing, disabled, failed and empty', () => {
    expect(monitorHistory(undefined).status).toBe('disabled');
    expect(monitorHistory({ enabled: false }).status).toBe('disabled');
    expect(monitorHistory({ enabled: 'true' }).status).toBe('unavailable');
    expect(monitorHistory('invalid').status).toBe('unavailable');
    expect(monitorHistory({ enabled: true, available: false }).status).toBe('unavailable');
    expect(monitorHistory({ ...fixture(), incidents: [] }).status).toBe('ready');
    const result = monitorHistory(fixture());
    expect(result.latest[0]?.observed_at).toBe('2026-11-04T01:00:00.000Z');
    expect(result.incidents[0]?.ended_reason).toBe('superseded');
    expect(result.latest[1]?.observed_at).toBeNull();
  });
  it('rejects unbounded, duplicate, invalid and contradictory data', () => {
    for (const patch of [
      { latest: [] },
      { latest: Array(2).fill(fixture().latest[0]) },
      { latest: [{ ...fixture().latest[0], observed_at: 'bad' }, fixture().latest[1]] },
      { latest: [{ ...fixture().latest[0], state: 'degraded' }, fixture().latest[1]] },
      {
        latest: [{ ...fixture().latest[0], family: 'domain-outbox-delayed' }, fixture().latest[1]],
      },
      {
        latest: [fixture().latest[0], { ...fixture().latest[1], family: 'domain-outbox-delayed' }],
      },
      { incidents: Array(26).fill(fixture().incidents[0]) },
      { incidents: Array(2).fill(fixture().incidents[0]) },
      ...[
        { id: 0 },
        { family: 'private' },
        { monitor: 'arbitrary' },
        { opened_at: 'bad' },
        { last_observed_at: '2020-01-01' },
        { ended_at: null },
        { ended_reason: 'fixed' },
      ].map((row) => ({ incidents: [{ ...fixture().incidents[0], ...row }] })),
    ])
      expect(monitorHistory({ ...fixture(), ...patch }).status).toBe('unavailable');
  });
  it('projects only fixed fields and does not preserve raw errors or private data', () => {
    const input = fixture();
    const result = monitorHistory({
      ...input,
      secret: 'private',
      latest: input.latest.map((row) => ({ ...row, error: 'private' })),
      incidents: input.incidents.map((row) => ({ ...row, payload: 'private' })),
    });
    expect(JSON.stringify(result)).not.toMatch(/private|secret|payload|error/);
  });
});
