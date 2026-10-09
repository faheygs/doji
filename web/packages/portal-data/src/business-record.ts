import { applicationFields } from '../../../../website/business-portal/application-form.mts';
import { ownership, record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

export { applicationFields };
const bad = () => Error('Business record could not be verified. Reload before continuing.');
const integer = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) >= 0;
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
export function businessApplication(value: unknown, id: string) {
  if (
    !record(value) ||
    !uuid(id) ||
    value.id !== id ||
    !integer(value.revision) ||
    !['pending', 'changes_requested', 'approved', 'declined'].includes(String(value.state)) ||
    !record(value.details) ||
    !record(value.latest_submission) ||
    !integer(value.latest_submission.submission) ||
    value.latest_submission.submission < 1 ||
    !text(value.latest_submission.terms_version, 200) ||
    !text(value.latest_submission.privacy_version, 200) ||
    !Array.isArray(value.history) ||
    value.history.length > 30 ||
    typeof value.history_has_more !== 'boolean'
  )
    throw bad();
  const details: Record<string, string> = {};
  for (const [key] of applicationFields) {
    const field = value.details[key];
    if (field !== undefined && !text(field, 2048)) throw bad();
    details[key] = field === undefined ? '' : field;
  }
  const history = value.history.map((entry) => {
    if (
      !record(entry) ||
      !integer(entry.revision) ||
      !text(entry.action, 80) ||
      !text(entry.response) ||
      !text(entry.internal_note) ||
      !text(entry.occurred_at, 80) ||
      !Number.isFinite(Date.parse(entry.occurred_at))
    )
      throw bad();
    return {
      revision: entry.revision,
      action: entry.action,
      response: entry.response,
      internal_note: entry.internal_note,
      occurred_at: entry.occurred_at,
    };
  });
  if (new Set(history.map((entry) => entry.revision)).size !== history.length) throw bad();
  return {
    id,
    revision: value.revision,
    state: String(value.state),
    details,
    submission: value.latest_submission.submission,
    terms: value.latest_submission.terms_version,
    privacy: value.latest_submission.privacy_version,
    history,
    historyHasMore: value.history_has_more,
  };
}
export async function readBusinessRecord(
  controller: EmployeeSessionController,
  id: string,
  signal: AbortSignal,
) {
  if (!uuid(id)) throw bad();
  const [application, owner] = await Promise.all([
    controller.read(
      'business_read',
      '/business/item',
      { p_id: id },
      (value) => businessApplication(value, id),
      signal,
    ),
    controller.read(
      'business_read',
      '/staff-workflow/ownership',
      { p_kind: 'business_application', p_id: id },
      (value) => ownership(value, { kind: 'business_application', id }),
      signal,
    ),
  ]);
  if (owner.source_version !== String(application.revision)) throw bad();
  return { application, owner };
}
export type BusinessRecord = Awaited<ReturnType<typeof readBusinessRecord>>;
