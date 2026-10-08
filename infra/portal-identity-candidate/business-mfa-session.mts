// Called only inside the existing CSRF-checked, authorized durable session lease.
import { fail } from './business-http-state.mts';
import type { SavedSession } from './business-http-state.mts';
import type { createBusinessMfa } from './business-mfa.mts';
export async function businessMfaCommand(
  path: string,
  input: Record<string, unknown> | null,
  saved: SavedSession,
  persist: () => Promise<void>,
  mfa: ReturnType<typeof createBusinessMfa>,
  signal: AbortSignal,
  now = Date.now,
) {
  if (!input) throw fail(400);
  if (path === '/auth/mfa/prepare') {
    if (Object.keys(input).length !== 1 || typeof input.enroll !== 'boolean') throw fail(400);
    if ((saved.mfaNextAt ?? 0) > now() || (saved.mfaAttempts ?? 0) >= 5) throw fail(429);
    saved.mfaAttempts = (saved.mfaAttempts ?? 0) + 1;
    saved.mfaNextAt = now() + 30000;
    delete saved.mfaPending;
    await persist(); // Persist admission before any provider call; no automatic retry.
    const result = await mfa.prepare(saved.actor, input.enroll, signal);
    if ('pending' in result) {
      saved.mfaPending = result.pending;
      await persist();
      return {
        challengeReady: true,
        ...(result.enrollmentSecret ? { enrollmentSecret: result.enrollmentSecret } : {}),
      };
    }
    saved.mfaNextAt = 0; // Permit the explicitly requested enrollment next; session cap still applies.
    await persist();
    return { enrollmentRequired: true };
  }
  if (
    path !== '/auth/mfa/complete' ||
    Object.keys(input).length !== 1 ||
    typeof input.code !== 'string' ||
    !/^\d{6}$/.test(input.code)
  )
    throw fail(400);
  const pending = saved.mfaPending;
  delete saved.mfaPending;
  await persist(); // One attempt per challenge, consumed before crossing network boundary.
  saved.mfaReceipt = await mfa.complete(saved.actor, pending, input.code, signal);
  saved.actor = mfa.attest(saved.actor, saved.mfaReceipt);
  signal.throwIfAborted();
  await persist();
  return { assurance: 'aal2' };
}
