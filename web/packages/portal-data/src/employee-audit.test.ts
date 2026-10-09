import { describe, expect, it } from 'vitest';
import { auditPage, auditPath, validAuditPath } from './employee-audit';
import { assertEmployeeRead } from './employee-read-policy';
import { auditFixture } from '../../../tests/audit-fixture';
describe('bounded audit reads', () => {
  it('requires exact canonical read parameters and paired cursors', () => {
    const path = auditPath('activity', 'Some action', null);
    expect(validAuditPath(path)).toBe(true);
    expect(() => assertEmployeeRead(path, false)).not.toThrow();
    for (const invalid of [
      path + '&actor=other',
      path.replace('limit=25', 'limit=100'),
      path + '&beforeId=foo',
      '/portal/admin/audit-export',
    ]) {
      expect(validAuditPath(invalid)).toBe(false);
      expect(() => assertEmployeeRead(invalid, false)).toThrow();
    }
    expect(() => auditPath('all', 'x'.repeat(161), null)).toThrow();
  });
  it('validates scope, bounded rows, descending order and exact tail cursors', () => {
    const value = auditFixture();
    expect(auditPage(value, 'activity', '', null).items).toHaveLength(25);
    expect(() => auditPage({ ...value, filter: 'all' }, 'activity', '', null)).toThrow();
    expect(() =>
      auditPage({ ...value, items: [...value.items, value.items[0]] }, 'activity', '', null),
    ).toThrow();
    expect(() =>
      auditPage({ ...value, items: [...value.items].reverse() }, 'activity', '', null),
    ).toThrow();
    expect(() =>
      auditPage(
        { ...value, next_cursor: { ...value.next_cursor, id: value.items[0]!.id } },
        'activity',
        '',
        null,
      ),
    ).toThrow();
    expect(() => auditPage(value, 'activity', '', value.next_cursor)).toThrow();
    expect(
      auditPage(auditFixture(2, 'activity', null, 25), 'activity', '', value.next_cursor).items,
    ).toHaveLength(2);
  });
  it('preserves microsecond cursor order and projects bounded audit details', () => {
    const value = auditFixture(2);
    value.items[0]!.occurred_at = '2026-10-08T12:00:00.000900Z';
    value.items[1]!.occurred_at = '2026-10-08T12:00:00.000800Z';
    value.items[1]!.id = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
    Object.assign(value.items[0]!, { metadata: { extra: 'not retained' } });
    const parsed = auditPage(value, 'activity', '', null);
    expect(parsed.items[0]?.metadata).toBe('{"extra":"not retained"}');
    expect(parsed.items).toHaveLength(2);
  });
});
