import { describe, expect, it, vi } from 'vitest';
import {
  healthHistory,
  healthSnapshot,
  readEmployeeHealth,
  readEmployeeHealthHistory,
} from './employee-health';
import { createEmployeeSession } from './employee-session';
import { evaluate } from '../../../../website/admin-portal/health-model.mts';
import { healthFixture, historyFixture } from '../../../tests/health-fixture';

describe('employee Operations reads', () => {
  it('projects bounded fields and keeps absent, negative and malformed metrics unknown', () => {
    const raw = healthFixture();
    const parsed = healthSnapshot({
      ...raw,
      secret: 'not retained',
      operational: {
        ...raw.operational,
        realtime_p95_ms_5m: '0',
        outbox_overdue: -1,
        push_stale_shards: undefined,
        member: 'not retained',
      },
    });
    expect(parsed.operational.realtime_p95_ms_5m).toBeNull();
    expect(parsed.operational.outbox_overdue).toBeNull();
    expect(parsed.operational.push_stale_shards).toBeNull();
    expect(JSON.stringify(parsed)).not.toContain('not retained');
    expect(() => healthSnapshot({})).toThrow();
  });
  it('rejects excess or invalid history and projects incomplete summaries without zero defaults', () => {
    const { items } = historyFixture();
    expect(() => healthHistory({ items: Array(13).fill(items[0]) })).toThrow();
    expect(() => healthHistory({ items: [items[0], items[0]] })).toThrow();
    expect(() => healthHistory({ items: [{ daily_event_id: 'invalid' }] })).toThrow();
    const row = healthHistory({ items: [{ daily_event_id: items[0]!.daily_event_id }] })[0]!;
    expect(row.realtime_p95_ms).toBeNull();
    expect(row.finalized_at).toBeNull();
  });
  it('does not treat missing or malformed Sentry coverage as zero errors', () => {
    const raw = healthFixture();
    for (const sentry of [
      { ...raw.sentry, issues: null },
      { ...raw.sentry, observed_at: null },
      { ...raw.sentry, available: false },
    ]) {
      const parsed = healthSnapshot({ ...raw, sentry });
      expect(parsed.sentry.available).toBe(false);
      expect(
        evaluate({ ...parsed, generatedAt: parsed.generated_at ?? '' }).signals.find((s) =>
          s.name.startsWith('App errors'),
        )?.state,
      ).toBe('unknown');
    }
    expect(() =>
      healthSnapshot({ ...raw, sentry: { ...raw.sentry, issues: Array(26).fill({}) } }),
    ).toThrow();
  });
  it('allows only HTTPS Sentry issue destinations without credentials or query data', () => {
    const raw = healthFixture();
    for (const permalink of [
      'javascript:alert(1)',
      'https://sentry.io.evil.test/issues/1/',
      'https://user:pass@sentry.io/issues/1/',
      'https://sentry.io:444/issues/1/',
      'https://sentry.io/api/0/',
    ]) {
      expect(
        healthSnapshot({ ...raw, sentry: { ...raw.sentry, issues: [{ permalink }] } }).sentry
          .issues[0]!.permalink,
      ).toBeNull();
    }
    expect(
      healthSnapshot({
        ...raw,
        sentry: {
          ...raw.sentry,
          issues: [{ permalink: 'https://doji-i0.sentry.io/issues/123/?token=strip' }],
        },
      }).sentry.issues[0]!.permalink,
    ).toBe('https://doji-i0.sentry.io/issues/123/');
  });
  it('retains existing Watch and unknown classifications rather than claiming an outage or all clear', () => {
    const now = Date.now();
    const data = healthSnapshot(healthFixture(now));
    const history = healthHistory(historyFixture(now));
    expect(evaluate({ ...data, history, now }).state).toBe('watch');
    expect(evaluate({ ...data, history, now: now + 180001 }).state).toBe('unknown');
    expect(
      evaluate({ ...data, sentry: { ...data.sentry, issues: [] }, history: [], now }).state,
    ).toBe('unknown');
  });
  it('uses only the existing health read and 12-summary RPC, and denies before dispatch', async () => {
    const calls: { name: string; args: Record<string, unknown> }[] = [];
    let allowed = true;
    const controller = createEmployeeSession(
      { independentEmployeeIdentity: true },
      {
        origin: 'https://admin.dojipro.com',
        upstream: vi.fn(async (url, init) => {
          if (String(url).endsWith('/api/session'))
            return Response.json({
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: {
                user_id: '10000000-0000-4000-8000-000000000001',
                capabilities: { operations_read: allowed },
              },
            });
          const body = JSON.parse(String(init?.body));
          calls.push(body);
          return Response.json(
            body.name === 'portal_platform_health_v1' ? healthFixture() : historyFixture(),
          );
        }),
      },
    );
    const signal = new AbortController().signal;
    await controller.restore();
    await readEmployeeHealth(controller, signal);
    await readEmployeeHealthHistory(controller, signal);
    expect(calls).toEqual([
      { name: 'portal_platform_health_v1', args: {} },
      { name: 'get_admin_event_health_history_v1', args: { p_limit: 12 } },
    ]);
    allowed = false;
    await controller.restore();
    await expect(readEmployeeHealth(controller, signal)).rejects.toThrow('permission');
    await expect(readEmployeeHealthHistory(controller, signal)).rejects.toThrow('permission');
    expect(calls).toHaveLength(2);
  });
});
