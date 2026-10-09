import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';

export const policies = [
  'sexual_content',
  'sexual_exploitation',
  'child_safety',
  'nonconsensual_intimate_imagery',
  'harassment_bullying',
  'self_harm',
  'hate',
  'violence_threats',
  'human_exploitation',
  'restricted_goods',
  'impersonation',
  'spam_scam',
  'intellectual_property',
  'privacy',
  'other',
] as const;
export type ModerationInput = Readonly<{
  kind: 'triage' | 'decision' | 'appeal' | 'review' | 'ownership';
  id: string;
  action: string;
  key: string;
  restricted: boolean;
  reason?: string;
  notice?: string;
  policy?: string;
  severity?: string;
  account?: string | null;
  days?: number | null;
  priority?: string;
  decisionId?: string;
  revision?: number;
  sourceVersion?: string;
  target?: string;
}>;
export const boundedReason = (v: unknown) =>
  typeof v === 'string' && v === v.trim() && [...v].length >= 10 && [...v].length <= 1000;
export function validModerationInput(input: ModerationInput) {
  if (
    !record(input) ||
    !uuid(input.id) ||
    !uuid(input.key) ||
    typeof input.restricted !== 'boolean'
  )
    return false;
  const common = ['kind', 'id', 'action', 'key', 'restricted'];
  const extra = {
    triage: ['priority'],
    decision: ['reason', 'notice', 'policy', 'severity', 'account', 'days'],
    appeal: ['reason', 'decisionId'],
    review: ['reason', 'decisionId'],
    ownership: ['revision', 'sourceVersion', 'target'],
  };
  if (
    !Object.hasOwn(extra, input.kind) ||
    Object.keys(input).some((k) => ![...common, ...extra[input.kind]].includes(k))
  )
    return false;
  if (input.kind === 'triage')
    return (
      ['claim', 'release', 'set_priority'].includes(input.action) &&
      (input.action === 'set_priority'
        ? ['low', 'normal', 'high', 'critical'].includes(input.priority ?? '')
        : input.priority === undefined)
    );
  if (input.kind === 'ownership')
    return (
      ['claim', 'release', 'assign'].includes(input.action) &&
      (input.action === 'assign' ? uuid(input.target) : input.target === undefined) &&
      Number.isSafeInteger(input.revision) &&
      input.revision! >= 0 &&
      input.revision! < Number.MAX_SAFE_INTEGER &&
      typeof input.sourceVersion === 'string' &&
      /^[a-f\d]{32}$/.test(input.sourceVersion)
    );
  if (!boundedReason(input.reason)) return false;
  if (input.kind === 'appeal')
    return ['uphold', 'reverse'].includes(input.action) && uuid(input.decisionId);
  if (input.kind === 'review')
    return ['reopen', 'reclose'].includes(input.action) && uuid(input.decisionId);
  if (!boundedReason(input.notice)) return false;
  if (input.action === 'no_violation')
    return (
      input.policy === 'no_violation' &&
      input.severity === 'none' &&
      input.account === null &&
      input.days === null
    );
  if (!policies.some((p) => p === input.policy)) return false;
  if (input.action === 'escalate_restricted')
    return (
      !input.restricted &&
      ['level_2', 'level_3'].includes(input.severity ?? '') &&
      input.account === null &&
      input.days === null
    );
  if (!['remove_content', 'remove_profile_photo'].includes(input.action)) return false;
  if (!input.restricted)
    return (
      ['level_1', 'level_2'].includes(input.severity ?? '') &&
      input.account === null &&
      input.days === null
    );
  return (
    ['level_2', 'level_3'].includes(input.severity ?? '') &&
    ['warning', 'temporary_restriction', 'permanent_ban'].includes(input.account ?? '') &&
    (input.account === 'temporary_restriction'
      ? [1, 3, 7, 30].includes(input.days ?? 0)
      : input.days === null)
  );
}
export function moderationRequest(input: ModerationInput) {
  const report = { reportId: input.id, action: input.action, idempotencyKey: input.key };
  if (input.kind === 'triage')
    return {
      path: '/portal/admin/report-triage',
      body: { ...report, priority: input.priority ?? null, note: null },
    };
  if (input.kind === 'review')
    return { path: '/portal/admin/report-review-state', body: { ...report, reason: input.reason } };
  if (input.kind === 'appeal')
    return {
      path: '/portal/admin/appeal-decision',
      body: {
        appealId: input.id,
        outcome: input.action,
        reason: input.reason,
        idempotencyKey: input.key,
      },
    };
  if (input.kind === 'ownership')
    return {
      path: '/staff-workflow/command',
      body: {
        p_kind: 'appeal',
        p_id: input.id,
        p_action: input.action,
        p_revision: input.revision,
        p_source_version: input.sourceVersion,
        p_target: input.target ?? null,
        p_request_id: input.key,
      },
    };
  return {
    path: '/portal/admin/report-decision',
    body: {
      ...report,
      policyCode: input.policy,
      severity: input.severity,
      reason: input.reason,
      userNotice: input.notice,
      accountAction: input.account,
      restrictionDays: input.days,
    },
  };
}
export function moderationReceipt(value: unknown, input: ModerationInput, actor: string) {
  if (!record(value)) throw Error('Unverified moderation outcome.');
  let valid = false;
  if (input.kind === 'triage')
    valid =
      value.report_id === input.id &&
      ['low', 'normal', 'high', 'critical'].includes(String(value.priority)) &&
      (input.action === 'claim'
        ? value.assigned_to === actor
        : input.action === 'release'
          ? value.assigned_to === null
          : value.priority === input.priority);
  if (input.kind === 'ownership')
    valid =
      value.kind === 'appeal' &&
      value.id === input.id &&
      value.revision === input.revision! + 1 &&
      value.assigned_to ===
        (input.action === 'assign' ? input.target : input.action === 'claim' ? actor : null) &&
      typeof value.replayed === 'boolean';
  if (input.kind === 'appeal')
    valid =
      value.appeal_id === input.id &&
      value.decision_id === input.decisionId &&
      value.status === (input.action === 'uphold' ? 'upheld' : 'reversed');
  if (input.kind === 'review')
    valid =
      value.report_id === input.id &&
      value.decision_id === input.decisionId &&
      value.enforcement_changed === false &&
      value.review_state === (input.action === 'reopen' ? 'reopened' : 'resolved') &&
      (input.action === 'reopen'
        ? value.status === 'pending'
        : ['dismissed', 'actioned'].includes(String(value.status)));
  if (input.kind === 'decision')
    valid =
      value.report_id === input.id &&
      uuid(value.decision_id) &&
      value.action === input.action &&
      value.status ===
        (input.action === 'escalate_restricted'
          ? 'pending'
          : input.action === 'no_violation'
            ? 'dismissed'
            : 'actioned');
  if (!valid) throw Error('Unverified moderation outcome.');
  return { id: input.id, action: input.action };
}
