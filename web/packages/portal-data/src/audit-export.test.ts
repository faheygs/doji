import { describe, expect, it } from 'vitest';
import { auditExport, auditExportPath, auditCsv, validAuditExportPath } from './audit-export';
import { auditEntry } from './audit-entry';
import { assertEmployeeRead } from './employee-read-policy';
import { auditFixture } from '../../../tests/audit-fixture';
describe('bounded explicit audit exports', () => {
  it('accepts only canonical bounded export filters', () => {
    const path = auditExportPath('decision', 'Review');
    expect(validAuditExportPath(path)).toBe(true);
    expect(() => assertEmployeeRead(path, false)).not.toThrow();
    for (const invalid of [
      path + '&limit=9000',
      path + '&category=all',
      '/portal/admin/audit-export',
      'https://example.test' + path,
    ])
      expect(validAuditExportPath(invalid)).toBe(false);
  });
  it('rejects malformed, oversized, duplicate and mismatched-category exports', () => {
    const items = auditFixture(1).items;
    const value = { items, maximum: 5000, truncated: false };
    expect(auditExport(value, 'activity').items).toHaveLength(1);
    for (const invalid of [
      { ...value, maximum: 9999 },
      { ...value, truncated: 'false' },
      { ...value, items: [...items, ...items] },
      { ...value, items: Array(5001).fill(items[0]) },
    ])
      expect(() => auditExport(invalid, 'activity')).toThrow();
    expect(() => auditExport(value, 'access')).toThrow();
  });
  it('neutralizes formula/control prefixes and quotes CSV without exporting metadata', () => {
    for (const reason of [
      '=SUM(1,2)',
      '+formula',
      '-formula',
      '@formula',
      '\t=hidden',
      ' =hidden',
    ]) {
      const item = auditEntry({
        ...auditFixture(1).items[0],
        reason,
        metadata: { private: 'details only' },
      });
      expect(auditCsv([item])).toContain('"' + "'" + reason + '"');
      expect(auditCsv([item])).not.toContain('details only');
    }
    expect(
      auditCsv([auditEntry({ ...auditFixture(1).items[0], reason: 'A "quoted" reason' })]),
    ).toContain('"A ""quoted"" reason"');
  });
  it('retains safe textual details and rejects oversized metadata', () => {
    const item = {
      ...auditFixture(1).items[0],
      request_id: 'request-1',
      metadata: { text: '<script>not HTML</script>' },
    };
    expect(auditEntry(item).metadata).toContain('<script>');
    expect(() => auditEntry({ ...item, metadata: { tooLarge: 'x'.repeat(32769) } })).toThrow();
    expect(() => auditEntry({ ...item, request_id: {} })).toThrow();
  });
});
