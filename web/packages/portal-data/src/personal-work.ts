import {
  record,
  kind,
  uuid,
  type WorkPage,
  type WorkRow,
} from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import { checkedPageSize } from './page-size';
export const personalFilters = ['open', 'completed', 'all'] as const;
export type PersonalFilter = (typeof personalFilters)[number];
export function personalFilter(value: unknown): PersonalFilter {
  return value === 'completed' || value === 'all' ? value : 'open';
}
const bad = () => Error('Personal history could not be verified.');
const time = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 80 && Number.isFinite(Date.parse(v));
const micros = (at: string) =>
  BigInt(Date.parse(at)) * 1000n +
  BigInt((at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
export function personalPage(
  value: unknown,
  filter: PersonalFilter,
  owner: string,
  cursor: WorkPage['next_cursor'],
  size: number,
): WorkPage {
  checkedPageSize(size);
  if (
    !personalFilters.includes(filter) ||
    !uuid(owner) ||
    !record(value) ||
    value.scope !== 'personal_work_v1' ||
    value.filter !== filter ||
    value.order !== 'oldest_first' ||
    !Array.isArray(value.items) ||
    value.items.length > size ||
    !Array.isArray(value.authorized_queues) ||
    !value.authorized_queues.every(kind) ||
    new Set(value.authorized_queues).size !== value.authorized_queues.length
  )
    throw bad();
  let previous = cursor;
  const seen = new Set<string>();
  const items = value.items.map((row): WorkRow => {
    if (
      !record(row) ||
      !kind(row.kind) ||
      !uuid(row.id) ||
      row.key !== `${row.kind}:${row.id}` ||
      !(value.authorized_queues as unknown[]).includes(row.kind) ||
      !time(row.at) ||
      typeof row.subject !== 'string' ||
      row.subject.length > 120 ||
      row.assigned_to !== owner ||
      !['ready', 'waiting', 'closed'].includes(String(row.work_state)) ||
      (filter !== 'all' && (row.work_state === 'closed') !== (filter === 'completed')) ||
      (row.work_state === 'closed'
        ? row.due_at !== null
        : row.due_at !== null && !time(row.due_at)) ||
      row.ownership_model !==
        (row.kind === 'report'
          ? 'existing_report'
          : row.kind === 'external_intake'
            ? 'existing_intake'
            : 'staff_workflow') ||
      seen.has(row.key as string)
    )
      throw bad();
    const key = row.key as string;
    if (
      previous &&
      (micros(row.at) < micros(previous.at) ||
        (micros(row.at) === micros(previous.at) && key <= previous.key))
    )
      throw bad();
    seen.add(key);
    previous = { at: row.at, key };
    return {
      kind: row.kind,
      id: row.id,
      key,
      subject: row.subject,
      at: row.at,
      assigned_to: owner,
      work_state: row.work_state as WorkRow['work_state'],
      due_at: row.due_at as string | null,
      ownership_model: row.ownership_model as WorkRow['ownership_model'],
    };
  });
  if (
    value.next_cursor !== null &&
    (!record(value.next_cursor) ||
      items.length !== size ||
      !previous ||
      value.next_cursor.at !== previous.at ||
      value.next_cursor.key !== previous.key)
  )
    throw bad();
  return {
    items,
    authorized_queues: value.authorized_queues,
    next_cursor: value.next_cursor === null ? null : previous,
  };
}
export function readPersonalWork(
  controller: EmployeeSessionController,
  filter: PersonalFilter,
  cursor: WorkPage['next_cursor'],
  signal: AbortSignal,
  size = 25,
) {
  const actor = controller.getSnapshot().operator;
  const capability =
    actor &&
    ['moderation_read', 'operations_read', 'business_read', 'legal_read'].find(
      (key) => actor.capabilities[key],
    );
  if (!controller.historyReadsEnabled || !actor || !capability)
    throw Error('Personal history is unavailable.');
  if (
    !personalFilters.includes(filter) ||
    (cursor &&
      (!time(cursor.at) ||
        !/^(report|appeal|suggestion|business_application|external_intake|business_privacy):[a-f0-9-]{36}$/.test(
          cursor.key,
        )))
  )
    throw bad();
  return controller.read(
    capability,
    '/staff-workflow/personal',
    {
      p_kind: 'all',
      p_state: filter,
      p_limit: checkedPageSize(size),
      p_after_at: cursor?.at ?? null,
      p_after_key: cursor?.key ?? null,
    },
    (value) => personalPage(value, filter, actor.user_id, cursor, size),
    signal,
  );
}
