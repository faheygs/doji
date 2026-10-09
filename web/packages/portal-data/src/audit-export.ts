import { record } from '../../../../website/admin-portal/workflow-contracts.mts';
import { auditCategories, type AuditCategory } from './employee-audit';
import { auditEntry, type AuditEntry } from './audit-entry';
import type { EmployeeSessionController } from './employee-session';

export function auditExportPath(category: AuditCategory, search: string) {
  if (!auditCategories.includes(category) || typeof search !== 'string' || search.length > 160)
    throw Error('Invalid audit export filters.');
  return '/portal/admin/audit-export?' + new URLSearchParams({ category, search: search.trim() });
}
export function validAuditExportPath(path: string) {
  try {
    const url = new URL(path, 'https://admin.dojipro.com');
    return (
      path ===
      auditExportPath(
        url.searchParams.get('category') as AuditCategory,
        url.searchParams.get('search') ?? '',
      )
    );
  } catch {
    return false;
  }
}
export function auditExport(value: unknown, category: AuditCategory) {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 5000 ||
    typeof value.truncated !== 'boolean' ||
    value.maximum !== 5000
  )
    throw Error('Audit export could not be verified.');
  const items = value.items.map(auditEntry);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item) =>
        category !== 'all' &&
        (category === 'activity' ? item.category === 'access' : item.category !== category),
    ) ||
    JSON.stringify(items).length > 4_000_000
  )
    throw Error('Audit export scope or size could not be verified.');
  return { items, truncated: value.truncated };
}
export function readAuditExport(
  controller: EmployeeSessionController,
  category: AuditCategory,
  search: string,
  signal: AbortSignal,
) {
  return controller.read(
    'operations_read',
    auditExportPath(category, search),
    undefined,
    (value) => auditExport(value, category),
    signal,
  );
}
/** Quote every cell and neutralize spreadsheet formulas, including leading control/space. */
const csvCell = (value: string | null) => {
  const text = value ?? '';
  return '"' + (/^[\s=+@-]/u.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
};
export function auditCsv(items: readonly AuditEntry[]) {
  const columns = [
    'event_id',
    'occurred_at',
    'category',
    'actor',
    'actor_role',
    'action',
    'entity_type',
    'entity_id',
    'reason',
    'request_id',
  ];
  return [
    columns,
    ...items.map((item) => [
      item.id,
      item.at,
      item.category,
      item.actor,
      item.actorRole,
      item.action,
      item.entityType,
      item.entityId,
      item.reason,
      item.requestId,
    ]),
  ]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n');
}
