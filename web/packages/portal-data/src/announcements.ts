import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import {
  announcementFilters,
  announcementPath,
  type AnnouncementFilter,
  type AnnouncementCursor,
} from './announcement-path';
export * from './announcement-path';
const bad = () => Error('Announcement data could not be verified.');
const time = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 80 && Number.isFinite(Date.parse(v));
export const announcementLabels = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  live: 'Live',
  expired: 'Expired',
  cancelled: 'Cancelled',
  disabled: 'Disabled',
} as const;
function summary(value: unknown) {
  if (
    !record(value) ||
    !uuid(value.id) ||
    typeof value.title !== 'string' ||
    value.title.length > 100 ||
    !time(value.created_at) ||
    !time(value.starts_at) ||
    !time(value.ends_at) ||
    Date.parse(value.ends_at) <= Date.parse(value.starts_at) ||
    typeof value.state !== 'string' ||
    !['draft', 'published', 'cancelled', 'legacy'].includes(value.state) ||
    typeof value.managed !== 'boolean' ||
    value.managed !== (value.state !== 'legacy') ||
    typeof value.display_state !== 'string' ||
    !Object.hasOwn(announcementLabels, value.display_state)
  )
    throw bad();
  if (
    (value.state === 'draft' || value.state === 'cancelled') &&
    value.display_state !== value.state
  )
    throw bad();
  return {
    id: value.id,
    title: value.title,
    at: value.created_at,
    starts: value.starts_at,
    ends: value.ends_at,
    state: value.state,
    managed: value.managed,
    status: value.display_state as keyof typeof announcementLabels,
  };
}
export function announcementPage(
  value: unknown,
  filter: AnnouncementFilter,
  cursor: AnnouncementCursor,
) {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    typeof value.can_write !== 'boolean' ||
    !announcementFilters.includes(filter)
  )
    throw bad();
  const items = value.items.map(summary);
  const micros = (at: string) =>
    BigInt(Date.parse(at)) * 1000n +
    BigInt((at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  const before = (a: { at: string; id: string }, b: { at: string; id: string }) =>
    micros(a.at) < micros(b.at) || (micros(a.at) === micros(b.at) && a.id < b.id);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some(
      (item, index) =>
        (filter !== 'all' && item.state !== filter) ||
        (index ? !before(item, items[index - 1]!) : cursor && !before(item, cursor)),
    )
  )
    throw bad();
  let next: AnnouncementCursor = null;
  if (value.next_cursor !== null) {
    const tail = items.at(-1),
      raw = value.next_cursor;
    if (items.length !== 25 || !tail || !record(raw) || raw.at !== tail.at || raw.id !== tail.id)
      throw bad();
    next = { at: tail.at, id: tail.id };
  }
  return { items, next, canWrite: value.can_write };
}
export function announcementRecord(value: unknown, id: string) {
  const item = summary(value);
  if (
    !record(value) ||
    item.id !== id ||
    typeof value.body !== 'string' ||
    value.body.length > 600 ||
    !Number.isInteger(value.max_impressions_per_user) ||
    Number(value.max_impressions_per_user) < 1 ||
    Number(value.max_impressions_per_user) > 10 ||
    !Number.isInteger(value.min_hours_between_impressions) ||
    Number(value.min_hours_between_impressions) < 1 ||
    Number(value.min_hours_between_impressions) > 720 ||
    !Number.isInteger(value.priority) ||
    typeof value.can_write !== 'boolean'
  )
    throw bad();
  for (const [key, limit] of [
    ['cta_label', 80],
    ['cta_url', 2048],
  ] as const)
    if (value[key] !== null && (typeof value[key] !== 'string' || value[key].length > limit))
      throw bad();
  return {
    ...item,
    canWrite: value.can_write,
    version:
      typeof value.version === 'string' && /^[a-f0-9]{32}$/.test(value.version)
        ? value.version
        : null,
    actions: !Object.hasOwn(value, 'allowed_actions')
      ? value.can_write && item.managed
        ? item.state === 'draft'
          ? ['save', 'publish', 'cancel']
          : item.state === 'published'
            ? ['cancel']
            : []
        : []
      : Array.isArray(value.allowed_actions)
        ? value.allowed_actions.filter(
            (v): v is string => typeof v === 'string' && ['save', 'publish', 'cancel'].includes(v),
          )
        : [],
    draft: {
      id: item.id,
      version: value.version,
      state: item.state,
      managed: item.managed,
      can_write: value.can_write,
      ...(Object.hasOwn(value, 'allowed_actions')
        ? { allowed_actions: value.allowed_actions }
        : {}),
      title: item.title,
      body: value.body,
      starts_at: item.starts,
      ends_at: item.ends,
      cta_label: value.cta_label,
      cta_url: value.cta_url,
      priority: value.priority,
      max_impressions_per_user: value.max_impressions_per_user,
      min_hours_between_impressions: value.min_hours_between_impressions,
      reward_action: value.reward_action,
      reward_sparks: value.reward_sparks,
    },
    body: value.body,
    impressions: Number(value.max_impressions_per_user),
    spacing: Number(value.min_hours_between_impressions),
    priority: Number(value.priority),
    ctaLabel: value.cta_label as string | null,
    ctaUrl: value.cta_url as string | null,
  };
}
export function readAnnouncements(
  controller: EmployeeSessionController,
  filter: AnnouncementFilter,
  cursor: AnnouncementCursor,
  signal: AbortSignal,
) {
  return controller.read(
    'operations_read',
    announcementPath(filter, cursor),
    undefined,
    (value) => announcementPage(value, filter, cursor),
    signal,
  );
}
export function readAnnouncement(
  controller: EmployeeSessionController,
  id: string,
  signal: AbortSignal,
) {
  if (!uuid(id)) throw bad();
  return controller.read(
    'operations_read',
    '/portal/admin/editorial-item?kind=announcements&id=' + id,
    undefined,
    (value) => announcementRecord(value, id),
    signal,
  );
}
