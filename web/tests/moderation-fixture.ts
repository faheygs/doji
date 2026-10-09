export const reportId = '22222222-2222-4222-8222-222222222222';
export const appealId = '99999999-9999-4999-8999-999999999999';
export const decisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const moderatorId = '10000000-0000-4000-8000-000000000001';
export function reportFixture() {
  return {
    id: reportId,
    case_contract_version: 3,
    target_kind: 'post',
    status: 'pending',
    priority: 'normal',
    reason_label: 'Synthetic concern',
    reason_detail_label: 'Review this content',
    notes: 'Synthetic report note',
    assigned_to: moderatorId,
    owner: { id: moderatorId, display_name: 'Synthetic moderator' },
    reporter: null,
    reported_user: null,
    triage_state: { queue: 'moderation', assigned_to: moderatorId },
    case_context: {
      content_state: 'visible',
      challenge_title: 'Synthetic Doji',
      audience_label: 'Friends',
    },
    evidence: { kind: 'post', exists: true, caption: 'Current synthetic caption' },
    media_manifest: {
      source: 'current_content',
      historical_snapshot: false,
      content_available: true,
      items: [] as Record<string, unknown>[],
    },
  };
}
export function appealFixture() {
  return {
    case_contract_version: 1,
    appeal: {
      id: appealId,
      report_id: reportId,
      decision_id: decisionId,
      status: 'pending',
      statement: 'Please review the original decision.',
      submitted_at: '2026-10-08T12:00:00Z',
    },
    original_decision: {
      id: decisionId,
      action: 'remove_content',
      state: 'active',
      policy_code: 'other',
      severity: 'level_1',
      rationale: 'Original synthetic rationale',
      member_notice: 'Original synthetic notice',
      account_action: 'warning',
    },
    original_evidence: {
      historical_content_snapshot: false,
      availability: 'content_snapshot_not_retained',
    },
    report_case: reportFixture(),
    review_eligibility: {
      can_review: true,
      blocked_reason: null as string | null,
      super_admin_override_required: false,
    },
  };
}
export function appealOwner() {
  return {
    id: appealId,
    kind: 'appeal',
    revision: 1,
    source_version: 'a'.repeat(32),
    owner_label: 'Appeal reviewer',
    assigned_to: moderatorId,
    actionable: true,
    can_claim: false,
    can_release: true,
    can_assign: false,
    can_decide: true,
  };
}
