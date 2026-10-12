import type { EmployeeRouteContract } from './employee-route-contracts.mts';
export const employeeHistorySql =
  'select portal_identity_private.employee_history_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result';
export const employeeHistoryContracts: Readonly<Record<string, EmployeeRouteContract>> =
  Object.freeze({
    get_admin_personal_work_page_v1: Object.freeze({
      fields: Object.freeze(['p_kind', 'p_state', 'p_limit', 'p_after_at', 'p_after_key']),
      types: Object.freeze([
        'text',
        'text',
        'integer',
        'timestamp with time zone',
        'text',
      ] as const),
      defaults: Object.freeze({}),
    }),
    get_admin_announcement_lifecycle_page_v1: Object.freeze({
      fields: Object.freeze(['p_filter', 'p_limit', 'p_before_at', 'p_before_id']),
      types: Object.freeze(['text', 'integer', 'timestamp with time zone', 'uuid'] as const),
      defaults: Object.freeze({}),
    }),
  });
