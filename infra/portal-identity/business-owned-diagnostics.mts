// Existing runtime console only: no external collector, identity or request data.
// Keep a closed vocabulary so caught provider errors/URLs can never be logged.
const categories = [
  'recovery_unconfirmed',
  'recovery_mapping_failed',
  'reset_pending',
  'reset_event_commit_failed',
  'admission_input_denied',
  'admission_sql_failed',
  'admission_denied',
  'http_unavailable',
  'registration_password_rejected',
] as const;
export type OwnedDiagnostic = (typeof categories)[number];
export function ownedDiagnostic(category: OwnedDiagnostic) {
  if (!categories.includes(category)) return;
  try {
    console.warn('business_owned_auth', category);
  } catch {
    /* Logging cannot affect fencing. */
  }
}
