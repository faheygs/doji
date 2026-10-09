import { uuid } from '../../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeOperator } from '@doji/portal-data/employee';

/** Audit metadata is not authority. Only known identifiers become independently authorized reads. */
export function auditRelatedPath(type: string, id: string | null, actor: EmployeeOperator) {
  if (!uuid(id) || !actor.capabilities.moderation_read) return null;
  if (type === 'report') return '/my-work/report/' + id + '?from=audit';
  if (type === 'moderation_appeal') return '/my-work/appeal/' + id + '?from=audit';
  return null;
}
