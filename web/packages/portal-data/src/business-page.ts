import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import { checkedPageSize } from './page-size';
export const businessFilters = ['pending', 'changes_requested', 'approved', 'declined'] as const;
export type BusinessFilter = (typeof businessFilters)[number];
export type BusinessCursor = { at: string; id: string } | null;
const validTime = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 80 && Number.isFinite(Date.parse(value));
const micros = (at: string) =>
  BigInt(Date.parse(at)) * 1000n +
  BigInt((at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
export function businessPage(
  value: unknown,
  filter: BusinessFilter,
  cursor: BusinessCursor,
  pageSize = 25,
) {
  checkedPageSize(pageSize);
  const bad = () => Error('Business applications could not be verified.');
  if (
    !businessFilters.includes(filter) ||
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > pageSize
  )
    throw bad();
  const items = value.items.map((row) => {
    if (
      !record(row) ||
      !uuid(row.id) ||
      row.state !== filter ||
      !validTime(row.updated_at) ||
      !Number.isSafeInteger(row.revision) ||
      Number(row.revision) < 1 ||
      typeof row.brand_name !== 'string' ||
      row.brand_name.length > 200
    )
      throw bad();
    return { id: row.id, state: filter, at: row.updated_at, name: row.brand_name };
  });
  const follows = (a: NonNullable<BusinessCursor>, b: NonNullable<BusinessCursor>) =>
    micros(a.at) > micros(b.at) || (micros(a.at) === micros(b.at) && a.id > b.id);
  if (
    new Set(items.map((row) => row.id)).size !== items.length ||
    items.some((row, index) =>
      index ? !follows(row, items[index - 1]!) : cursor && !follows(row, cursor),
    )
  )
    throw bad();
  let next: BusinessCursor = null;
  if (value.next_cursor !== null) {
    const tail = items.at(-1),
      raw = value.next_cursor;
    if (
      items.length !== pageSize ||
      !tail ||
      !record(raw) ||
      raw.id !== tail.id ||
      raw.at !== tail.at
    )
      throw bad();
    next = { id: tail.id, at: tail.at };
  }
  return { items, next };
}
export function readBusinessPage(
  controller: EmployeeSessionController,
  filter: BusinessFilter,
  cursor: BusinessCursor,
  signal: AbortSignal,
  pageSize = 25,
) {
  checkedPageSize(pageSize);
  if (!businessFilters.includes(filter) || (cursor && (!uuid(cursor.id) || !validTime(cursor.at))))
    throw Error('Invalid business filters.');
  return controller.read(
    'business_read',
    '/business/page',
    {
      p_state: filter,
      p_limit: pageSize,
      p_after_at: cursor?.at ?? null,
      p_after_id: cursor?.id ?? null,
    },
    (value) => businessPage(value, filter, cursor, pageSize),
    signal,
  );
}
