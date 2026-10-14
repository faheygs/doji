// Local candidate only. Database admission remains disabled until separately released.
import type { EmployeeRouteContract } from './employee-route-contracts.mts';
export const employeeWorkflowSql =
  'select portal_identity_private.employee_workflow_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result';
export const employeeWorkflowContracts: Readonly<Record<string, EmployeeRouteContract>> = {
  get_admin_safety_work_page_v1: {
    fields: ['p_queue', 'p_closed', 'p_kind', 'p_filter', 'p_limit', 'p_after_at', 'p_after_key'],
    types: ['text', 'boolean', 'text', 'text', 'integer', 'timestamp with time zone', 'text'],
    defaults: { p_closed: false, p_kind: 'all', p_filter: 'all', p_limit: 25, p_after_at: null, p_after_key: null },
  },
  get_admin_staff_work_page_v1: {
    fields: ['p_kind', 'p_filter', 'p_state', 'p_limit', 'p_after_at', 'p_after_key'],
    types: ['text', 'text', 'text', 'integer', 'timestamp with time zone', 'text'],
    defaults: {
      p_kind: 'all',
      p_filter: 'all',
      p_state: 'all',
      p_limit: 25,
      p_after_at: null,
      p_after_key: null,
    },
  },
  get_admin_staff_event_channels_v1: { fields: [], types: [], defaults: {} },
  get_admin_case_ownership_v1: {
    fields: ['p_kind', 'p_id'],
    types: ['text', 'uuid'],
    defaults: {},
  },
  admin_case_ownership_command_v1: {
    fields: [
      'p_kind',
      'p_id',
      'p_revision',
      'p_source_version',
      'p_action',
      'p_target',
      'p_request_id',
    ],
    types: ['text', 'uuid', 'bigint', 'text', 'text', 'uuid', 'uuid'],
    defaults: {},
  },
  get_admin_owned_work_page_v1: {
    fields: ['p_kind', 'p_filter', 'p_limit', 'p_after_at', 'p_after_key'],
    types: ['text', 'text', 'integer', 'timestamp with time zone', 'text'],
    defaults: { p_kind: 'all', p_filter: 'all', p_limit: 25, p_after_at: null, p_after_key: null },
  },
  get_admin_case_assignees_v1: {
    fields: ['p_kind', 'p_id', 'p_after_id', 'p_limit'],
    types: ['text', 'uuid', 'uuid', 'integer'],
    defaults: { p_after_id: null, p_limit: 25 },
  },
};
for (const contract of Object.values(employeeWorkflowContracts)) {
  Object.freeze(contract.fields);
  Object.freeze(contract.types);
  Object.freeze(contract.defaults);
  Object.freeze(contract);
}
Object.freeze(employeeWorkflowContracts);
