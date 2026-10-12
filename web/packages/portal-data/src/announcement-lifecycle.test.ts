import { it, expect } from 'vitest';
import { lifecyclePage } from './announcements';
const item = {
  id: '20000000-0000-4000-8000-000000000001',
  title: 'Synthetic',
  created_at: '2026-10-09T12:00:00Z',
  starts_at: '2026-10-09T12:00:00Z',
  ends_at: null,
  state: 'legacy',
  managed: false,
  display_state: 'live',
};
const page = {
  scope: 'announcement_lifecycle_v1',
  filter: 'active',
  items: [item],
  next_cursor: null,
  can_write: false,
};
it('active history validates server lifecycle and supports legacy no-end windows', () => {
  expect(lifecyclePage(page, 'active', null, 5).items[0]?.ends).toBeNull();
  expect(() =>
    lifecyclePage({ ...page, items: [{ ...item, display_state: 'expired' }] }, 'active', null, 5),
  ).toThrow();
  expect(() => lifecyclePage({ ...page, filter: 'all' }, 'active', null, 5)).toThrow();
  expect(() => lifecyclePage({ ...page, scope: 'other' }, 'active', null, 5)).toThrow();
  expect(
    lifecyclePage(
      {
        ...page,
        filter: 'expired',
        items: [{ ...item, display_state: 'expired', ends_at: '2026-10-10T12:00:00Z' }],
      },
      'expired',
      null,
      5,
    ).items,
  ).toHaveLength(1);
});
