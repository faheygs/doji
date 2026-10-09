import { record } from '../../../../website/admin-portal/workflow-contracts.mts';
const bad = () => Error('Case history could not be verified.');
function text(value: unknown, max = 12000): string {
  if (value == null) return '';
  if (typeof value !== 'string' || value.length > max) throw bad();
  return value;
}
export function historyTime(value: unknown): string | null {
  const raw = text(value, 80);
  return raw && Number.isFinite(Date.parse(raw)) ? raw : null;
}
export function historyActor(value: unknown, deleted = false): string {
  if (value == null) return deleted ? 'Deleted employee' : 'Reviewer unavailable';
  if (!record(value)) throw bad();
  return text(value.display_name, 200) || text(value.username, 200) || 'Reviewer unavailable';
}
export function reportHistory(value: Record<string, unknown>) {
  let workflow = null;
  if (value.workflow_history != null) {
    if (!Array.isArray(value.workflow_history) || value.workflow_history.length > 50) throw bad();
    workflow = value.workflow_history
      .map((raw) => {
        if (!record(raw)) throw bad();
        const action = text(raw.action, 120);
        if (!action) throw bad();
        return {
          action,
          at: historyTime(raw.occurred_at),
          actor: historyActor(raw.actor),
          role: text(raw.actor_role, 80),
          reason: text(raw.reason),
        };
      })
      .filter((entry) => entry.action !== 'report.evidence_viewed');
  }
  let access = null;
  if (value.evidence_access != null) {
    const raw = value.evidence_access;
    if (!record(raw) || !Number.isSafeInteger(raw.view_count) || Number(raw.view_count) < 0)
      throw bad();
    access = {
      count: Number(raw.view_count),
      at: historyTime(raw.last_viewed_at),
      actor: historyActor(raw.last_viewer),
    };
  }
  return { workflow, access };
}
export function appealHistory(value: Record<string, unknown>) {
  if (!record(value.appeal) || !record(value.original_decision)) throw bad();
  const appeal = value.appeal,
    original = value.original_decision;
  return {
    originalReviewer: historyActor(original.decided_by, original.decider_deleted === true),
    reviewer: historyActor(appeal.reviewed_by),
    decidedAt: historyTime(original.decided_at),
    submittedAt: historyTime(appeal.submitted_at),
    reviewedAt: historyTime(appeal.reviewed_at),
  };
}
