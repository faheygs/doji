import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import { auditEntry } from './audit-entry';
export const auditCategories = ['activity', 'all', 'decision', 'access', 'system'] as const;
export type AuditCategory = (typeof auditCategories)[number];
export type AuditCursor = { occurred_at: string; id: string } | null;
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
const timestamp = (value: unknown): value is string =>
  text(value, 80) && Number.isFinite(Date.parse(value));
const bad = () => Error('Audit page could not be verified.');
export function auditPath(category: AuditCategory, search: string, cursor: AuditCursor) {
  if (
    !auditCategories.includes(category) ||
    !text(search, 160) ||
    (cursor && (!timestamp(cursor.occurred_at) || !uuid(cursor.id)))
  )
    throw bad();
  const params = new URLSearchParams({ limit: '25', category, search: search.trim() });
  if (cursor) {
    params.set('beforeOccurredAt', cursor.occurred_at);
    params.set('beforeId', cursor.id);
  }
  return '/portal/admin/audit?' + params.toString();
}
export function validAuditPath(path: string) {
  const url = new URL(path, 'https://admin.dojipro.com');
  if (url.pathname !== '/portal/admin/audit' || url.origin !== 'https://admin.dojipro.com')
    return false;
  try {
    const at = url.searchParams.get('beforeOccurredAt'),
      id = url.searchParams.get('beforeId');
    if (!!at !== !!id) return false;
    return (
      path ===
      auditPath(
        url.searchParams.get('category') as AuditCategory,
        url.searchParams.get('search') ?? '',
        at && id ? { occurred_at: at, id } : null,
      )
    );
  } catch {
    return false;
  }
}
export function auditPage(
  value: unknown,
  category: AuditCategory,
  search: string,
  cursor: AuditCursor,
) {
  if (
    !record(value) ||
    value.filter !== category ||
    value.search !== (search.trim().toLowerCase() || null) ||
    !Array.isArray(value.items) ||
    value.items.length > 25
  )
    throw bad();
  const items = value.items.map(auditEntry);
  if (
    items.some(
      (item) =>
        category !== 'all' &&
        (category === 'activity' ? item.category === 'access' : item.category !== category),
    )
  )
    throw bad();
  // Postgres cursors have microseconds; Date.parse alone loses submillisecond order.
  const micros = (at: string) =>
    BigInt(Date.parse(at)) * 1000n +
    BigInt((at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  const before = (a: { at: string; id: string }, b: { at: string; id: string }) =>
    micros(a.at) < micros(b.at) || (micros(a.at) === micros(b.at) && a.id < b.id);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some((item, index) =>
      index
        ? !before(item, items[index - 1]!)
        : cursor && !before(item, { at: cursor.occurred_at, id: cursor.id }),
    )
  )
    throw bad();
  let next: AuditCursor = null;
  if (value.next_cursor !== null) {
    const tail = items.at(-1),
      nextValue = value.next_cursor;
    if (
      items.length !== 25 ||
      !tail ||
      !record(nextValue) ||
      nextValue.id !== tail.id ||
      nextValue.occurred_at !== tail.at
    )
      throw bad();
    next = { occurred_at: tail.at, id: tail.id };
  }
  return { items, next };
}
export function readEmployeeAudit(
  controller: EmployeeSessionController,
  category: AuditCategory,
  search: string,
  cursor: AuditCursor,
  signal: AbortSignal,
) {
  return controller.read(
    'operations_read',
    auditPath(category, search, cursor),
    undefined,
    (value) => auditPage(value, category, search, cursor),
    signal,
  );
}
