import { describe, it, expect } from 'vitest';
import { personalPage, readPersonalWork } from './personal-work';
import { createEmployeeSession } from './employee-session';
const owner = '10000000-0000-4000-8000-000000000001';
const row = {
  kind: 'report',
  id: '20000000-0000-4000-8000-000000000001',
  key: 'report:20000000-0000-4000-8000-000000000001',
  at: '2026-10-09T12:00:00.000001Z',
  assigned_to: owner,
  subject: 'Closed synthetic report',
  work_state: 'closed',
  due_at: null,
  ownership_model: 'existing_report',
};
const page = {
  scope: 'personal_work_v1',
  filter: 'completed',
  order: 'oldest_first',
  authorized_queues: ['report'],
  items: [row],
  next_cursor: null,
};
describe('personal history', () => {
  it('validates scope, ownership, state, SLA, ordering and cursor bounds', () => {
    expect(personalPage(page, 'completed', owner, null, 5).items).toHaveLength(1);
    for (const patch of [
      { assigned_to: null },
      { work_state: 'ready' },
      { due_at: '2026-10-01' },
      { kind: 'business_privacy' },
      { key: 'forged' },
    ])
      expect(() =>
        personalPage({ ...page, items: [{ ...row, ...patch }] }, 'completed', owner, null, 5),
      ).toThrow();
    expect(() =>
      personalPage({ ...page, items: [row, row] }, 'completed', owner, null, 5),
    ).toThrow();
    expect(() => personalPage(page, 'completed', owner, { at: row.at, key: row.key }, 5)).toThrow();
    expect(() =>
      personalPage(
        { ...page, next_cursor: { at: row.at, key: row.key } },
        'completed',
        owner,
        null,
        5,
      ),
    ).toThrow();
    expect(() => personalPage({ ...page, filter: 'all' }, 'completed', owner, null, 5)).toThrow();
    expect(() =>
      personalPage({ ...page, scope: 'staff_inbox_v1' }, 'completed', owner, null, 5),
    ).toThrow();
  });
  it('sends no caller-selected assignee and keeps reads gated', async () => {
    for (const enabled of [false, true]) {
      const calls: Record<string, unknown>[] = [];
      const controller = createEmployeeSession(
        {
          independentEmployeeIdentity: true,
          staffWorkflowEnabled: true,
          historyReadsEnabled: enabled,
        },
        {
          origin: 'https://admin.dojipro.com',
          upstream: async (url, init) => {
            if (url.endsWith('/api/session'))
              return Response.json({
                signedIn: true,
                assurance: 'aal2',
                csrf: 'c'.repeat(43),
                operator: { user_id: owner, capabilities: { moderation_read: true } },
              });
            if (url.endsWith('/auth/logout')) return Response.json({ signedIn: false });
            calls.push(JSON.parse(String(init?.body)));
            return Response.json(page);
          },
        },
      );
      await controller.restore();
      if (enabled) {
        await readPersonalWork(controller, 'completed', null, new AbortController().signal, 5);
        expect(calls).toEqual([
          {
            name: 'get_admin_personal_work_page_v1',
            args: {
              p_kind: 'all',
              p_state: 'completed',
              p_limit: 5,
              p_after_at: null,
              p_after_key: null,
            },
          },
        ]);
      } else
        expect(() =>
          readPersonalWork(controller, 'completed', null, new AbortController().signal, 5),
        ).toThrow('unavailable');
      await controller.signOut();
    }
  });
});
