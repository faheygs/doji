// Candidate-only allowlist. Never exposes the unfenced reset primitives or helpers.
export const businessOwnedSql: Readonly<Record<string, number>> = Object.freeze({
  'select business_session_private.reserve_owned_recovery_email_v1($1,$2) as result': 2,
  'select business_session_private.admit_owned_acceptance_v1($1,$2,$3,$4,$5) as result': 5,
  'select business_session_private.reserve_owned_acceptance_v1($1,$2,$3,$4) as result': 4,
  'select business_session_private.execute_owned_store_v1($1,$2,$3,$4,$5,$6::integer,$7,$8) as result': 8,
  'select business_session_private.admit_owned_auth_v1($1,$2,$3,$4,$5) as result': 5,
  'select business_session_private.put_owned_session_v1($1,$2,$3,$4,$5::integer,$6,$7,$8,$9) as result': 9,
  'select business_session_private.put_owned_reset_link_v1($1,$2,$3,$4,$5::bigint,$6,$7,$8) as result': 8,
  'select business_session_private.get_owned_reset_link_v1($1,$2) as result': 2,
  'select business_session_private.begin_owned_reset_link_v1($1,$2,$3,$4,$5,$6) as result': 6,
  'select business_session_private.complete_owned_reset_link_v1($1,$2,$3,$4,$5) as result': 5,
  'select business_session_private.reconcile_owned_reset_link_v1($1,$2,$3,$4,$5,$6) as result': 6,
});
