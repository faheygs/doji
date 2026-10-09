import { expect, it } from 'vitest';
import { auditRelatedPath } from './audit-related';
const id = '20000000-0000-4000-8000-000000000002';
it('links only known moderation entities for an authorized employee', () => {
  const actor = { user_id: id, display_name: 'Employee', capabilities: { moderation_read: true } };
  expect(auditRelatedPath('report', id, actor)).toBe('/my-work/report/' + id + '?from=audit');
  expect(auditRelatedPath('moderation_appeal', id, actor)).toBe(
    '/my-work/appeal/' + id + '?from=audit',
  );
  expect(auditRelatedPath('configuration', id, actor)).toBeNull();
  expect(auditRelatedPath('report', 'https://example.com', actor)).toBeNull();
  expect(auditRelatedPath('report', id, { ...actor, capabilities: {} })).toBeNull();
});
