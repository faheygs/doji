export const ideaId = '20000000-0000-4000-8000-000000000002';
export const ideaActor = '10000000-0000-4000-8000-000000000001';
export const ideaKey = '30000000-0000-4000-8000-000000000003';
export function ideaFixture() {
  return {
    id: ideaId,
    body: 'What is your favorite outdoor activity?',
    kind: 'poll',
    options: ['Walking', 'Cycling'],
    status: 'pending',
    version: 'a'.repeat(32),
    can_write: true,
    allowed_actions: ['approved', 'rejected'],
    recent_history: [],
    author: 'Synthetic member',
    created_at: '2026-10-08T12:00:00Z',
    admin_note: null,
    pool_active: null,
  };
}
export function ideaOwner(assigned = false) {
  return {
    id: ideaId,
    kind: 'suggestion',
    revision: assigned ? 1 : 0,
    source_version: 'a'.repeat(32),
    assigned_to: assigned ? ideaActor : null,
    owner_label: assigned ? 'Synthetic reviewer' : 'Unassigned',
    can_claim: !assigned,
    can_release: assigned,
    can_assign: true,
    can_decide: true,
    actionable: true,
  };
}
