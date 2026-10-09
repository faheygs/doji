import { ownership, record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

export const privacyStates = {
  open: 'Open',
  prepared: 'Erasure prepared',
  executing: 'Erasure in progress',
  primary_erased: 'Primary data erased',
  completed: 'Completed',
  denied: 'Denied',
} as const;
export const privacyKinds = {
  access: 'Access to information',
  correction: 'Correct information',
  closure: 'Close business access',
  erasure: 'Erase business information',
} as const;
export type PrivacyState = keyof typeof privacyStates;
export type PrivacyCursor = { due: string; id: string } | null;
const bad = () => Error('Privacy record could not be verified.');
const text = (value: unknown, max = 128): value is string =>
  typeof value === 'string' && value.length <= max;
const timestamp = (value: unknown): value is string =>
  text(value, 80) &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(value) &&
  Number.isFinite(Date.parse(value));
const revision = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1;
export function canReadPrivacy(controller: EmployeeSessionController) {
  const caps = controller.getSnapshot().operator?.capabilities;
  return caps?.legal_read === true && caps.operator_manage === true;
}
const authorize = (controller: EmployeeSessionController) => {
  if (!canReadPrivacy(controller)) throw Error('Privacy review permission required.');
};
function summary(value: unknown) {
  if (
    !record(value) ||
    !uuid(value.id) ||
    !uuid(value.account_id) ||
    typeof value.kind !== 'string' ||
    !Object.hasOwn(privacyKinds, value.kind) ||
    typeof value.state !== 'string' ||
    !Object.hasOwn(privacyStates, value.state) ||
    !revision(value.revision) ||
    !timestamp(value.due_at) ||
    !timestamp(value.received_at)
  )
    throw bad();
  return {
    id: value.id,
    accountId: value.account_id,
    kind: value.kind as keyof typeof privacyKinds,
    state: value.state as PrivacyState,
    revision: value.revision,
    due: value.due_at,
    received: value.received_at,
  };
}
export function privacyCase(value: unknown, id: string, after = 0) {
  const item = summary(value);
  if (
    !record(value) ||
    item.id !== id ||
    !text(value.verification_reference) ||
    !Number.isSafeInteger(after) ||
    after < 0 ||
    after > item.revision ||
    !Array.isArray(value.history) ||
    value.history.length > 30 ||
    typeof value.history_has_more !== 'boolean'
  )
    throw bad();
  let previous = after;
  const history = value.history.map((entry) => {
    if (
      !record(entry) ||
      !revision(entry.revision) ||
      entry.revision <= previous ||
      entry.revision > item.revision ||
      !text(entry.action, 80) ||
      !entry.action ||
      !text(entry.evidence_reference) ||
      !timestamp(entry.occurred_at)
    )
      throw bad();
    previous = entry.revision;
    return {
      revision: entry.revision,
      action: entry.action,
      reference: entry.evidence_reference,
      at: entry.occurred_at,
    };
  });
  if (value.history_has_more && (history.length !== 30 || previous >= item.revision)) throw bad();
  let hold: { reference: string; caseId: string } | null = null;
  if (value.hold != null) {
    const raw = value.hold;
    if (!record(raw)) throw bad();
    if (raw.reference !== null || raw.case_id !== null) {
      if (!text(raw.reference) || !raw.reference || !uuid(raw.case_id)) throw bad();
      hold = { reference: raw.reference, caseId: raw.case_id };
    }
  }
  return {
    ...item,
    verification: value.verification_reference,
    hold,
    history,
    nextRevision: value.history_has_more ? previous : null,
  };
}
function validCursor(cursor: PrivacyCursor) {
  return cursor === null || (record(cursor) && uuid(cursor.id) && timestamp(cursor.due));
}
export function privacyPage(value: unknown, state: PrivacyState, cursor: PrivacyCursor) {
  if (
    !Object.hasOwn(privacyStates, state) ||
    !validCursor(cursor) ||
    !Array.isArray(value) ||
    value.length > 25
  )
    throw bad();
  const items = value.map(summary);
  const micros = (at: string) =>
    BigInt(Date.parse(at)) * 1000n +
    BigInt((at.match(/\.(\d+)/)?.[1] ?? '').padEnd(6, '0').slice(3, 6));
  const follows = (a: NonNullable<PrivacyCursor>, b: NonNullable<PrivacyCursor>) =>
    micros(a.due) > micros(b.due) ||
    (micros(a.due) === micros(b.due) && a.id.toLowerCase() > b.id.toLowerCase());
  if (
    new Set(items.map((item) => item.id.toLowerCase())).size !== items.length ||
    items.some(
      (item, index) =>
        item.state !== state ||
        (index ? !follows(item, items[index - 1]!) : cursor && !follows(item, cursor)),
    )
  )
    throw bad();
  const tail = items.at(-1);
  return { items, next: items.length === 25 && tail ? { id: tail.id, due: tail.due } : null };
}
export function readPrivacyPage(
  controller: EmployeeSessionController,
  state: PrivacyState,
  cursor: PrivacyCursor,
  signal: AbortSignal,
) {
  authorize(controller);
  if (!Object.hasOwn(privacyStates, state) || !validCursor(cursor)) throw bad();
  return controller.read(
    'legal_read',
    '/business-privacy/page',
    {
      p_state: state,
      p_after_due: cursor?.due ?? null,
      p_after_id: cursor?.id ?? null,
    },
    (value) => {
      authorize(controller);
      return privacyPage(value, state, cursor);
    },
    signal,
  );
}
export async function readPrivacyRecord(
  controller: EmployeeSessionController,
  id: string,
  after: number,
  signal: AbortSignal,
) {
  authorize(controller);
  if (!uuid(id) || !Number.isSafeInteger(after) || after < 0) throw bad();
  const [item, owner] = await Promise.all([
    controller.read(
      'legal_read',
      '/business-privacy/case',
      { p_case_id: id, p_after_revision: after },
      (value) => privacyCase(value, id, after),
      signal,
    ),
    controller.read(
      'legal_read',
      '/staff-workflow/ownership',
      { p_kind: 'business_privacy', p_id: id },
      (value) => {
        const raw = ownership(value, { kind: 'business_privacy', id });
        if (!text(raw.owner_label, 200)) throw bad();
        return {
          assignedTo: raw.assigned_to,
          label: raw.owner_label,
          sourceVersion: raw.source_version,
          revision: raw.revision,
          canClaim: raw.can_claim,
          canRelease: raw.can_release,
          canAssign: raw.can_assign,
          canDecide: raw.can_decide,
          actionable: raw.actionable,
        };
      },
      signal,
    ),
  ]);
  authorize(controller);
  if (owner.sourceVersion !== String(item.revision)) throw bad();
  return { ...item, owner };
}
export type PrivacyRecord = Awaited<ReturnType<typeof readPrivacyRecord>>;
