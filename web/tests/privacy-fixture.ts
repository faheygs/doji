export const privacyId = '20000000-0000-4000-8000-000000000002';
export const privacyAccount = '30000000-0000-4000-8000-000000000003';
export const privacyActor = '10000000-0000-4000-8000-000000000001';
export function privacyFixture(after = 0, revision = 32) {
  return {
    id: privacyId,
    account_id: privacyAccount,
    kind: 'access',
    state: 'open',
    revision,
    received_at: '2026-10-08T12:00:00.123456+00:00',
    due_at: '2026-10-20T12:00:00.123456+00:00',
    verification_reference: 'verified-support-001',
    hold: null,
    history: Array.from({ length: Math.max(0, Math.min(30, revision - after)) }, (_, i) => ({
      revision: after + i + 1,
      action: 'reviewed',
      evidence_reference: 'protected-reference-' + (after + i + 1),
      occurred_at: '2026-10-09T12:00:00Z',
    })),
    history_has_more: after + 30 < revision,
  };
}
export function privacyOwnership(revision = 32) {
  return {
    kind: 'business_privacy',
    id: privacyId,
    revision: 2,
    source_version: String(revision),
    assigned_to: privacyActor,
    owner_label: 'Privacy reviewer',
    can_claim: false,
    can_release: true,
    can_assign: true,
    can_decide: true,
    actionable: true,
  };
}
