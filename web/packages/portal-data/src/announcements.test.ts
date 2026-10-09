import { describe, expect, it } from 'vitest';
import {
  announcementPage,
  announcementRecord,
  announcementPath,
  validAnnouncementPath,
} from './announcements';
import { assertEmployeeRead } from './employee-read-policy';
import { announcementFixture, announcementId } from '../../../tests/announcement-fixture';
describe('existing announcement reads', () => {
  it('permits only canonical bounded read paths', () => {
    const path = announcementPath('published', {
      at: '2026-10-08T12:00:00.123456Z',
      id: announcementId,
    });
    expect(validAnnouncementPath(path)).toBe(true);
    expect(() => assertEmployeeRead(path, false)).not.toThrow();
    for (const invalid of [
      path + '&limit=50',
      'https://admin.dojipro.com' + path,
      path.replace('published', 'deleted'),
      path.replace('beforeId=', 'unused='),
    ])
      expect(validAnnouncementPath(invalid)).toBe(false);
    expect(() => assertEmployeeRead(path, true)).toThrow();
    expect(() => assertEmployeeRead('/portal/admin/editorial-command', false)).toThrow();
  });
  it('projects list and detail fields without carrying private server data', () => {
    const item = announcementFixture();
    const page = announcementPage(
      { items: [item], can_write: true, next_cursor: null },
      'published',
      null,
    );
    expect(page.items[0]).not.toHaveProperty('body');
    expect(page.items[0]).not.toHaveProperty('private_field');
    expect(announcementRecord(item, announcementId).body).toBe(item.body);
    expect(announcementRecord(item, announcementId)).not.toHaveProperty('private_field');
    expect(() => announcementRecord(item, '10000000-0000-4000-8000-000000000001')).toThrow();
  });
  it('rejects duplicates, wrong filters, bad status, oversized pages and unproven next cursors', () => {
    const item = announcementFixture();
    const raw = { items: [item], can_write: true, next_cursor: null };
    expect(() => announcementPage(raw, 'draft', null)).toThrow();
    for (const change of [
      { items: [item, item] },
      { items: Array(26).fill(item) },
      { next_cursor: { at: item.created_at, id: item.id } },
      { items: [{ ...item, display_state: 'delivered' }] },
      { items: [{ ...item, managed: false }] },
    ])
      expect(() => announcementPage({ ...raw, ...change }, 'all', null)).toThrow();
  });
  it('preserves microsecond ordering, rejects repeated pages and validates next-page tails', () => {
    const item = announcementFixture();
    const items = Array.from({ length: 25 }, (_, i) => ({
      ...item,
      id: `20000000-0000-4000-8000-${String(100 - i).padStart(12, '0')}`,
    }));
    const tail = items.at(-1)!;
    const raw = { items, can_write: true, next_cursor: { at: tail.created_at, id: tail.id } };
    expect(announcementPage(raw, 'all', null).next).toEqual(raw.next_cursor);
    expect(() => announcementPage(raw, 'all', raw.next_cursor)).toThrow();
    expect(() => announcementPage({ ...raw, items: [...items].reverse() }, 'all', null)).toThrow();
    const first = { ...item, created_at: '2026-10-08T12:00:00.123455Z' };
    expect(
      announcementPage({ items: [first], can_write: false, next_cursor: null }, 'all', {
        at: item.created_at,
        id: item.id,
      }).items,
    ).toHaveLength(1);
  });
  it('rejects malformed body, times and display limits', () => {
    for (const change of [
      { body: null },
      { body: 'x'.repeat(601) },
      { starts_at: 'no' },
      { max_impressions_per_user: '2' },
      { min_hours_between_impressions: 0 },
      { cta_url: [] },
      { state: 'draft', display_state: 'live' },
    ])
      expect(() =>
        announcementRecord({ ...announcementFixture(), ...change }, announcementId),
      ).toThrow();
  });
});
