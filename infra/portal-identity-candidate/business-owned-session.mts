// Local owned-auth adapter. Reuses the existing verified, bound business session contract.
import {
  createBusinessCipher,
  fail,
  isVerifiedBusinessActor,
  random,
  hash,
} from './business-http-state.mts';
import type { BusinessHttpConfig, BusinessHttpDependencies } from './business-http-contracts.mts';
import type { BusinessAgreement } from './business-contracts.mts';
import type { BusinessTokens } from './workos-business-provider.mts';
import type { createBusinessOwnedGuard } from './business-owned-guard.mts';

export function createBusinessOwnedSessionInstaller(
  config: Pick<BusinessHttpConfig, 'origin' | 'clientId' | 'encryptionKey' | 'realm'>,
  deps: Pick<BusinessHttpDependencies, 'verify' | 'application' | 'provider' | 'now'> & {
    guard: Pick<ReturnType<typeof createBusinessOwnedGuard>, 'install'>;
  },
) {
  const policy = Object.freeze({ ...config });
  if (
    policy.realm !== 'business' ||
    policy.origin !== 'https://business.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId) ||
    !/^[a-f0-9]{64}$/.test(policy.encryptionKey)
  )
    throw fail(503);
  const { seal } = createBusinessCipher(policy.origin, policy.clientId, policy.encryptionKey);
  const now = deps.now ?? Date.now;
  return async (
    tokens: BusinessTokens,
    agreement: BusinessAgreement | null,
    admissionTicket: string,
    signal: AbortSignal,
  ) => {
    signal.throwIfAborted();
    if (!/^[a-f0-9]{64}$/.test(admissionTicket)) throw fail();
    const actor = await deps.verify(
      new Request(policy.origin + '/internal/verify', {
        headers: { origin: policy.origin, authorization: `Bearer ${tokens.accessToken}` },
        signal,
      }),
    );
    if (
      !isVerifiedBusinessActor(actor) ||
      actor.audience !== policy.clientId ||
      actor.issuer !== `https://api.workos.com/user_management/${policy.clientId}` ||
      actor.subject !== tokens.subject ||
      actor.expiresAtSeconds <= now() / 1000
    )
      throw fail();
    let installed = false;
    try {
      signal.throwIfAborted();
      if (agreement) await deps.application.enroll(actor, agreement, signal);
      else await deps.application.authorize(actor, signal);
      signal.throwIfAborted();
      const session = random(),
        csrf = random(),
        created = now();
      await deps.guard.install(
        admissionTicket,
        hash(session),
        seal({ tokens, actor, csrf, created, touched: created }),
        created + 28800000,
        actor,
        signal,
      );
      signal.throwIfAborted();
      installed = true;
      return session; // Caller may set ONLY the existing HttpOnly business session cookie.
    } finally {
      if (!installed)
        await deps.provider.revoke(actor.sessionId, AbortSignal.timeout(10000)).catch(() => {});
    }
  };
}
