// LOCAL PREPARATION ONLY. Mounted only in the default-off owned runtime mode.
// Uses the durable reset-link adapter; live provider delivery remains a release gate.
import { createHash, createHmac } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { ownedDiagnostic } from './business-owned-diagnostics.mts';
import type { createBusinessOwnedGuard } from './business-owned-guard.mts';
import type { createBusinessOwnedProvider } from './business-owned-provider.mts';
import type { createBusinessOwnedResetStore } from './business-owned-reset-store.mts';

export interface OwnedResetMapping {
  realm: 'business';
  origin: string;
  issuer: string;
  audience: string;
  subject: string;
  tokenHash: string;
  identityKey: string;
  resetId: string;
  expires: number;
}
interface Policy {
  enabled: boolean;
  sendingEnabled: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  operationHmacKey: string;
}
export interface OwnedResetDependencies {
  provider: Pick<ReturnType<typeof createBusinessOwnedProvider>, 'reset'>;
  guard: Pick<ReturnType<typeof createBusinessOwnedGuard>, 'admit'> &
    Pick<ReturnType<typeof createBusinessOwnedResetStore>, 'beginReset' | 'completeReset'>;
  // Lookup MUST be durable and populated from verified provider reset metadata,
  // not a browser-supplied subject/email or guessed contents of the reset token.
  // Null/expired/unknown tokens never fence an account or call the provider.
  resolve: (tokenHash: string, signal: AbortSignal) => Promise<OwnedResetMapping | null>;
  verifyProof: (proof: unknown, signal: AbortSignal) => Promise<boolean>;
  trustedClientIp: string;
  now?: () => number;
}
const denied = () => Error('Business password reset could not be completed.');
const digest = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);

export function createBusinessOwnedReset(config: Policy, deps: OwnedResetDependencies) {
  const policy = Object.freeze({ ...config });
  if (
    policy.realm !== 'business' ||
    policy.origin !== 'https://business.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId) ||
    !digest(policy.operationHmacKey)
  )
    throw denied();
  const issuer = `https://api.workos.com/user_management/${policy.clientId}`;
  const now = deps.now ?? Date.now;
  return async (token: string, password: string, proof: unknown, signal: AbortSignal) => {
    if (policy.enabled !== true || policy.sendingEnabled !== true) throw denied();
    signal.throwIfAborted();
    if (!token || token.length > 8192 || !password || password.length > 256) throw denied();
    if (!(await deps.verifyProof(proof, signal))) throw denied();
    signal.throwIfAborted();
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const mapping = await deps.resolve(tokenHash, signal);
    signal.throwIfAborted();
    if (
      !mapping ||
      mapping.realm !== 'business' ||
      mapping.origin !== policy.origin ||
      mapping.issuer !== issuer ||
      mapping.audience !== policy.clientId ||
      mapping.tokenHash !== tokenHash ||
      !digest(mapping.identityKey) ||
      !/^password_reset_[A-Za-z0-9]{1,80}$/.test(mapping.resetId) ||
      !/^user_[A-Za-z0-9]{1,80}$/.test(mapping.subject) ||
      !Number.isSafeInteger(mapping.expires) ||
      mapping.expires <= now()
    )
      throw denied();
    await deps.guard.admit('reset', mapping.identityKey, deps.trustedClientIp, signal);
    signal.throwIfAborted();
    // Stable across retries, processes and browser sessions; no raw token in DB.
    const operation = createHmac('sha256', Buffer.from(policy.operationHmacKey, 'hex'))
      .update(`${policy.origin}|${policy.clientId}|reset|${tokenHash}`)
      .digest('hex');
    let state: 'started' | 'pending' | 'complete';
    try {
      // The fence and old-session deletion MUST commit before provider mutation.
      state = await deps.guard.beginReset(operation, mapping.subject, signal, tokenHash);
    } catch {
      // The fence may have committed despite a lost DB response. Never guess.
      ownedDiagnostic('reset_pending');
      return { step: 'reset-pending' as const };
    }
    if (state === 'complete') return { step: 'reset-done' as const };
    if (state !== 'started') return { step: 'reset-pending' as const };
    try {
      signal.throwIfAborted();
      if (mapping.expires <= now()) throw denied();
      const subject = await deps.provider.reset(token, password, signal);
      if (subject !== mapping.subject) throw denied();
      // A known provider success must finish fencing even if the browser leaves.
      // This is one bounded DB command, never a retry of the provider mutation.
      await deps.guard.completeReset(operation, mapping.subject, AbortSignal.timeout(4000));
      return { step: 'reset-done' as const };
    } catch {
      // Unknown provider/receipt outcomes retain the durable pending fence.
      ownedDiagnostic('reset_pending');
      // A retry can read a committed receipt but CANNOT redispatch the reset.
      // Only exact signed success evidence may reconcile an uncertain operation.
      // No background polling, automatic unlocking, or success assertion.
      return { step: 'reset-pending' as const };
    }
  };
}
