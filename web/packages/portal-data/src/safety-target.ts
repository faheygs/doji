import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import type { SafetyRecord } from './safety-record';
export const targetKinds = {
  post: 'Post',
  comment: 'Comment',
  poll_response: 'Poll response',
  profile_photo: 'Profile photo',
  account: 'Account',
} as const;
export type TargetKind = keyof typeof targetKinds;
const text = (value: unknown, max: number) =>
  value == null ? '' : typeof value === 'string' && value.length <= max ? value : null;
export function safetyTarget(value: unknown, caseId: string, kind: TargetKind, id: string) {
  if (
    !record(value) ||
    value.case_id !== caseId ||
    value.id !== id ||
    value.kind !== kind ||
    !uuid(value.owner_id) ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f\d]{64}$/.test(value.fingerprint) ||
    !record(value.detail)
  )
    throw Error('Exact content identity could not be verified.');
  const username = text(value.username, 160),
    content = text(value.detail.text, 6000),
    visibility = text(value.detail.state, 160);
  if (username === null || content === null || visibility === null)
    throw Error('Exact content details could not be verified.');
  const detail = value.detail;
  return {
    caseId,
    kind,
    id,
    owner: value.owner_id,
    username,
    content,
    visibility,
    fingerprint: value.fingerprint,
    hasMedia: ['photo_ref', 'front_photo_ref', 'video_ref'].some((key) => !!detail[key]),
  };
}
export type SafetyTarget = ReturnType<typeof safetyTarget>;
export async function readSafetyTarget(
  controller: EmployeeSessionController,
  item: SafetyRecord,
  kind: TargetKind,
  id: string,
  signal: AbortSignal,
) {
  const caps = controller.getSnapshot().operator?.capabilities;
  if (
    !uuid(id) ||
    !uuid(item.id) ||
    !Object.hasOwn(targetKinds, kind) ||
    !item.targets.includes(kind) ||
    item.closedAt ||
    item.reportId ||
    !caps?.moderation_read ||
    (item.queue === 'restricted_safety' && !caps.legal_read)
  )
    throw Error('Exact content inspection is unavailable.');
  return controller.read(
    'moderation_read',
    '/safety/target',
    { p_case_id: item.id, p_kind: kind, p_target_id: id },
    (value) => safetyTarget(value, item.id, kind, id),
    signal,
  );
}
