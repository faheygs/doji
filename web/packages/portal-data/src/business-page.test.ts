import { describe, expect, it } from 'vitest';
import { businessPage, readBusinessPage } from './business-page';
import { assertEmployeeRead } from './employee-read-policy';
import { createEmployeeSession } from './employee-session';
const row = {
  id: '10000000-0000-4000-8000-000000000001',
  state: 'approved',
  revision: 2,
  brand_name: 'Synthetic business',
  updated_at: '2026-10-09T10:00:00.123456Z',
};
describe('business queue status reads', () => {
  it('checks status, bounded size, chronological order and cursor provenance', () => {
    const raw = { items: [row], next_cursor: null };
    expect(businessPage(raw, 'approved', null, 5).items[0]?.name).toBe(row.brand_name);
    expect(() => businessPage(raw, 'declined', null)).toThrow();
    expect(() => businessPage({ ...raw, items: [row, row] }, 'approved', null)).toThrow();
    expect(() => businessPage(raw, 'approved', { at: row.updated_at, id: row.id })).toThrow();
    expect(() =>
      businessPage(
        { ...raw, next_cursor: { at: row.updated_at, id: row.id } },
        'approved',
        null,
        5,
      ),
    ).toThrow();
    expect(() => assertEmployeeRead('/business/page', true)).not.toThrow();
    expect(() => assertEmployeeRead('/business/page', false)).toThrow();
  });
  it('dispatches the existing authorized read and denies permission loss before any request', async () => {
    const calls: unknown[] = [];
    let allowed = true;
    const client = createEmployeeSession(
      {
        independentEmployeeIdentity: true,
        staffWorkflowEnabled: true,
        businessApplicationsEnabled: true,
      },
      {
        origin: 'https://admin.dojipro.com',
        upstream: async (url, init) => {
          if (url.endsWith('/api/session'))
            return Response.json({
              signedIn: true,
              assurance: 'aal2',
              csrf: 'c'.repeat(43),
              operator: { user_id: row.id, capabilities: { business_read: allowed } },
            });
          calls.push(JSON.parse(String(init?.body)));
          return Response.json({ items: [row], next_cursor: null });
        },
      },
    );
    await client.restore();
    await readBusinessPage(client, 'approved', null, new AbortController().signal, 5);
    expect(calls).toEqual([
      {
        name: 'get_admin_business_applications_page_v1',
        args: { p_state: 'approved', p_limit: 5, p_after_at: null, p_after_id: null },
      },
    ]);
    allowed = false;
    await client.restore();
    await expect(
      readBusinessPage(client, 'approved', null, new AbortController().signal),
    ).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });
});
