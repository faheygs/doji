import { isTransientApiError } from './apiRetry';
import { pushRegistrationRetryDelay } from './pushRegistrationPolicy';
import { awaitRegistration, isPushRegistrationInterrupted, registrationDelay } from './pushRegistrationCancellation';

/** Firebase GmsRpc's retryable token errors, including Expo's Java exception wrapper. */
export function isTransientPushRegistrationError(error: unknown): boolean {
  const message = error && typeof error === 'object' && 'message' in error
    ? String(error.message) : typeof error === 'string' ? error : '';
  // Do not classify arbitrary native/configuration failures as recoverable.
  const nativeTokenFailure = /Fetching the token failed:/.test(message);
  if (nativeTokenFailure) {
    return /(?:^|[\s:])(?:SERVICE_NOT_AVAILABLE|INTERNAL_SERVER_ERROR|InternalServerError)\s*$/.test(message);
  }
  return isTransientApiError(error);
}

/** One lifecycle-triggered run; no polling, four attempts at most. */
export async function retryPushRegistration(
  register: () => Promise<boolean>,
  cancelled: () => boolean,
  onRetry: (error: unknown, attempt: number) => void,
  signal?: AbortSignal,
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (cancelled() || signal?.aborted) return false;
    try {
      // False means registration is no longer applicable (permission/session changed).
      return await awaitRegistration(register(), signal);
    } catch (error) {
      if (cancelled() || signal?.aborted || isPushRegistrationInterrupted(error)) return false;
      const delay = pushRegistrationRetryDelay(attempt);
      if (delay == null || !isTransientPushRegistrationError(error)) throw error;
      onRetry(error, attempt + 1);
      try { await registrationDelay(delay, signal); }
      catch (interruption) {
        if (isPushRegistrationInterrupted(interruption)) return false;
        throw interruption;
      }
    }
  }
  return false;
}
