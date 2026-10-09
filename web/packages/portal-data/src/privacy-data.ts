import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import { applicationFields } from '../../../../website/business-portal/application-form.mts';
import { canReadPrivacy, type PrivacyRecord } from './privacy-record';
import type { EmployeeSessionController } from './employee-session';
export { applicationFields };
const bad = () => Error('Protected business information could not be verified.');
const text = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.length <= max;
const rev = (v: unknown): v is number => Number.isSafeInteger(v) && Number(v) > 0;
const time = (v: unknown): v is string => text(v, 80) && Number.isFinite(Date.parse(v));
export function privacyDetails(value: unknown): Record<string, string> {
  if (
    !record(value) ||
    Object.entries(value).some(
      ([key, val]) => !applicationFields.some(([field]) => field === key) || !text(val, 1000),
    )
  )
    throw bad();
  return Object.fromEntries(Object.entries(value)) as Record<string, string>;
}
export function validCorrectionDetails(value: unknown) {
  try {
    const details = privacyDetails(value);
    // Match the existing draft contract; never fetch a submitted website.
    const jsonb =
      '{' +
      Object.entries(details)
        .map(([key, val]) => JSON.stringify(key) + ': ' + JSON.stringify(val))
        .join(', ') +
      '}';
    return (
      new TextEncoder().encode(jsonb).length <= 8192 &&
      Object.values(details).every((val) => !/[\u0000-\u001f\u007f]/.test(val)) &&
      (!details.country || /^[A-Z]{2}$/.test(details.country)) &&
      (!details.website ||
        /^https:\/\/[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}(\/[A-Za-z0-9._~!$&()*+,;=:@%/?#-]*)?$/.test(
          details.website,
        ))
    );
  } catch {
    return false;
  }
}
function application(value: unknown) {
  if (
    !record(value) ||
    !uuid(value.id) ||
    !rev(value.revision) ||
    !['draft', 'pending', 'changes_requested', 'approved', 'declined'].includes(
      String(value.state),
    ) ||
    (value.response !== undefined && !text(value.response))
  )
    throw bad();
  return {
    id: value.id,
    revision: value.revision,
    state: String(value.state),
    response: value.response ?? '',
    details: privacyDetails(value.details),
  };
}
export function privacyAccess(value: unknown, item: PrivacyRecord, after: number) {
  if (
    !record(value) ||
    value.case_id !== item.id ||
    value.account_id !== item.accountId ||
    !Number.isSafeInteger(after) ||
    after < 0 ||
    !['workos_business', 'supabase_business'].includes(String(value.identity_source)) ||
    typeof value.provider_export_required !== 'boolean' ||
    value.provider_export_required !== (value.identity_source === 'workos_business') ||
    (value.identity_source === 'workos_business' && value.identity !== null) ||
    !Array.isArray(value.submissions) ||
    value.submissions.length > 50 ||
    !Array.isArray(value.history) ||
    value.history.length > 30 ||
    typeof value.history_has_more !== 'boolean'
  )
    throw bad();
  let identity: { name: string; email: string } | null = null;
  if (value.identity !== null) {
    if (
      !record(value.identity) ||
      (value.identity.name !== null && !text(value.identity.name, 1000)) ||
      (value.identity.email !== null && !text(value.identity.email, 320))
    )
      throw bad();
    identity = { name: value.identity.name ?? '', email: value.identity.email ?? '' };
  }
  const agreement = (raw: unknown) => {
    if (
      !record(raw) ||
      !text(raw.terms_version, 200) ||
      !text(raw.privacy_version, 200) ||
      !time(raw.accepted_at)
    )
      throw bad();
    return { terms: raw.terms_version, privacy: raw.privacy_version, accepted: raw.accepted_at };
  };
  const app = value.application === null ? null : application(value.application);
  let previousSubmission = 0;
  const submissions = value.submissions.map((raw) => {
    if (
      !record(raw) ||
      !rev(raw.submission) ||
      raw.submission <= previousSubmission ||
      raw.submission > 50 ||
      !app ||
      raw.application_id !== app.id
    )
      throw bad();
    previousSubmission = raw.submission;
    return { number: raw.submission, ...agreement(raw), details: privacyDetails(raw.details) };
  });
  let previous = after;
  const history = value.history.map((raw) => {
    if (
      !record(raw) ||
      !rev(raw.revision) ||
      raw.revision <= previous ||
      !app ||
      raw.revision > app.revision ||
      !text(raw.action, 80) ||
      !text(raw.response) ||
      !time(raw.occurred_at)
    )
      throw bad();
    previous = raw.revision;
    return {
      revision: raw.revision,
      action: raw.action,
      response: raw.response,
      at: raw.occurred_at,
    };
  });
  if (value.history_has_more && (history.length !== 30 || previous >= (app?.revision ?? 0)))
    throw bad();
  return {
    identity,
    source: String(value.identity_source),
    providerExportRequired: value.provider_export_required,
    agreement: value.signup_agreement === null ? null : agreement(value.signup_agreement),
    application: app,
    submissions,
    history,
    next: value.history_has_more ? previous : null,
  };
}
export const correctionReasons = {
  no_application: 'No application draft exists.',
  review_required: 'Request changes or reopen the application through business review first.',
  erasure_prepared: 'Erasure is already prepared; draft correction is blocked.',
} as const;
export function privacyCorrection(value: unknown, item: PrivacyRecord) {
  if (
    !record(value) ||
    value.case_id !== item.id ||
    value.account_id !== item.accountId ||
    value.case_revision !== item.revision ||
    typeof value.correction_allowed !== 'boolean'
  )
    throw bad();
  if (!value.correction_allowed) {
    if (
      typeof value.blocked_reason !== 'string' ||
      !Object.hasOwn(correctionReasons, value.blocked_reason)
    )
      throw bad();
    return {
      allowed: false as const,
      reason: correctionReasons[value.blocked_reason as keyof typeof correctionReasons],
    };
  }
  const app = application(value.application);
  if (value.blocked_reason !== null || !['draft', 'changes_requested'].includes(app.state))
    throw bad();
  return { allowed: true as const, application: app };
}
async function read<T>(
  controller: EmployeeSessionController,
  item: PrivacyRecord,
  kind: 'access' | 'correction',
  after: number,
  signal: AbortSignal,
  parse: (v: unknown) => T,
) {
  const authorize = () => {
    if (
      !canReadPrivacy(controller) ||
      item.kind !== kind ||
      item.state !== 'open' ||
      !uuid(item.id) ||
      !uuid(item.accountId) ||
      !Number.isSafeInteger(after) ||
      after < 0
    )
      throw Error('Open verified privacy request required.');
  };
  authorize();
  return controller.read(
    'legal_read',
    '/business-privacy/' + kind,
    kind === 'access' ? { p_case_id: item.id, p_after_revision: after } : { p_case_id: item.id },
    (v) => {
      authorize();
      return parse(v);
    },
    signal,
  );
}
export const readPrivacyAccess = (
  controller: EmployeeSessionController,
  item: PrivacyRecord,
  after: number,
  signal: AbortSignal,
) => read(controller, item, 'access', after, signal, (v) => privacyAccess(v, item, after));
export const readPrivacyCorrection = (
  controller: EmployeeSessionController,
  item: PrivacyRecord,
  signal: AbortSignal,
) => read(controller, item, 'correction', 0, signal, (v) => privacyCorrection(v, item));
