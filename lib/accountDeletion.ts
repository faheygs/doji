export type AccountDeletionFailure = {
  message: string;
  reference?: string;
  status?: number;
};

// Never display provider bodies/SQL detail or infer failure from a lost response.
export async function accountDeletionFailure(error: unknown): Promise<AccountDeletionFailure> {
  const response = (error as { context?: Response } | null)?.context;
  const status = typeof response?.status === 'number' ? response.status : undefined;
  let reference: string | undefined;
  try {
    const body = await response?.clone().json();
    if (typeof body?.requestId === 'string' && /^[0-9a-f-]{36}$/i.test(body.requestId)) reference = body.requestId;
  } catch { /* No raw provider error is safe user-facing copy. */ }
  const message = status === 401
    ? 'Your session could not be verified. Sign in again before retrying account deletion.'
    : 'We couldn’t confirm that your account was deleted. Check your connection and try again, or contact support.';
  return { message, reference, status };
}

export function isAccountDeletionConfirmed(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { ok?: unknown }).ok === true;
}
