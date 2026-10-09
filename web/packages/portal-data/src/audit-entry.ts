import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;
export function auditEntry(entry: unknown) {
  if (
    !record(entry) ||
    !uuid(entry.id) ||
    !text(entry.occurred_at, 80) ||
    !Number.isFinite(Date.parse(entry.occurred_at)) ||
    !text(entry.action, 120) ||
    !text(entry.entity_type, 80) ||
    !text(entry.entity_id, 160) ||
    !(entry.reason === null || text(entry.reason, 1000)) ||
    !['access', 'decision', 'system'].includes(String(entry.category))
  )
    throw Error('Audit entry could not be verified.');
  const actor = entry.actor;
  if (
    actor !== null &&
    (!record(actor) ||
      !uuid(actor.id) ||
      !(actor.display_name === null || text(actor.display_name, 160)) ||
      !(actor.username === null || text(actor.username, 160)))
  )
    throw Error('Audit actor could not be verified.');
  if (
    (entry.request_id != null && !text(entry.request_id, 160)) ||
    (entry.actor_role != null && !text(entry.actor_role, 80)) ||
    (entry.metadata != null && !record(entry.metadata))
  )
    throw Error('Audit details could not be verified.');
  const metadata = entry.metadata == null ? null : JSON.stringify(entry.metadata);
  if (metadata && metadata.length > 32768) throw Error('Audit details exceed the display limit.');
  return {
    id: entry.id,
    at: entry.occurred_at,
    action: entry.action,
    entityType: entry.entity_type,
    entityId: entry.entity_id,
    reason: entry.reason ?? '',
    category: String(entry.category),
    actorId: record(actor) ? String(actor.id) : null,
    actor: record(actor)
      ? String(actor.display_name || actor.username || 'Employee')
      : 'System / former actor',
    actorRole: entry.actor_role == null ? null : String(entry.actor_role),
    requestId: entry.request_id == null ? null : String(entry.request_id),
    metadata,
  };
}
export type AuditEntry = ReturnType<typeof auditEntry>;
