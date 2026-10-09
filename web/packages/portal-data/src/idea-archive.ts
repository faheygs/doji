import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import { ideaVersion } from './idea-record';

import {
  ideaFilters,
  ideaArchivePath,
  type IdeaFilter,
  type IdeaCursor,
} from './idea-archive-path';
export {
  ideaFilters,
  ideaArchivePath,
  validIdeaArchivePath,
  type IdeaFilter,
  type IdeaCursor,
} from './idea-archive-path';
const bad = () => Error('Idea history could not be verified.');
const timestamp = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 80 && Number.isFinite(Date.parse(v));
export function ideaArchive(value: unknown, filter: IdeaFilter, cursor: IdeaCursor) {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 25 ||
    typeof value.can_write !== 'boolean' ||
    !ideaFilters.includes(filter)
  )
    throw bad();
  const items = value.items.map((item) => {
    if (
      !record(item) ||
      !uuid(item.id) ||
      !ideaVersion(item.version) ||
      typeof item.title !== 'string' ||
      item.title.length > 100 ||
      typeof item.kind !== 'string' ||
      item.kind.length > 80 ||
      typeof item.author !== 'string' ||
      item.author.length > 160 ||
      !timestamp(item.created_at) ||
      typeof item.status !== 'string' ||
      !['pending', 'approved', 'rejected'].includes(item.status) ||
      (filter !== 'all' && item.status !== filter)
    )
      throw bad();
    return {
      id: item.id,
      title: item.title,
      kind: item.kind,
      author: item.author,
      at: item.created_at,
      status: item.status as Exclude<IdeaFilter, 'all'>,
    };
  });
  const micros = (at: string) =>
    BigInt(Date.parse(at)) * 1000n +
    BigInt((at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  const before = (a: { at: string; id: string }, b: { at: string; id: string }) =>
    micros(a.at) < micros(b.at) || (micros(a.at) === micros(b.at) && a.id < b.id);
  if (
    new Set(items.map((item) => item.id)).size !== items.length ||
    items.some((item, index) =>
      index ? !before(item, items[index - 1]!) : cursor && !before(item, cursor),
    )
  )
    throw bad();
  let next: IdeaCursor = null;
  if (value.next_cursor !== null) {
    const tail = items.at(-1),
      raw = value.next_cursor;
    if (items.length !== 25 || !tail || !record(raw) || raw.at !== tail.at || raw.id !== tail.id)
      throw bad();
    next = { at: tail.at, id: tail.id };
  }
  return { items, next };
}
export function readIdeaArchive(
  controller: EmployeeSessionController,
  filter: IdeaFilter,
  cursor: IdeaCursor,
  signal: AbortSignal,
) {
  return controller.read(
    'operations_read',
    ideaArchivePath(filter, cursor),
    undefined,
    (value) => ideaArchive(value, filter, cursor),
    signal,
  );
}
