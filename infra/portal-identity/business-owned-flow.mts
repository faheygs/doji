// LOCAL PREPARATION ONLY. Runtime composition is opt-in and remains undeployed.
// Assembly supplies atomic admission, verification/enrollment and guarded install.
import { random, hash, opaque, equal, createBusinessCipher } from './business-http-state.mts';
import { isRecord } from './business-contracts.mts';
import type { BusinessAgreement } from './business-contracts.mts';
import type { BusinessTokens } from './workos-business-provider.mts';
import type { createBusinessOwnedProvider, OwnedGrant } from './business-owned-provider.mts';
import { OwnedCodeRejected } from './business-owned-provider.mts';
import { ownedDiagnostic } from './business-owned-diagnostics.mts';
import type { createBusinessSessionStore } from './business-session-store.mts';
import type { createBusinessOwnedGuard } from './business-owned-guard.mts';
import type { createBusinessOwnedResetStore } from './business-owned-reset-store.mts';
import type { createBusinessRecoveryEmail } from './business-owned-recovery-email.mts';
export interface OwnedFlowPolicy {
  enabled: boolean;
  sendingEnabled: boolean;
  origin: string;
  clientId: string;
  encryptionKey: string;
  termsVersion: string;
  privacyVersion: string;
}
export interface OwnedFlowDependencies {
  provider: ReturnType<typeof createBusinessOwnedProvider>;
  store: Pick<ReturnType<typeof createBusinessSessionStore>, 'putFlow' | 'consumeFlow'>;
  guard: Pick<ReturnType<typeof createBusinessOwnedGuard>, 'identityKey' | 'admit'>;
  // Server-verified ingress metadata, never a browser body or forwarded header.
  trustedClientIp: string;
  rememberReset: ReturnType<typeof createBusinessOwnedResetStore>['remember'];
  recoveryEmail?: ReturnType<typeof createBusinessRecoveryEmail>;
  reserveRecoveryEmail?: (ticket: string, signal: AbortSignal) => Promise<boolean>;
  verifyProof: (
    action: 'signin' | 'register' | 'verify' | 'mfa' | 'recover' | 'reset',
    proof: unknown,
    signal: AbortSignal,
  ) => Promise<boolean>;
  // Must commit before provider create; ambiguous reservations are never refunded.
  reserve: (
    requestId: string,
    agreement: BusinessAgreement,
    signal: AbortSignal,
    identityKey: string,
  ) => Promise<boolean>;
  install: (
    tokens: BusinessTokens,
    agreement: BusinessAgreement | null,
    admissionTicket: string,
    signal: AbortSignal,
  ) => Promise<void>;
  now?: () => number;
}
const denied = () => Error('Business authentication could not be completed.');
const digest = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function createBusinessOwnedFlow(config: OwnedFlowPolicy, deps: OwnedFlowDependencies) {
  const policy = Object.freeze({ ...config });
  if (
    policy.origin !== 'https://business.dojipro.com' ||
    !policy.termsVersion ||
    !policy.privacyVersion
  )
    throw denied();
  const { seal, open } = createBusinessCipher<Record<string, unknown>>(
    policy.origin,
    policy.clientId,
    policy.encryptionKey,
  );
  const now = deps.now ?? Date.now;
  function gate(signal: AbortSignal) {
    if (policy.enabled !== true || policy.sendingEnabled !== true) throw denied();
    signal.throwIfAborted();
  }
  async function verifyProof(
    action: Parameters<OwnedFlowDependencies['verifyProof']>[0],
    proof: unknown,
    signal: AbortSignal,
  ) {
    gate(signal);
    if (!(await deps.verifyProof(action, proof, signal))) throw denied();
    signal.throwIfAborted();
  }
  async function admit(
    action: Parameters<OwnedFlowDependencies['verifyProof']>[0],
    identityKey: string,
    signal: AbortSignal,
  ) {
    const ticket = await deps.guard.admit(action, identityKey, deps.trustedClientIp, signal);
    signal.throwIfAborted();
    if (!digest(ticket)) throw denied();
    return ticket;
  }
  async function finish(
    grant: OwnedGrant,
    agreement: BusinessAgreement | null,
    binding: string,
    signal: AbortSignal,
    admission: { ticket: string; identityKey: string },
    expectedSubject: string | null = null,
    expires = now() + 300000,
    attempts = 0,
  ) {
    signal.throwIfAborted();
    if (expires <= now() || attempts > 5) throw denied();
    if (grant.kind === 'verified') {
      if (expectedSubject && grant.tokens.subject !== expectedSubject) throw denied();
      await deps.install(grant.tokens, agreement, admission.ticket, signal);
      return { step: 'complete' as const };
    }
    if (attempts >= 5) throw denied();
    if (grant.kind === 'mfa') {
      if (expectedSubject && grant.subject !== expectedSubject) throw denied();
      expectedSubject = grant.subject;
      expires = Math.min(expires, grant.expires);
      if (expires <= now()) throw denied();
    }
    const handle = random();
    await deps.store.putFlow(
      hash(handle),
      seal({
        purpose: grant.kind === 'mfa' ? 'owned-mfa' : 'owned-email',
        binding: hash(binding),
        pendingToken: grant.pendingToken,
        agreement,
        expectedSubject,
        expires,
        attempts,
        admissionTicket: admission.ticket,
        identityKey: admission.identityKey,
        ...(grant.kind === 'mfa' ? { challengeId: grant.challengeId } : {}),
      }),
      expires,
      signal,
    );
    // Handle goes in a Secure/HttpOnly/SameSite cookie in the gated HTTP adapter.
    // Neither this handle nor provider pendingToken belongs in browser storage.
    return { step: grant.kind === 'mfa' ? ('mfa' as const) : ('verify' as const), handle };
  }
  return Object.freeze({
    async start(
      input: {
        signup: boolean;
        email: string;
        password: string;
        agreement?: BusinessAgreement;
        proof: unknown;
      },
      binding: string,
      signal: AbortSignal,
    ) {
      if (!opaque(binding)) throw denied();
      const agreement = input.signup ? input.agreement : null;
      if (
        input.signup &&
        (!agreement ||
          agreement.termsAccepted !== true ||
          agreement.privacyAcknowledged !== true ||
          agreement.country !== 'US' ||
          agreement.termsVersion !== policy.termsVersion ||
          agreement.privacyVersion !== policy.privacyVersion)
      )
        throw denied();
      const action = input.signup ? 'register' : 'signin';
      gate(signal);
      const identityKey = deps.guard.identityKey(input.email);
      const expires = now() + 300000;
      const ticket = await admit(action, identityKey, signal);
      await verifyProof(action, input.proof, signal);
      let expectedSubject: string | null = null;
      if (input.signup && agreement) {
        if (!(await deps.reserve(random(), agreement, signal, identityKey))) throw denied();
        signal.throwIfAborted();
        expectedSubject = await deps.provider.create(input.email, input.password, signal);
      }
      const grant = await deps.provider.password(input.email, input.password, signal);
      return finish(
        grant,
        agreement ?? null,
        binding,
        signal,
        { ticket, identityKey },
        expectedSubject,
        expires,
      );
    },
    async verify(
      handle: string,
      binding: string,
      code: string,
      proof: unknown,
      signal: AbortSignal,
      action: 'verify' | 'mfa' = 'verify',
    ) {
      if (!opaque(handle) || !opaque(binding) || !/^\d{6}$/.test(code)) throw denied();
      gate(signal);
      const stored = await deps.store.consumeFlow(
        hash(handle),
        (envelope) => {
          const value = open(envelope);
          return (
            isRecord(value) &&
            value.purpose === (action === 'mfa' ? 'owned-mfa' : 'owned-email') &&
            typeof value.expires === 'number' &&
            value.expires > now() &&
            equal(value.binding, hash(binding))
          );
        },
        signal,
      );
      if (!stored) throw denied();
      const value = open(stored);
      if (
        !isRecord(value) ||
        typeof value.pendingToken !== 'string' ||
        value.pendingToken.length < 1 ||
        value.pendingToken.length > 8192 ||
        typeof value.expires !== 'number' ||
        typeof value.attempts !== 'number' ||
        !Number.isSafeInteger(value.attempts) ||
        value.attempts < 0 ||
        value.attempts >= 5 ||
        !digest(value.admissionTicket) ||
        !digest(value.identityKey) ||
        (action === 'mfa' &&
          (typeof value.challengeId !== 'string' ||
            !/^auth_challenge_[A-Za-z0-9]+$/.test(value.challengeId) ||
            typeof value.expectedSubject !== 'string')) ||
        !(value.expectedSubject === null || typeof value.expectedSubject === 'string')
      )
        throw denied();
      // Charge the original identity, not a new browser-supplied email. Only the
      // atomic consume winner can charge/call the provider. A denied budget ends
      // this continuation; it must not be restored or retried automatically.
      await admit(action, value.identityKey, signal);
      await verifyProof(action, proof, signal);
      const admission = { ticket: value.admissionTicket, identityKey: value.identityKey };
      const a = value.agreement;
      if (
        a !== null &&
        (!isRecord(a) ||
          a.termsAccepted !== true ||
          a.privacyAcknowledged !== true ||
          a.country !== 'US' ||
          a.termsVersion !== policy.termsVersion ||
          a.privacyVersion !== policy.privacyVersion)
      )
        throw denied();
      // Consume before HTTP. A retry gets a new one-use handle, with the ORIGINAL
      // deadline/consent/identity and a shared five-attempt cap across all steps.
      let grant: OwnedGrant;
      try {
        grant =
          action === 'mfa'
            ? await deps.provider.mfa(value.pendingToken, value.challengeId as string, code, signal)
            : await deps.provider.verify(value.pendingToken, code, signal);
      } catch (error) {
        if (!(error instanceof OwnedCodeRejected)) throw error;
        grant =
          action === 'mfa'
            ? {
                kind: 'mfa',
                pendingToken: value.pendingToken,
                subject: value.expectedSubject as string,
                challengeId: value.challengeId as string,
                expires: value.expires,
              }
            : { kind: 'email', pendingToken: value.pendingToken };
        const retry = await finish(
          grant,
          a as BusinessAgreement | null,
          binding,
          signal,
          admission,
          value.expectedSubject,
          value.expires,
          value.attempts + 1,
        );
        return { ...retry, codeRejected: true as const };
      }
      return finish(
        grant,
        a as BusinessAgreement | null,
        binding,
        signal,
        admission,
        value.expectedSubject,
        value.expires,
        value.attempts + 1,
      );
    },
    async recover(email: string, proof: unknown, signal: AbortSignal) {
      gate(signal);
      const identityKey = deps.guard.identityKey(email);
      const ticket = await admit('recover', identityKey, signal);
      await verifyProof('recover', proof, signal);
      // Neither nonexistent users nor provider response details reach the caller.
      let phase: 'recovery_unconfirmed' | 'recovery_mapping_failed' = 'recovery_unconfirmed';
      try {
        if (!deps.recoveryEmail || !deps.reserveRecoveryEmail) throw denied();
        deps.recoveryEmail.assertReady(signal);
        // Commit the bounded budget before creating a provider token. Unknown
        // outcomes spend the slot, with no refund or automatic resend.
        if (!(await deps.reserveRecoveryEmail(ticket, signal))) throw denied();
        await deps.provider.recover(email, signal, async (metadata, token) => {
          phase = 'recovery_mapping_failed';
          await deps.rememberReset(metadata, identityKey, signal);
          phase = 'recovery_unconfirmed';
          await deps.recoveryEmail!.send(email, metadata, token, signal);
        });
      } catch {
        ownedDiagnostic(phase);
        // Neutral acknowledgement; never invent a missing token mapping.
      }
      signal.throwIfAborted();
      return { step: 'check-email' as const };
    },
  });
}
