import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

export type SafetyQueue = 'moderation' | 'restricted_safety';
export const requestFields = [
  'reason',
  'detail',
  'name',
  'contact',
  'relationship',
  'location',
  'statement',
  'signature',
] as const;
const bad = () => Error('Safety record could not be verified. Refresh before continuing.');
const text = (v: unknown, max = 12000): v is string => typeof v === 'string' && v.length <= max;
const date = (v: unknown): v is string => text(v, 80) && Number.isFinite(Date.parse(v));
const optionalText = (v: unknown, max = 12000) => {
  if (v === null || v === undefined) return '';
  if (!text(v, max)) throw bad();
  return v;
};
export function safetyRecord(value: unknown, id: string, expectedQueue?: SafetyQueue) {
  if (
    !record(value) ||
    !uuid(id) ||
    value.id !== id ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 1 ||
    Number(value.revision) >= Number.MAX_SAFE_INTEGER ||
    !['moderation', 'restricted_safety'].includes(String(value.queue)) ||
    (expectedQueue && value.queue !== expectedQueue) ||
    !['received', 'reviewing', 'needs_information', 'removed', 'not_actionable'].includes(
      String(value.state),
    ) ||
    !date(value.received_at) ||
    !date(value.deadline_at) ||
    (value.closed_at !== null && !date(value.closed_at)) ||
    (value.assigned_to !== null && !uuid(value.assigned_to)) ||
    (value.report_id !== null && !uuid(value.report_id)) ||
    typeof value.can_write !== 'boolean' ||
    !record(value.request) ||
    !record(value.classification) ||
    !Array.isArray(value.history) ||
    value.history.length > 30
  )
    throw bad();
  if (['removed', 'not_actionable'].includes(String(value.state)) !== (value.closed_at !== null))
    throw bad();
  const request = Object.fromEntries(
    requestFields.map((key) => [
      key,
      optionalText((value.request as Record<string, unknown>)[key]),
    ]),
  ) as Record<(typeof requestFields)[number], string>;
  const history = value.history.map((entry) => {
    if (!record(entry) || !uuid(entry.id) || !date(entry.occurred_at) || !text(entry.action, 80))
      throw bad();
    return {
      id: entry.id,
      at: entry.occurred_at,
      action: entry.action,
      note: optionalText(entry.internal_note, 2000),
      message: optionalText(entry.public_message, 2000),
    };
  });
  if (new Set(history.map((entry) => entry.id)).size !== history.length) throw bad();
  return {
    id,
    revision: Number(value.revision),
    queue: value.queue as SafetyQueue,
    state: String(value.state),
    receivedAt: value.received_at,
    deadlineAt: value.deadline_at,
    closedAt: value.closed_at as string | null,
    assignedTo: value.assigned_to as string | null,
    reportId: value.report_id as string | null,
    canWrite: value.can_write,
    request,
    history,
    reason: optionalText(value.classification.reason_label, 200),
    detail: optionalText(value.classification.detail_label, 200),
    response: optionalText(value.public_message, 2000),
    accessReview: optionalText(value.access_review, 2000),
    copiesReview: optionalText(value.copies_review, 2000),
    targets:
      Array.isArray(value.classification.targets) && value.classification.targets.length <= 5
        ? [
            ...new Set(
              value.classification.targets.filter(
                (kind): kind is string =>
                  typeof kind === 'string' &&
                  ['post', 'comment', 'poll_response', 'profile_photo', 'account'].includes(kind),
              ),
            ),
          ]
        : [],
  };
}
export type SafetyRecord = ReturnType<typeof safetyRecord>;
export async function readSafetyRecord(
  controller: EmployeeSessionController,
  id: string,
  signal: AbortSignal,
  expectedQueue?: SafetyQueue,
) {
  const actor = controller.getSnapshot().operator;
  if (
    !uuid(id) ||
    !actor?.capabilities.moderation_read ||
    (expectedQueue === 'restricted_safety' && !actor.capabilities.legal_read)
  )
    throw bad();
  return controller.read(
    'moderation_read',
    '/safety/case',
    { p_id: id },
    (value) => {
      const item = safetyRecord(value, id, expectedQueue);
      if (
        item.queue === 'restricted_safety' &&
        !controller.getSnapshot().operator?.capabilities.legal_read
      )
        throw bad();
      return item;
    },
    signal,
  );
}
