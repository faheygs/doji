/** Backend diagnostics stay in the command gateway; only known safe copy reaches the form. */
export function profileSetupError(error: unknown, profileConfirmed: boolean): string {
  if (profileConfirmed) {
    return 'Your profile was saved, but Doji could not finish loading your account. Close and reopen the app to continue.';
  }
  if (
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P0001' &&
    'message' in error &&
    error.message === 'Current Terms of Use and Privacy Policy must be accepted'
  ) {
    return 'Your account is missing the required Terms of Use and Privacy Policy acceptance. Contact support to finish account setup.';
  }
  return 'Doji could not confirm that your profile was saved. Check your connection, then reopen the app to check your account before trying again.';
}
