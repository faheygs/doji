// Local preparation only. A separate server gate and SQL bridge are required.
import type { EmployeeRouteContract } from './employee-route-contracts.mts';
export const employeeAnnouncementSql =
  'select portal_identity_private.employee_announcement_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result';
export const employeeAnnouncementContract: EmployeeRouteContract = Object.freeze({
  fields: Object.freeze(['p_action', 'p_id', 'p_version', 'p_input', 'p_request_id']),
  types: Object.freeze(['text', 'uuid', 'text', 'jsonb', 'uuid'] as const),
  defaults: Object.freeze({}),
});
