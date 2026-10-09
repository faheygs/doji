import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

const date = (value: unknown): value is string =>
  typeof value === 'string' && value.length < 80 && Number.isFinite(Date.parse(value));
/** Retain only event metadata, not the legacy snapshot's work/evidence/provider fields. */
export function homeEvent(value: unknown) {
  if (!record(value) || !date(value.generated_at)) throw Error('Invalid Doji snapshot.');
  if (value.next_event === null) return { checkedAt: value.generated_at, event: null };
  const event = value.next_event;
  if (
    !record(event) ||
    !uuid(event.id) ||
    !date(event.fires_at) ||
    typeof event.title !== 'string' ||
    event.title.length > 2000 ||
    ![event.prelive_at, event.activated_at, event.closes_at].every((v) => v === null || date(v))
  )
    throw Error('Invalid Doji occurrence.');
  return {
    checkedAt: value.generated_at,
    event: {
      id: event.id,
      title: event.title,
      firesAt: event.fires_at,
      preliveAt: event.prelive_at as string | null,
      activatedAt: event.activated_at as string | null,
      closesAt: event.closes_at as string | null,
    },
  };
}
export type HomeEvent = ReturnType<typeof homeEvent>;
export function readHomeEvent(controller: EmployeeSessionController, signal: AbortSignal) {
  return controller.read(
    'operations_read',
    '/portal/admin/command-center?limit=1',
    undefined,
    homeEvent,
    signal,
  );
}
/** A snapshot is not a live activation signal. Labels describe the last server read only. */
export function homeEventStage(snapshot: HomeEvent) {
  const event = snapshot.event;
  if (!event) return 'No occurrence returned';
  const checked = Date.parse(snapshot.checkedAt);
  if (event.activatedAt && event.closesAt && Date.parse(event.closesAt) <= checked)
    return 'Window ended';
  if (event.activatedAt && Date.parse(event.activatedAt) <= checked) return 'Activated';
  if (event.preliveAt && Date.parse(event.preliveAt) <= checked) return 'Pre-live';
  return Date.parse(event.firesAt) > checked ? 'Upcoming' : 'Awaiting activation';
}
