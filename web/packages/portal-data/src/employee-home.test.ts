import { describe, expect, it, vi } from 'vitest';
import { homeEvent, homeEventStage, readHomeEvent } from './employee-home';
import { assertEmployeeRead } from './employee-read-policy';
import { createEmployeeSession } from './employee-session';
const now = '2026-10-09T12:00:00Z';
const event = {
  id: '10000000-0000-4000-8000-000000000001',
  title: '<b>Daily Doji</b>',
  fires_at: '2026-10-09T13:00:00Z',
  prelive_at: null,
  activated_at: null,
  closes_at: null,
};
describe('portal home event projection', () => {
  it('discards all unrelated legacy snapshot data and preserves text, not markup', () => {
    const result = homeEvent({
      generated_at: now,
      next_event: event,
      work_items: ['private'],
      platform: { raw: 'secret' },
    });
    expect(result.event?.title).toBe('<b>Daily Doji</b>');
    expect(JSON.stringify(result)).not.toMatch(/private|secret|work_items/);
    expect(homeEventStage(result)).toBe('Upcoming');
  });
  it('does not infer activation from the scheduled time', () => {
    expect(
      homeEventStage(
        homeEvent({
          generated_at: now,
          next_event: { ...event, fires_at: '2026-10-09T11:59:00Z' },
        }),
      ),
    ).toBe('Awaiting activation');
    expect(
      homeEventStage(
        homeEvent({
          generated_at: now,
          next_event: { ...event, prelive_at: '2026-10-09T11:59:00Z' },
        }),
      ),
    ).toBe('Pre-live');
    expect(
      homeEventStage(
        homeEvent({
          generated_at: now,
          next_event: {
            ...event,
            activated_at: '2026-10-09T11:59:00Z',
            closes_at: '2026-10-09T12:09:00Z',
          },
        }),
      ),
    ).toBe('Activated');
    expect(
      homeEventStage(
        homeEvent({
          generated_at: now,
          next_event: {
            ...event,
            activated_at: '2026-10-09T11:00:00Z',
            closes_at: '2026-10-09T11:10:00Z',
          },
        }),
      ),
    ).toBe('Window ended');
  });
  it('distinguishes an empty snapshot from malformed or unavailable data', () => {
    expect(homeEvent({ generated_at: now, next_event: null }).event).toBeNull();
    for (const bad of [
      {},
      { generated_at: now },
      { generated_at: now, next_event: { ...event, fires_at: 'invalid' } },
    ])
      expect(() => homeEvent(bad)).toThrow();
  });
  it('allows only the exact bounded read', () => {
    expect(() => assertEmployeeRead('/portal/admin/command-center?limit=1', false)).not.toThrow();
    expect(() => assertEmployeeRead('/portal/admin/command-center?limit=100', false)).toThrow();
    expect(() => assertEmployeeRead('/portal/admin/command-center?limit=1', true)).toThrow();
  });
  it('denies an unauthorized employee before making any event read', async () => {
    const upstream = vi.fn(async () =>
      Response.json({
        signedIn: true,
        assurance: 'aal2',
        csrf: 'c'.repeat(43),
        operator: {
          user_id: event.id,
          display_name: 'Business reviewer',
          capabilities: { business_read: true },
        },
      }),
    );
    const controller = createEmployeeSession(
      { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
      { origin: 'https://admin.dojipro.com', upstream },
    );
    await controller.restore();
    await expect(readHomeEvent(controller, new AbortController().signal)).rejects.toThrow();
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
