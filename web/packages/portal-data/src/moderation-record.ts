import { ownership, record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';
import { evidenceReferences, preservedReferences } from './moderation-evidence';
import { reportHistory, appealHistory } from './moderation-history';
export type ModerationKind = 'report' | 'appeal';
export const invalidCase = () =>
  Error('Case evidence could not be verified. Refresh before continuing.');
export function caseText(value: unknown, max = 12000): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.length > max) throw invalidCase();
  return value;
}
function fields<const K extends readonly string[]>(
  value: unknown,
  keys: K,
): Record<K[number], string> {
  if (!record(value)) throw invalidCase();
  return Object.fromEntries(keys.map((key) => [key, caseText(value[key])])) as Record<
    K[number],
    string
  >;
}
function identity(value: unknown) {
  if (value === null || value === undefined) return null;
  if (!record(value) || !uuid(value.id)) throw invalidCase();
  return {
    id: value.id,
    label:
      caseText(value.display_name, 200) || caseText(value.username, 200) || 'Employee or member',
  };
}
export function decision(value: unknown, expectedId?: string) {
  if (!record(value) || !uuid(value.id) || (expectedId && value.id !== expectedId))
    throw invalidCase();
  return {
    id: value.id,
    ...fields(value, [
      'action',
      'state',
      'policy_code',
      'severity',
      'rationale',
      'member_notice',
      'account_action',
      'account_action_state',
      'decided_at',
      'restriction_ends_at',
    ]),
  };
}
export function reportRecord(value: unknown, id: string) {
  if (
    !record(value) ||
    !uuid(id) ||
    value.id !== id ||
    value.case_contract_version !== 3 ||
    !record(value.evidence) ||
    typeof value.evidence.exists !== 'boolean' ||
    !record(value.triage_state) ||
    !['moderation', 'restricted_safety'].includes(String(value.triage_state.queue)) ||
    !record(value.media_manifest) ||
    value.media_manifest.source !== 'current_content' ||
    value.media_manifest.historical_snapshot !== false ||
    !Array.isArray(value.media_manifest.items) ||
    value.media_manifest.items.length > 3 ||
    !['post', 'comment', 'poll_response', 'account', 'profile_photo'].includes(
      String(value.target_kind),
    )
  )
    throw invalidCase();
  const assigned = value.triage_state.assigned_to ?? value.assigned_to ?? null;
  if (assigned !== null && !uuid(assigned)) throw invalidCase();
  const currentDecision = value.current_decision == null ? null : decision(value.current_decision);
  const preserved = value.preserved_media_manifest;
  if (
    preserved != null &&
    (!record(preserved) || !currentDecision || preserved.decision_id !== currentDecision.id)
  )
    throw invalidCase();
  const evidence = fields(value.evidence, [
    'kind',
    'text',
    'caption',
    'body',
    'custom_text',
    'moderation_status',
  ]);
  const media = evidenceReferences(value.media_manifest.items);
  return {
    id,
    queue: String(value.triage_state.queue),
    assignedTo: assigned as string | null,
    owner: identity(value.triage_state.owner ?? value.owner),
    reporter: identity(value.reporter),
    subject: identity(value.reported_user),
    targetKind: String(value.target_kind),
    summary: fields(value, [
      'status',
      'priority',
      'reason_label',
      'reason_detail_label',
      'notes',
      'created_at',
    ]),
    context: fields(value.case_context, [
      'content_state',
      'content_created_at',
      'challenge_title',
      'daily_event_title',
      'audience_label',
      'original_audience',
    ]),
    evidence,
    contentExists: value.evidence.exists,
    manifest: media.map(({ slot, kind, availability }) => ({ slot, kind, availability })),
    media,
    preserved: currentDecision ? preservedReferences(preserved, currentDecision.id) : [],
    hasProfilePhoto: value.evidence.has_profile_photo === true,
    currentDecision,
    history: reportHistory(value),
  };
}
export function appealRecord(value: unknown, id: string) {
  if (
    !record(value) ||
    value.case_contract_version !== 1 ||
    !record(value.appeal) ||
    value.appeal.id !== id ||
    !uuid(id) ||
    !uuid(value.appeal.report_id) ||
    !uuid(value.appeal.decision_id) ||
    !record(value.original_evidence) ||
    typeof value.original_evidence.historical_content_snapshot !== 'boolean' ||
    !record(value.review_eligibility) ||
    typeof value.review_eligibility.can_review !== 'boolean' ||
    typeof value.review_eligibility.super_admin_override_required !== 'boolean'
  )
    throw invalidCase();
  const original = decision(value.original_decision, value.appeal.decision_id);
  const preserved = value.original_evidence.preserved_media_manifest;
  if (preserved != null && (!record(preserved) || preserved.decision_id !== original.id))
    throw invalidCase();
  // A newer report decision/archive is not the appealed decision. Never retain either here.
  if (!record(value.report_case)) throw invalidCase();
  const {
    current_decision: _current,
    preserved_media_manifest: _preserved,
    ...currentReport
  } = value.report_case;
  void _current;
  void _preserved;
  return {
    id,
    report: reportRecord(currentReport, value.appeal.report_id),
    original,
    preserved: preservedReferences(preserved, original.id),
    originalMedia:
      record(value.original_evidence.media_manifest) &&
      value.original_evidence.media_manifest.source === 'original_decision_reference'
        ? evidenceReferences(value.original_evidence.media_manifest.items)
        : [],
    appeal: fields(value.appeal, [
      'status',
      'statement',
      'submitted_at',
      'reviewed_at',
      'review_reason',
    ]),
    historicalSnapshot: value.original_evidence.historical_content_snapshot,
    originalAvailability: caseText(value.original_evidence.availability, 100),
    canReview: value.review_eligibility.can_review,
    blockedReason: caseText(value.review_eligibility.blocked_reason, 100),
    overrideRequired: value.review_eligibility.super_admin_override_required,
    history: appealHistory(value),
  };
}
export async function readModerationRecord(
  controller: EmployeeSessionController,
  kind: ModerationKind,
  id: string,
  area: string,
  signal: AbortSignal,
) {
  const caps = controller.getSnapshot().operator?.capabilities;
  if (
    !uuid(id) ||
    !['report', 'appeal'].includes(kind) ||
    !['my-work', 'overview', 'trust-safety', 'restricted-safety'].includes(area) ||
    !caps?.moderation_read ||
    (area === 'restricted-safety' && !caps.legal_read)
  )
    throw invalidCase();
  const data = await controller.read(
    'moderation_read',
    `/portal/admin/${kind === 'report' ? 'report-case-v3' : 'appeal-case'}?id=${id}`,
    undefined,
    (value) => {
      const appeal = kind === 'appeal' ? appealRecord(value, id) : null;
      const report = appeal?.report ?? reportRecord(value, id);
      const restricted =
        report.queue === 'restricted_safety' ||
        (!!appeal &&
          ['temporary_restriction', 'permanent_ban'].includes(appeal.original.account_action!));
      if (
        restricted &&
        (!controller.getSnapshot().operator?.capabilities.legal_read || area === 'trust-safety')
      )
        throw invalidCase();
      if (!restricted && area === 'restricted-safety') throw invalidCase();
      return { report, appeal, restricted };
    },
    signal,
  );
  const owner =
    kind === 'appeal'
      ? await controller.read(
          'moderation_read',
          '/staff-workflow/ownership',
          { p_kind: kind, p_id: id },
          (value) => {
            const verified = ownership(value, { kind, id });
            return {
              assigned_to: verified.assigned_to,
              owner_label: caseText(verified.owner_label, 200),
              revision: verified.revision,
              source_version: verified.source_version,
              can_claim: verified.can_claim,
              can_release: verified.can_release,
              can_assign: verified.can_assign,
              can_decide: verified.can_decide,
              actionable: verified.actionable,
            };
          },
          signal,
        )
      : null;
  return { ...data, owner };
}
export type ModerationRecord = Awaited<ReturnType<typeof readModerationRecord>>;
