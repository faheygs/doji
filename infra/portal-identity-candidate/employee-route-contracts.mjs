// Captured from reviewed existing employee RPCs; no runtime catalog discovery.
export const employeeRouteContracts = {
  admin_business_application_command_v1: {
    fields: ['p_id', 'p_revision', 'p_action', 'p_response', 'p_internal_note', 'p_request_id'],
    types: ['uuid', 'bigint', 'text', 'text', 'text', 'uuid'],
    defaults: {},
    sourceHash: 'bf751f554c8e1259390ee92123d2f308',
  },
  admin_business_privacy_command_v1: {
    fields: [
      'p_case_id',
      'p_revision',
      'p_action',
      'p_reference',
      'p_request_id',
      'p_details',
      'p_application_revision',
    ],
    types: ['uuid', 'bigint', 'text', 'text', 'uuid', 'jsonb', 'bigint'],
    defaults: {
      p_details: null,
      p_application_revision: null,
    },
    sourceHash: 'd7fed622f90b80dc87a80ae259d0f187',
  },
  admin_business_privacy_open_v1: {
    fields: ['p_account_id', 'p_kind', 'p_verification_reference', 'p_due_at', 'p_request_id'],
    types: ['uuid', 'text', 'text', 'timestamp with time zone', 'uuid'],
    defaults: {},
    sourceHash: 'b8cabafea7667d9e3c1f327ead046f0b',
  },
  admin_create_safety_report_v1: {
    fields: ['p_id', 'p_revision', 'p_command_id', 'p_input'],
    types: ['uuid', 'bigint', 'uuid', 'jsonb'],
    defaults: {},
    sourceHash: 'de3e621534fa9d5d851bddf43eda60f1',
  },
  admin_decide_report_v3: {
    fields: [
      'p_report_id',
      'p_action',
      'p_policy_code',
      'p_severity',
      'p_reason',
      'p_user_notice',
      'p_account_action',
      'p_restriction_days',
      'p_idempotency_key',
    ],
    types: ['uuid', 'text', 'text', 'text', 'text', 'text', 'text', 'integer', 'text'],
    defaults: {
      p_account_action: null,
      p_restriction_days: null,
      p_idempotency_key: null,
    },
    sourceHash: 'a6ffe0d8a6e9c22c3e972e39ce791232',
  },
  admin_editorial_command_v1: {
    fields: ['p_kind', 'p_action', 'p_id', 'p_version', 'p_input', 'p_reason', 'p_idempotency_key'],
    types: ['text', 'text', 'uuid', 'text', 'jsonb', 'text', 'text'],
    defaults: {},
    sourceHash: 'f0903da1f6f85cf50360a8f5e0e88f2a',
  },
  admin_review_moderation_appeal: {
    fields: ['p_appeal_id', 'p_outcome', 'p_reason', 'p_idempotency_key'],
    types: ['uuid', 'text', 'text', 'text'],
    defaults: {},
    sourceHash: '9c69f3f6b20979366b3cf964630f60ff',
  },
  admin_safety_removal_command_v1: {
    fields: ['p_id', 'p_revision', 'p_command_id', 'p_input'],
    types: ['uuid', 'bigint', 'uuid', 'jsonb'],
    defaults: {},
    sourceHash: '6e28bc2450367c539a48a8ec485a6a0c',
  },
  admin_set_employee_role_v1: {
    fields: ['p_username', 'p_role', 'p_active', 'p_reason', 'p_idempotency_key'],
    types: ['text', 'text', 'boolean', 'text', 'text'],
    defaults: {},
    sourceHash: 'ac482dc21a64bb284e97993f98682a59',
  },
  admin_set_report_review_state_v1: {
    fields: ['p_report_id', 'p_action', 'p_reason', 'p_idempotency_key'],
    types: ['uuid', 'text', 'text', 'text'],
    defaults: {},
    sourceHash: 'f3d4b73e3012973160277e008f81072b',
  },
  admin_triage_report: {
    fields: ['p_report_id', 'p_action', 'p_priority', 'p_note', 'p_idempotency_key'],
    types: ['uuid', 'text', 'text', 'text', 'text'],
    defaults: {},
    sourceHash: 'e20a860d0932c0e4a9a918849b5b3769',
  },
  get_admin_appeal_case_v1: {
    fields: ['p_appeal_id'],
    types: ['uuid'],
    defaults: {},
    sourceHash: '3df37df0b69bbce87783e4a341000c44',
  },
  get_admin_appeals_snapshot: {
    fields: ['p_limit'],
    types: ['integer'],
    defaults: {
      p_limit: 20,
    },
    sourceHash: 'b4a680f8961e3e275c8d16946ee89efb',
  },
  get_admin_audit_export_v1: {
    fields: ['p_category', 'p_search'],
    types: ['text', 'text'],
    defaults: {
      p_category: 'activity',
      p_search: null,
    },
    sourceHash: '5e429980c2fbbcde1147178c3476a2a6',
  },
  get_admin_audit_page_v2: {
    fields: ['p_limit', 'p_before_occurred_at', 'p_before_id', 'p_category', 'p_search'],
    types: ['integer', 'timestamp with time zone', 'uuid', 'text', 'text'],
    defaults: {
      p_limit: 50,
      p_before_occurred_at: null,
      p_before_id: null,
      p_category: 'activity',
      p_search: null,
    },
    sourceHash: '801b1d541e19f1fa09c3eec118a08e4d',
  },
  get_admin_business_application_v1: {
    fields: ['p_id'],
    types: ['uuid'],
    defaults: {},
    sourceHash: '8489d3be07fc56df9d2ba7d0b3cab5eb',
  },
  get_admin_business_applications_page_v1: {
    fields: ['p_state', 'p_limit', 'p_after_at', 'p_after_id'],
    types: ['text', 'integer', 'timestamp with time zone', 'uuid'],
    defaults: {
      p_state: 'pending',
      p_limit: 25,
      p_after_at: null,
      p_after_id: null,
    },
    sourceHash: 'c98e9ebbda0751788301fd725577bd69',
  },
  get_admin_business_privacy_access_v1: {
    fields: ['p_case_id', 'p_after_revision'],
    types: ['uuid', 'bigint'],
    defaults: {
      p_after_revision: 0,
    },
    sourceHash: 'eca13af4ac5ad950186f36ee4e5a0db8',
  },
  get_admin_business_privacy_case_v1: {
    fields: ['p_case_id', 'p_after_revision'],
    types: ['uuid', 'bigint'],
    defaults: {
      p_after_revision: 0,
    },
    sourceHash: 'ab0bc6506880882aa0ae03fcf8d46549',
  },
  get_admin_business_privacy_correction_v1: {
    fields: ['p_case_id'],
    types: ['uuid'],
    defaults: {},
    sourceHash: '6559d44f263f5604c4f84fe6d50148dc',
  },
  get_admin_business_privacy_page_v1: {
    fields: ['p_state', 'p_after_due', 'p_after_id'],
    types: ['text', 'timestamp with time zone', 'uuid'],
    defaults: {
      p_after_due: null,
      p_after_id: null,
    },
    sourceHash: '4538fee50ec40556b73d53b92558b7cf',
  },
  get_admin_command_center_snapshot_v2: {
    fields: ['p_limit'],
    types: ['integer'],
    defaults: {
      p_limit: 20,
    },
    sourceHash: '46111e99c3b3a3de999913f49c19e255',
  },
  get_admin_editorial_item_v1: {
    fields: ['p_kind', 'p_id'],
    types: ['text', 'uuid'],
    defaults: {},
    sourceHash: '6872d040141c1018595deafdd9a22176',
  },
  get_admin_editorial_page_v1: {
    fields: ['p_kind', 'p_limit', 'p_before_at', 'p_before_id', 'p_filter'],
    types: ['text', 'integer', 'timestamp with time zone', 'uuid', 'text'],
    defaults: {
      p_limit: 25,
      p_before_at: null,
      p_before_id: null,
      p_filter: 'all',
    },
    sourceHash: '0f8effc0b5b414d0a948fe7f20d8b7d8',
  },
  get_admin_employee_directory_v1: {
    fields: [],
    types: [],
    defaults: {},
    sourceHash: '618b6c207fd6eace2a4ee44ef17eb2f2',
  },
  get_admin_event_health_history_v1: {
    fields: ['p_limit'],
    types: ['integer'],
    defaults: {
      p_limit: 12,
    },
    sourceHash: '63e23827579846f092fcb34ee2f7ab4d',
  },
  get_admin_operational_health_read_v1: {
    fields: [],
    types: [],
    defaults: {},
    sourceHash: '3bc60575c29cfba5793ab0456865e029',
  },
  get_admin_portal_session_v3: {
    fields: [],
    types: [],
    defaults: {},
    sourceHash: '3a361cf2693ef0e18ee74ea7f3c17d50',
  },
  get_admin_report_case_v2: {
    fields: ['p_report_id'],
    types: ['uuid'],
    defaults: {},
    sourceHash: '27995ee4e6a2612bf7f52b9e1aff3f19',
  },
  get_admin_report_case_v3: {
    fields: ['p_report_id'],
    types: ['uuid'],
    defaults: {},
    sourceHash: '24af2a88bc43bc9a7defeb3e042d29e3',
  },
  get_admin_resolved_reports_page_v1: {
    fields: ['p_limit', 'p_before_resolved_at', 'p_before_report_id'],
    types: ['integer', 'timestamp with time zone', 'uuid'],
    defaults: {
      p_limit: 25,
      p_before_resolved_at: null,
      p_before_report_id: null,
    },
    sourceHash: '1c9eff105d64574f142f7fa032c9160a',
  },
  get_admin_safety_removal_v1: {
    fields: ['p_id'],
    types: ['uuid'],
    defaults: {},
    sourceHash: 'b3cd4becea1ae91332d699214d88520b',
  },
  get_admin_safety_removals_v1: {
    fields: ['p_after_at', 'p_after_id', 'p_closed', 'p_queue'],
    types: ['timestamp with time zone', 'uuid', 'boolean', 'text'],
    defaults: {
      p_after_at: null,
      p_after_id: null,
      p_closed: false,
      p_queue: 'restricted_safety',
    },
    sourceHash: 'bc1fce8fbd51bd3abb68eab1571a72b7',
  },
  get_admin_safety_target_v1: {
    fields: ['p_case_id', 'p_kind', 'p_target_id'],
    types: ['uuid', 'text', 'uuid'],
    defaults: {},
    sourceHash: 'd41b451d9c8b9dff4f4ea1138451e9a2',
  },
  get_admin_work_queue_page_v1: {
    fields: ['p_limit', 'p_queue', 'p_filter', 'p_search', 'p_after_at', 'p_after_id'],
    types: ['integer', 'text', 'text', 'text', 'timestamp with time zone', 'text'],
    defaults: {
      p_limit: 25,
      p_queue: 'all',
      p_filter: 'all',
      p_search: null,
      p_after_at: null,
      p_after_id: null,
    },
    sourceHash: '56ef9b4240de033088063dbe7f030fc4',
  },
};
// Additional private-resource authorization contracts, not general data routes.
employeeRouteContracts.get_admin_realtime_token_capabilities = {
  fields: [],
  types: [],
  defaults: {},
};
employeeRouteContracts.portal_evidence_authorization_v1 = {
  fields: ['p_bucket', 'p_path'],
  types: ['text', 'text'],
  defaults: {},
};
for (const c of Object.values(employeeRouteContracts)) {
  Object.freeze(c.fields);
  Object.freeze(c.types);
  Object.freeze(c.defaults);
  Object.freeze(c);
}
Object.freeze(employeeRouteContracts);
