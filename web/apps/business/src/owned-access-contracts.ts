export type AccessStep =
  | 'signin'
  | 'register'
  | 'verify'
  | 'recover'
  | 'check-email'
  | 'reset'
  | 'reset-done'
  | 'reset-pending'
  | 'reset-invalid'
  | 'mfa'
  | 'complete';
export type AccessAction = 'signin' | 'register' | 'verify' | 'recover' | 'reset' | 'mfa';
/** The adapter returns display state, never provider credentials or cookies.
 * Reset adapters must return reset-pending after any uncertain dispatch; rejection
 * is reserved for failures before the password-change request is submitted.
 */
export type AccessTransport = (
  action: AccessAction,
  fields: Record<string, string | boolean>,
  signal: AbortSignal,
) => Promise<{ step: AccessStep; codeRejected?: true }>;
